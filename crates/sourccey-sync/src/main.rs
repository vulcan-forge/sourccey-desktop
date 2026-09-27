#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod database;
mod paths;
mod startup;

use database::SyncDatabase;
use fs2::FileExt;
use paths::SyncPaths;
use sourccey_sync_core::{read_completion_event, DatasetSharingLevel};
use std::fs::{self, File, OpenOptions};
use std::path::Path;
use std::thread;
use std::time::Duration;

const INBOX_SCAN_INTERVAL: Duration = Duration::from_secs(30);

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
        "set-sharing" => {
            let level = arguments
                .next()
                .ok_or_else(|| {
                    "usage: sourccey-sync set-sharing <all|metadata|nothing>".to_string()
                })?
                .parse::<DatasetSharingLevel>()?;
            set_sharing_level(level)
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
    let mut database = SyncDatabase::open(&paths.database)?;
    println!(
        "Sourccey Sync started with data at {}",
        paths.root.display()
    );

    loop {
        process_inbox(&paths, &mut database)?;
        if once {
            return Ok(());
        }
        thread::sleep(INBOX_SCAN_INTERVAL);
    }
}

fn process_inbox(paths: &SyncPaths, database: &mut SyncDatabase) -> Result<(), String> {
    let mut events = fs::read_dir(paths.inbox.pending_dir())
        .map_err(|error| format!("failed to scan sync inbox: {error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "json")
        })
        .collect::<Vec<_>>();
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
    let database = SyncDatabase::open(&paths.database)?;
    let status = database.status()?;
    println!(
        "{}",
        serde_json::to_string_pretty(&status)
            .map_err(|error| format!("failed to serialize sync status: {error}"))?
    );
    Ok(())
}

fn set_sharing_level(level: DatasetSharingLevel) -> Result<(), String> {
    let paths = SyncPaths::resolve()?;
    paths.ensure_directories()?;
    let mut database = SyncDatabase::open(&paths.database)?;
    database.set_sharing_level(level)?;
    println!("Dataset sharing set to {level}.");
    Ok(())
}

fn print_help() {
    println!(
        "Sourccey Sync\n\n\
         Commands:\n\
           run [--once]          Process completion events and remain in the background\n\
           status                Print queue status as JSON\n\
           set-sharing LEVEL     Set all, metadata, or nothing\n\
           install-startup       Start sourccey-sync at user sign-in\n\
           uninstall-startup     Remove user sign-in registration\n\
           startup-status        Print enabled or disabled"
    );
}
