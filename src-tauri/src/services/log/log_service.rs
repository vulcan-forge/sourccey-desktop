use std::collections::VecDeque;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

pub struct LogService;

impl LogService {
    const DEFAULT_MAX_BYTES: u64 = 5 * 1024 * 1024;
    const DEFAULT_MAX_FILES: usize = 5;

    /// Start a logger with flexible configuration
    ///
    /// # Arguments
    /// * `stream` - Optional stream to read from
    /// * `app_handle` - Optional Tauri app handle for emitting events
    /// * `shutdown_flag` - Atomic boolean flag to signal the logging thread to stop
    /// * `format_prefix` - Optional prefix to format each log line
    /// * `emit_key` - Optional event key to emit for each log line
    /// * `file_path` - Optional path to the log file
    /// * `terminal_output` - Whether to output to terminal/console
    /// * `use_stderr` - Whether to output to stderr instead of stdout
    pub fn start_logger<T>(
        stream: Option<T>,
        app_handle: &AppHandle,
        shutdown_flag: &Arc<AtomicBool>,
        format_prefix: Option<&str>,
        emit_key: Option<&str>,
        file_path: Option<&str>,
        terminal_output: bool,
        use_stderr: bool,
    ) where
        T: std::io::Read + Send + 'static,
    {
        if let Some(stream) = stream {
            // Create channels for each consumer
            let mut senders = Vec::new();
            let mut receivers = Vec::new();

            // Create channel for stream logger (frontend events)
            if emit_key.is_some() {
                let (tx, rx) = mpsc::channel();
                senders.push(tx);
                receivers.push(("stream", rx));
            }

            // Create channel for file logger
            if let Some(_path) = file_path {
                let (tx, rx) = mpsc::channel();
                senders.push(tx);
                receivers.push(("file", rx));
            }

            // Create channel for terminal logger
            if terminal_output {
                let (tx, rx) = mpsc::channel();
                senders.push(tx);
                receivers.push(("terminal", rx));
            }

            // Spawn a thread to read from the stream and broadcast to all channels
            let shutdown_clone = shutdown_flag.clone();
            std::thread::spawn(move || {
                let reader = BufReader::new(stream);
                for line in reader.lines().flatten() {
                    if shutdown_clone.load(Ordering::Relaxed) {
                        break;
                    }

                    // Send the line to all interested consumers
                    for sender in &senders {
                        if sender.send(line.clone()).is_err() {
                            // Receiver was dropped, continue with others
                        }
                    }
                }
            });

            // Start individual loggers
            for (logger_type, rx) in receivers {
                match logger_type {
                    "stream" => {
                        if let Some(key) = emit_key {
                            Self::start_stream_logger_from_channel(
                                rx,
                                app_handle.clone(),
                                shutdown_flag.clone(),
                                format_prefix.map(|s| s.to_string()),
                                key.to_string(),
                            );
                        }
                    }
                    "file" => {
                        if let Some(path) = file_path {
                            Self::start_file_logger_from_channel(
                                rx,
                                shutdown_flag.clone(),
                                format_prefix.map(|s| s.to_string()),
                                path.to_string(),
                            );
                        }
                    }
                    "terminal" => {
                        Self::start_terminal_logger_from_channel(
                            rx,
                            shutdown_flag.clone(),
                            format_prefix.map(|s| s.to_string()),
                            use_stderr,
                        );
                    }
                    _ => {}
                }
            }
        }
    }

    /// Start a logging thread that reads from a channel and emits log events
    pub fn start_stream_logger_from_channel(
        rx: mpsc::Receiver<String>,
        app_handle: AppHandle,
        shutdown_flag: Arc<AtomicBool>,
        format_prefix: Option<String>,
        emit_key: String,
    ) {
        std::thread::spawn(move || {
            for line in rx {
                if shutdown_flag.load(Ordering::Relaxed) {
                    break;
                }

                let formatted = if let Some(prefix) = &format_prefix {
                    format!("[{}] {}", prefix, line)
                } else {
                    line
                };

                // Emit to frontend with error handling
                if let Err(e) = app_handle.emit(&emit_key, &formatted) {
                    eprintln!("Failed to emit log to frontend: {}", e);
                    // Continue processing even if emit fails
                }
            }
        });
    }

