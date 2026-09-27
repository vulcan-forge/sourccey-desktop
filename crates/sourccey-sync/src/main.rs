#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod catalog;
mod database;
mod paths;
mod startup;
mod uploader;

use database::SyncDatabase;
use fs2::FileExt;
use paths::SyncPaths;
use sourccey_sync_core::{read_completion_event, read_control_command, SyncRequest};
use std::fs::{self, File, OpenOptions};
use std::path::Path;
use std::thread;
use std::time::{Duration, Instant};

const SERVICE_TICK_INTERVAL: Duration = Duration::from_secs(5);
const CATALOG_RECONCILE_INTERVAL: Duration = Duration::from_secs(10 * 60);
const UPLOAD_ATTEMPT_INTERVAL: Duration = Duration::from_secs(30);

fn main() {
    if let Err(error) = run_command() {
        eprintln!("sourccey-sync: {error}");
        std::process::exit(1);
    }
}

fn run_command() -> Result<(), String> {
    let mut arguments = std::env::args().skip(1);
    match arguments.next().as_deref().unwrap_or("run") {
        "run" => run_service(arguments.any(|argument| argument == "--once")),
        "status" => print_status(),
        "datasets" => print_datasets(),
        "reconcile" => reconcile_once(),
        "upload-metadata" => upload_metadata_once(),
        "set-user-sharing" => {
            let value = arguments.next().ok_or_else(|| {
                "usage: sourccey-sync set-user-sharing <enabled|disabled>".to_string()
            })?;
            let enabled = match value.trim().to_ascii_lowercase().as_str() {
                "enabled" | "true" | "on" => true,
                "disabled" | "false" | "off" => false,
                _ => return Err("user sharing must be enabled or disabled".to_string()),
            };
            set_user_sharing_enabled(enabled)
        }
        "set-dataset-root" => {
            let path = arguments.next().ok_or_else(|| {
                "usage: sourccey-sync set-dataset-root <path-to-vulcan-studio>".to_string()
            })?;
            set_dataset_root(Path::new(&path))
        }
        "install-startup" => {
            let executable = std::env::current_exe()
                .map_err(|error| format!("failed to locate sourccey-sync: {error}"))?;
            startup::install(&executable)?;
            println!("Sourccey Sync will start when this user signs in.");
            Ok(())
        }
        "uninstall-startup" => {
            startup::uninstall()?;
            println!("Sourccey Sync startup registration removed.");
            Ok(())
        }
        "startup-status" => {
            println!(
                "{}",
                if startup::is_installed()? {
                    "enabled"
                } else {
                    "disabled"
                }
            );
            Ok(())
        }
        "help" | "--help" | "-h" => {
            print_help();
            Ok(())
        }
        command => Err(format!("unknown command: {command}")),
    }
}

fn run_service(once: bool) -> Result<(), String> {
    let paths = SyncPaths::resolve()?;
    paths.ensure_directories()?;
    let _instance_lock = acquire_instance_lock(&paths.lock)?;
    let mut database = SyncDatabase::open(&paths.database, &paths.default_dataset_root)?;
    let mut uploader = uploader::MetadataUploader::new()?;
    println!(
        "Sourccey Sync started with data at {}",
        paths.root.display()
    );

    let mut last_reconciliation: Option<Instant> = None;
    let mut last_upload_attempt: Option<Instant> = None;
    loop {
        process_control(&paths, &mut database)?;
        if database.is_active()? {
            process_inbox(&paths, &mut database)?;
            if last_reconciliation.is_none_or(|last| last.elapsed() >= CATALOG_RECONCILE_INTERVAL) {
                reconcile(&mut database, once)?;
                last_reconciliation = Some(Instant::now());
            }
            if last_upload_attempt.is_none_or(|last| last.elapsed() >= UPLOAD_ATTEMPT_INTERVAL) {
                match uploader.process_ready(&mut database, 4) {
                    Ok(report) if report.attempted > 0 => println!(
                        "Metadata uploads: attempted={}, uploaded={}, failed={}",
                        report.attempted, report.uploaded, report.failed
                    ),
                    Ok(_) => {}
                    Err(error) => eprintln!("Metadata uploads deferred: {error}"),
                }
                last_upload_attempt = Some(Instant::now());
            }
        }
        if once {
            return Ok(());
        }
        thread::sleep(SERVICE_TICK_INTERVAL);
    }
}

fn process_control(paths: &SyncPaths, database: &mut SyncDatabase) -> Result<(), String> {
    let mut commands = pending_json_files(&paths.control.pending_dir())?;
    commands.sort();
    for path in commands {
        let result = read_control_command(&path).and_then(|command| match command.request {
            SyncRequest::AdoptInstallationId { installation_id } => {
                database.adopt_installation_id(&installation_id)
            }
            SyncRequest::ConfigureCloud { context } => database.configure_cloud(&context),
            SyncRequest::SetUserSharingEnabled { enabled } => {
                database.set_user_sharing_enabled(enabled)
            }
            SyncRequest::SetDatasetRoot { path } => database.set_dataset_root(&path).map(drop),
            SyncRequest::Ping | SyncRequest::GetStatus | SyncRequest::NotifyInbox => Ok(()),
            SyncRequest::PrepareForUpdate | SyncRequest::Shutdown => {
                Err("this control command requires the future IPC transport".to_string())
            }
        });
        match result {
            Ok(()) => move_event(&path, &paths.control.processed_dir())?,
            Err(error) => {
                eprintln!("Rejected sync control {}: {error}", path.display());
                move_event(&path, &paths.control.failed_dir())?;
            }
        }
    }
    Ok(())
}

