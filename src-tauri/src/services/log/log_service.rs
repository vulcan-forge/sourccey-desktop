use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

pub struct LogService;

impl LogService {
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
                Ok(f) => f,
                Err(e) => {
                    eprintln!("Failed to open log file {}: {}", file_path, e);
                    return;
                }
            };

            for line in rx {
                if shutdown_flag.load(Ordering::Relaxed) {
                    break;
                }

                let timestamp = Self::get_timestamp();
                let formatted = if let Some(prefix) = &format_prefix {
                    format!("{} [{}] {}\n", timestamp, prefix, line)
                } else {
                    format!("{} {}\n", timestamp, line)
                };

                if let Err(e) = file.write_all(formatted.as_bytes()) {
                    eprintln!("Failed to write to log file {}: {}", file_path, e);
                    // Continue processing even if file write fails
                } else if let Err(e) = file.flush() {
                    eprintln!("Failed to flush log file {}: {}", file_path, e);
                    // Continue processing even if flush fails
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
}