    /// Start a logging thread that reads from a channel and writes to a file
    pub fn start_file_logger_from_channel(
        rx: mpsc::Receiver<String>,
        shutdown_flag: Arc<AtomicBool>,
        format_prefix: Option<String>,
        file_path: String,
    ) {
        std::thread::spawn(move || {
            let mut file = match Self::open_log_file(&file_path) {
                Ok(f) => Some(f),
                Err(e) => {
                    eprintln!("Failed to open log file {}: {}", file_path, e);
                    None
                }
            };

            for line in rx {
                if shutdown_flag.load(Ordering::Relaxed) {
                    break;
                }

                if Self::should_rotate(&file_path) {
                    if let Err(e) = Self::rotate_log_files(&file_path) {
                        eprintln!("Failed to rotate log file {}: {}", file_path, e);
                    }
                    file = match Self::open_log_file(&file_path) {
                        Ok(f) => Some(f),
                        Err(e) => {
                            eprintln!("Failed to open log file {}: {}", file_path, e);
                            None
                        }
                    };
                }

                let timestamp = Self::get_timestamp();
                let formatted = if let Some(prefix) = &format_prefix {
                    format!("{} [{}] {}\n", timestamp, prefix, line)
                } else {
                    format!("{} {}\n", timestamp, line)
                };

                if let Some(ref mut file) = file {
                    if let Err(e) = file.write_all(formatted.as_bytes()) {
                        eprintln!("Failed to write to log file {}: {}", file_path, e);
                    } else if let Err(e) = file.flush() {
                        eprintln!("Failed to flush log file {}: {}", file_path, e);
                    }
                } else {
                    eprintln!("Log file unavailable, dropping log line");
                }
            }
        });
    }

    /// Start a logging thread that reads from a channel and outputs to terminal/console
    pub fn start_terminal_logger_from_channel(
        rx: mpsc::Receiver<String>,
        shutdown_flag: Arc<AtomicBool>,
        format_prefix: Option<String>,
        use_stderr: bool,
    ) {
        std::thread::spawn(move || {
            for line in rx {
                if shutdown_flag.load(Ordering::Relaxed) {
                    break;
                }

                let formatted = if let Some(prefix) = &format_prefix {
                    format!("[{}] {}", prefix, line)
                } else {
                    line
                };

                if use_stderr {
                    eprintln!("{}", formatted);
                } else {
                    println!("{}", formatted);
                }
            }
        });
    }

    /// Open a log file with append mode, creating directories if necessary
    fn open_log_file(file_path: &str) -> Result<File, String> {
        let path = Path::new(file_path);

        // Create parent directories if they don't exist
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create log directory: {}", e))?;
        }

        OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .map_err(|e| format!("Failed to open log file: {}", e))
    }

    pub fn write_log_line(file_path: &str, format_prefix: Option<&str>, line: &str) {
        if Self::should_rotate(file_path) {
            if let Err(e) = Self::rotate_log_files(file_path) {
                eprintln!("Failed to rotate log file {}: {}", file_path, e);
            }
        }

        let mut file = match Self::open_log_file(file_path) {
            Ok(f) => f,
            Err(e) => {
                eprintln!("Failed to open log file {}: {}", file_path, e);
                return;
            }
        };

        let timestamp = Self::get_timestamp();
        let formatted = if let Some(prefix) = format_prefix {
            format!("{} [{}] {}\n", timestamp, prefix, line)
        } else {
            format!("{} {}\n", timestamp, line)
        };

        if let Err(e) = file.write_all(formatted.as_bytes()) {
            eprintln!("Failed to write to log file {}: {}", file_path, e);
        }
    }

    fn should_rotate(file_path: &str) -> bool {
        let max_bytes = Self::max_bytes();
        let path = Path::new(file_path);
        match std::fs::metadata(path) {
            Ok(meta) => meta.len() >= max_bytes,
            Err(_) => false,
        }
    }

    fn rotate_log_files(file_path: &str) -> Result<(), String> {
        let max_files = Self::max_files();
        if max_files == 0 {
            return Ok(());
        }

        let base = PathBuf::from(file_path);
        let oldest = Self::rotated_path(&base, max_files);
        if oldest.exists() {
            std::fs::remove_file(&oldest)
                .map_err(|e| format!("Failed to remove old log file {:?}: {}", oldest, e))?;
        }

        for idx in (1..max_files).rev() {
            let src = Self::rotated_path(&base, idx);
            let dst = Self::rotated_path(&base, idx + 1);
            if src.exists() {
                std::fs::rename(&src, &dst)
                    .map_err(|e| format!("Failed to rotate log file {:?}: {}", src, e))?;
            }
        }

        if base.exists() {
            let first = Self::rotated_path(&base, 1);
            std::fs::rename(&base, &first)
                .map_err(|e| format!("Failed to rotate log file {:?}: {}", base, e))?;
        }

        Ok(())
    }

    fn rotated_path(base: &Path, index: usize) -> PathBuf {
        PathBuf::from(format!("{}.{}", base.to_string_lossy(), index))
    }

    fn max_bytes() -> u64 {
        std::env::var("SOURCCEY_LOG_MAX_BYTES")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .filter(|v| *v > 0)
            .unwrap_or(Self::DEFAULT_MAX_BYTES)
    }

    fn max_files() -> usize {
        std::env::var("SOURCCEY_LOG_MAX_FILES")
            .ok()
            .and_then(|v| v.parse::<usize>().ok())
            .unwrap_or(Self::DEFAULT_MAX_FILES)
    }

    /// Get current timestamp in a readable format
    fn get_timestamp() -> String {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();

        let secs = now.as_secs();
        let millis = now.subsec_millis();

        // Format as YYYY-MM-DD HH:MM:SS.mmm
        let datetime = chrono::DateTime::from_timestamp(secs as i64, 0).unwrap_or_default();

        format!("{}.{:03}", datetime.format("%Y-%m-%d %H:%M:%S"), millis)
    }

    fn parse_timestamp_ms(line: &str) -> Option<i64> {
        if line.len() < 23 {
            return None;
        }

        let date_part = line.get(0..19)?;
        let dot = line.get(19..20)?;
        let millis_part = line.get(20..23)?;
        if dot != "." {
            return None;
        }

        let dt = chrono::NaiveDateTime::parse_from_str(date_part, "%Y-%m-%d %H:%M:%S").ok()?;
        let millis: i64 = millis_part.parse::<i64>().ok()?;
        Some(dt.and_utc().timestamp_millis() + millis)
    }

    pub fn read_log_tail(file_path: &str, max_lines: usize) -> Result<Vec<String>, String> {
        if max_lines == 0 {
            return Ok(Vec::new());
        }

        let path = Path::new(file_path);
        if !path.exists() {
            return Ok(Vec::new());
        }

        let file = File::open(path).map_err(|e| format!("Failed to open log file: {}", e))?;
        let reader = BufReader::new(file);
        let mut lines = VecDeque::with_capacity(max_lines);

        for line in reader.lines() {
            let line = line.map_err(|e| format!("Failed to read log file: {}", e))?;
            if lines.len() == max_lines {
                lines.pop_front();
            }
            lines.push_back(line);
        }

        Ok(lines.into_iter().collect())
    }

    pub fn write_app_log_line(
        app_handle: &AppHandle,
        file_name: &str,
        format_prefix: Option<&str>,
        line: &str,
    ) -> Result<(), String> {
        let base_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to resolve app data dir: {}", e))
            .or_else(|_| std::env::current_dir().map_err(|e| format!("Failed to resolve cwd: {}", e)))?;
        let log_dir = base_dir.join("logs");
        std::fs::create_dir_all(&log_dir)
            .map_err(|e| format!("Failed to create log dir: {}", e))?;
        let log_path = log_dir.join(file_name);
        Self::write_log_line(log_path.to_string_lossy().as_ref(), format_prefix, line);
        Ok(())
    }

    pub fn clear_log_dir(log_dir: &Path) -> Result<usize, String> {
        if !log_dir.exists() {
            return Ok(0);
        }

        let mut removed = 0usize;
        for entry in std::fs::read_dir(log_dir).map_err(|e| format!("Failed to read log dir: {}", e))? {
            let entry = entry.map_err(|e| format!("Failed to read log dir entry: {}", e))?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let file_name = path.file_name().and_then(|name| name.to_str()).unwrap_or("");
            if !file_name.ends_with(".log") && !file_name.contains(".log.") {
                continue;
            }

            if std::fs::remove_file(&path).is_ok() {
                removed += 1;
            }
        }

        Ok(removed)
    }

    pub fn read_log_tail_all(
        log_dir: &Path,
        max_lines_total: usize,
        max_lines_per_file: usize,
    ) -> Result<Vec<String>, String> {
        if max_lines_total == 0 || max_lines_per_file == 0 {
            return Ok(Vec::new());
        }

        if !log_dir.exists() {
            return Ok(Vec::new());
        }

        let mut entries: Vec<(i64, usize, String)> = Vec::new();
        let mut order: usize = 0;

        for entry in std::fs::read_dir(log_dir).map_err(|e| format!("Failed to read log dir: {}", e))? {
            let entry = entry.map_err(|e| format!("Failed to read log dir entry: {}", e))?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let file_name = path.file_name().and_then(|name| name.to_str()).unwrap_or("");
            if !file_name.contains(".log") {
                continue;
            }

            let tail = Self::read_log_tail(path.to_string_lossy().as_ref(), max_lines_per_file)?;
            for line in tail {
                let ts = Self::parse_timestamp_ms(&line).unwrap_or(i64::MIN);
                entries.push((ts, order, line));
                order += 1;
            }
        }

        entries.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));

        let start = entries.len().saturating_sub(max_lines_total);
        let mut combined = Vec::with_capacity(entries.len().saturating_sub(start));
        for (_, _, line) in entries.into_iter().skip(start) {
            combined.push(line);
        }

        Ok(combined)
    }
}