fn reconcile(database: &mut SyncDatabase, print_report: bool) -> Result<(), String> {
    if !database.is_active()? {
        return Ok(());
    }
    let root = database.dataset_root()?;
    let discovery = catalog::discover(&root)?;
    if discovery.report.root_available {
        database.reconcile_catalog(&discovery.datasets)?;
    }
    if print_report {
        println!(
            "{}",
            serde_json::to_string_pretty(&discovery.report)
                .map_err(|error| format!("failed to serialize catalog report: {error}"))?
        );
    }
    Ok(())
}

fn process_inbox(paths: &SyncPaths, database: &mut SyncDatabase) -> Result<(), String> {
    let mut events = pending_json_files(&paths.inbox.pending_dir())?;
    events.sort();

    for path in events {
        match read_completion_event(&path)
            .and_then(|(event, _raw)| database.ingest_completion_event(&event))
        {
            Ok(()) => move_event(&path, &paths.inbox.processed_dir())?,
            Err(error) => {
                eprintln!("Rejected inbox event {}: {error}", path.display());
                move_event(&path, &paths.inbox.failed_dir())?;
            }
        }
    }
    Ok(())
}

fn pending_json_files(directory: &Path) -> Result<Vec<std::path::PathBuf>, String> {
    Ok(fs::read_dir(directory)
        .map_err(|error| format!("failed to scan sync inbox: {error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "json")
        })
        .collect())
}

fn move_event(source: &Path, destination_directory: &Path) -> Result<(), String> {
    let filename = source
        .file_name()
        .ok_or_else(|| "inbox event has no filename".to_string())?;
    let mut destination = destination_directory.join(filename);
    if destination.exists() {
        destination = destination_directory.join(format!(
            "{}-{}",
            uuid::Uuid::now_v7(),
            filename.to_string_lossy()
        ));
    }
    fs::rename(source, &destination)
        .map_err(|error| format!("failed to archive inbox event: {error}"))
}

fn acquire_instance_lock(path: &Path) -> Result<File, String> {
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(path)
        .map_err(|error| format!("failed to open single-instance lock: {error}"))?;
    file.try_lock_exclusive()
        .map_err(|_| "another sourccey-sync process is already running".to_string())?;
    Ok(file)
}

fn print_status() -> Result<(), String> {
    let paths = SyncPaths::resolve()?;
    paths.ensure_directories()?;
    let database = SyncDatabase::open(&paths.database, &paths.default_dataset_root)?;
    let status = database.status()?;
    println!(
        "{}",
        serde_json::to_string_pretty(&status)
            .map_err(|error| format!("failed to serialize sync status: {error}"))?
    );
    Ok(())
}

fn print_datasets() -> Result<(), String> {
    let paths = SyncPaths::resolve()?;
    paths.ensure_directories()?;
    let database = SyncDatabase::open(&paths.database, &paths.default_dataset_root)?;
    println!(
        "{}",
        serde_json::to_string_pretty(&database.datasets()?)
            .map_err(|error| format!("failed to serialize datasets: {error}"))?
    );
    Ok(())
}

fn reconcile_once() -> Result<(), String> {
    let paths = SyncPaths::resolve()?;
    paths.ensure_directories()?;
    let mut database = SyncDatabase::open(&paths.database, &paths.default_dataset_root)?;
    reconcile(&mut database, true)
}

fn upload_metadata_once() -> Result<(), String> {
    let paths = SyncPaths::resolve()?;
    paths.ensure_directories()?;
    let mut database = SyncDatabase::open(&paths.database, &paths.default_dataset_root)?;
    if !database.is_active()? {
        return Err("robot-data sharing is disabled by user consent or admin policy".to_string());
    }
    reconcile(&mut database, false)?;
    let mut uploader = uploader::MetadataUploader::new()?;
    let report = uploader.process_ready(&mut database, 20)?;
    println!(
        "{}",
        serde_json::to_string_pretty(&report)
            .map_err(|error| format!("failed to serialize upload report: {error}"))?
    );
    Ok(())
}

fn set_user_sharing_enabled(enabled: bool) -> Result<(), String> {
    let paths = SyncPaths::resolve()?;
    paths.ensure_directories()?;
    paths
        .control
        .submit(SyncRequest::SetUserSharingEnabled { enabled })?;
    println!(
        "User data sharing change to {} queued.",
        if enabled { "enabled" } else { "disabled" }
    );
    Ok(())
}

fn set_dataset_root(path: &Path) -> Result<(), String> {
    let paths = SyncPaths::resolve()?;
    paths.ensure_directories()?;
    paths.control.submit(SyncRequest::SetDatasetRoot {
        path: path.to_path_buf(),
    })?;
    println!("Dataset root change to {} queued.", path.display());
    Ok(())
}

fn print_help() {
    println!(
        "Sourccey Sync\n\n\
         Commands:\n\
           run [--once]          Process completion events and remain in the background\n\
           status                Print queue status as JSON\n\
           datasets              Print tracked datasets and upload states as JSON\n\
           reconcile             Scan only the configured vulcan-studio directory\n\
           upload-metadata       Reconcile and upload ready metadata jobs now\n\
           set-user-sharing VALUE Enable or disable user data sharing\n\
           set-dataset-root PATH Persist the approved vulcan-studio directory\n\
           install-startup       Start sourccey-sync at user sign-in\n\
           uninstall-startup     Remove user sign-in registration\n\
           startup-status        Print enabled or disabled"
    );
}
