use crate::services::directory::remote_directory_service::RemoteDirectoryService;
use russh::client::{Config, Handler, Handle};
use russh::{Channel, Error};
use russh::ChannelMsg;
use russh_keys::key;
use std::collections::HashMap;
use std::io::{self, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use crate::modules::control::types::configuration::configuration_types::RemoteConfig;
use tokio::runtime::Runtime;
use tokio::io::AsyncReadExt;
use tokio::time::{timeout, Duration};
use lazy_static::lazy_static;
use async_trait::async_trait;

// Russh Handler implementation
#[derive(Clone)]
pub struct SshClientHandler;

#[async_trait::async_trait]
impl Handler for SshClientHandler {
    type Error = Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Accept all server keys for now (could implement verification later)
        Ok(true)
    }
}

// New struct to track robot processes
#[derive(Clone)]
pub struct RobotProcess {
    pub pid: u32,
    #[allow(dead_code)]
    pub nickname: String,
    pub shutdown_flag: Arc<AtomicBool>,
}

#[allow(dead_code)]
pub struct SshCommandConfig {
    pub app_handle: Option<AppHandle>,
    pub success_event: Option<String>,
    pub success_log: Option<String>,
    pub error_event: Option<String>,
    pub error_log: Option<String>,
}

#[allow(dead_code)]
impl SshCommandConfig {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle: Some(app_handle),
            success_event: None,
            success_log: None,
            error_event: None,
            error_log: None,
        }
    }

    pub fn with_success(mut self, success_event: String, success_log: String) -> Self {
        self.success_event = Some(success_event);
        self.success_log = Some(success_log);
        self
    }

    pub fn with_error(mut self, error_event: String, error_log: String) -> Self {
        self.error_event = Some(error_event);
        self.error_log = Some(error_log);
        self
    }
}

#[derive(Clone)]
pub struct BackgroundCommandConfig {
    pub app_handle: Option<AppHandle>,
    pub success_event: Option<String>,
    pub success_log: Option<String>,
    pub success_complete_log: Option<String>,
    pub error_event: Option<String>,
    pub error_log: Option<String>,
}

impl BackgroundCommandConfig {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle: Some(app_handle),
            success_event: None,
            success_log: None,
            success_complete_log: None,
            error_event: None,
            error_log: None,
        }
    }

    pub fn with_success(mut self, success_event: String, success_log: String) -> Self {
        self.success_event = Some(success_event);
        self.success_log = Some(success_log);
        self
    }

    pub fn with_error(mut self, error_event: String, error_log: String) -> Self {
        self.error_event = Some(error_event);
        self.error_log = Some(error_log);
        self
    }

    pub fn with_logs(mut self, success_complete_log: String) -> Self {
        self.success_complete_log = Some(success_complete_log);
        self
    }
}

// Simple connection status tracking
pub struct SshSessions(Arc<Mutex<HashMap<String, bool>>>);
pub struct RobotProcesses(Arc<Mutex<HashMap<String, RobotProcess>>>);
pub struct VoiceProcesses(Arc<Mutex<HashMap<String, RobotProcess>>>);

pub struct SshService;

impl SshService {
    pub fn init_ssh() -> SshSessions {
        SshSessions(Arc::new(Mutex::new(HashMap::new())))
    }

    // Initialize robot processes state
    pub fn init_robot_processes() -> RobotProcesses {
        RobotProcesses(Arc::new(Mutex::new(HashMap::new())))
    }

    // Initialize voice listener processes state
    pub fn init_voice_processes() -> VoiceProcesses {
        VoiceProcesses(Arc::new(Mutex::new(HashMap::new())))
    }

    // Create SSH Session Functions
    pub async fn create_ssh_session_async(
        ip: &str,
        port: &str,
        username: &str,
        password: &str,
    ) -> Result<Handle<SshClientHandler>, String> {
        println!(
            "[SSH] Attempting to connect to {}:{} with username {}",
            ip, port, username
        );

        let config = Arc::new(Config::default());
        let handler = SshClientHandler;
        let addr = format!("{}:{}", ip, port);

        // Connect to SSH server
        let mut session = russh::client::connect(config, &addr, handler)
            .await
            .map_err(|e| format!("Failed to connect: {}", e))?;

        println!("[SSH] Connection established");

        // Authenticate with password
        session.authenticate_password(username, password)
            .await
            .map_err(|e| format!("Authentication failed: {}", e))?;

        // Sanity check: open/close a channel so callers fail here on bad auth
        {
            let ch = session
                .channel_open_session()
                .await
                .map_err(|e| format!("Authentication failed: Failed to create channel: {}", e))?;
            let _ = ch.eof().await;
            let _ = ch.close().await;
        }

        println!("[SSH] Authentication successful");

        Ok(session)
    }

    // Execute Command Functions
    pub async fn execute_command_async(session: &mut Handle<SshClientHandler>, command: &str) -> Result<(), String> {
        let channel = session
            .channel_open_session()
            .await
            .map_err(|e| format!("Failed to create channel: {}", e))?;

        channel
            .exec(true, command)
            .await
            .map_err(|e| format!("Failed to execute command: {}", e))?;

        channel
            .close()
            .await
            .map_err(|e| format!("Failed to close channel: {}", e))?;

        Ok(())
    }

    // Rename the existing async function
    pub async fn execute_background_command_async(
        state_processes: Arc<Mutex<HashMap<String, RobotProcess>>>,
        session: &mut Handle<SshClientHandler>,
        command: String,
        config: BackgroundCommandConfig,
        nickname: String
    ) -> Result<(), String> {
        // Open channel and exec command
        let mut channel = session
            .channel_open_session()
            .await
            .map_err(|e| format!("Failed to create channel: {}", e))?;

        channel
            .exec(true, command)
            .await
            .map_err(|e| format!("Failed to execute command: {}", e))?;

        println!(
            "Command started successfully: {}",
            config.success_log.as_ref().unwrap_or(&"".to_string())
        );

        // Capture only the first line as PID with a timeout using channel.wait()
        let pid_opt = match timeout(Duration::from_secs(5), async {
            let mut output = String::new();
            loop {
                match channel.wait().await {
                    Some(ChannelMsg::Data { data }) => {
                        let chunk = String::from_utf8_lossy(&data);
                        print!("{}", chunk);
                        io::stdout().flush().ok();
                        output.push_str(&chunk);

                        // Only try to capture PID if we have at least one complete line
                        if output.contains('\n') {
                            let lines: Vec<&str> = output.lines().collect();
                            if let Some(first_line) = lines.first() {
                                let pid_str = first_line.trim();
                                if !pid_str.is_empty() {
                                    if let Ok(pid) = pid_str.parse::<u32>() {
                                        println!("PID captured: {}", pid);
                                        // Create RobotProcess and store it immediately
                                        let robot_process = RobotProcess {
                                            pid,
                                            nickname: nickname.clone(),
                                            shutdown_flag: Arc::new(AtomicBool::new(false)),
                                        };
                                        // Store the process immediately with minimal lock scope
                                        {
                                            let mut processes_guard = state_processes.lock().unwrap();
                                            processes_guard.insert(nickname.clone(), robot_process);
                                        } // Lock is released here immediately

                                        break Some(pid);
                                    }
                                }
                            }
                        }
                    }
                    Some(ChannelMsg::ExtendedData { data, .. }) => {
                        let chunk = String::from_utf8_lossy(&data);
                        print!("{}", chunk);
                        io::stdout().flush().ok();
                        output.push_str(&chunk);
                    }
                    Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break None,
                    _ => {}
                }
            }
        }).await {
            Ok(v) => v,
            Err(_) => None,
        };

        if let Some(pid) = pid_opt {
            println!("PID successfully captured and stored: {}", pid);

            if let (Some(handle), Some(success_event)) = (config.app_handle.clone(), config.success_event.clone()) {
                let _ = handle.emit(
                    &success_event,
                    serde_json::json!({
                        "nickname": nickname,
                        "pid": pid,
                        "message": config.success_log.as_ref().unwrap_or(&"".to_string())
                    }),
                );
            }
        } else {
            if let (Some(handle), Some(error_event)) = (config.app_handle.clone(), config.error_event.clone()) {
                let _ = handle.emit(
                    &error_event,
                    serde_json::json!({
                        "nickname": nickname,
                        "error": "Failed to capture PID from command output"
                    }),
                );
            }
            channel
                .close()
                .await
                .map_err(|e| format!("Failed to close channel: {}", e))?;
            return Err("Failed to capture PID from command output".to_string());
        }

        channel
            .close()
            .await
            .map_err(|e| format!("Failed to close channel: {}", e))?;

        println!(
            "Command completed successfully: {}",
            config
                .success_complete_log
                .as_ref()
                .unwrap_or(&"".to_string())
        );

        Ok(())
    }

    pub async fn execute_command_read_output_async(
        session: &mut Handle<SshClientHandler>,
        command: &str,
        timeout_secs: u64,
    ) -> Result<Option<String>, String> {
        println!("Creating SSH channel (first-line)...");
        let mut channel = session
            .channel_open_session()
            .await
            .map_err(|e| format!("Failed to create channel: {}", e))?;

        channel
            .exec(true, command)
            .await
            .map_err(|e| format!("Failed to execute command: {}", e))?;

        let mut acc = String::new();
        let first_line = match timeout(Duration::from_secs(timeout_secs), async {
            loop {
                match channel.wait().await {
                    Some(ChannelMsg::Data { data }) => {
                        let chunk = String::from_utf8_lossy(&data);
                        acc.push_str(&chunk);
                        if let Some(line) = acc.lines().next() {
                            let line = line.trim();
                            if !line.is_empty() {
                                break Some(line.to_string());
                            }
                        }
                    }
                    Some(ChannelMsg::ExtendedData { data, .. }) => {
                        let chunk = String::from_utf8_lossy(&data);
                        acc.push_str(&chunk);
                    }
                    Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break None,
                    _ => {}
                }
            }
        }).await {
            Ok(v) => v,
            Err(_) => None,
        };

        channel
            .close()
            .await
            .map_err(|e| format!("Failed to close channel: {}", e))?;
        Ok(first_line)
    }

    // Is Robot Connected Helper Functions
    fn is_robot_connected(state: &SshSessions, nickname: &str) -> bool {
        let sessions = state.0.lock().unwrap();
        sessions.get(nickname).copied().unwrap_or(false)
    }

    //-----------------------------------------------------------------------------
    // Connection Functions
    //-----------------------------------------------------------------------------
    pub async fn connect(
        app_handle: AppHandle,
        state: &SshSessions,
        config: &RemoteConfig,
        nickname: &str,
    ) -> Result<bool, String> {
        // Test connection by creating a fresh session
        println!("[connect] Testing connection to robot: {}", nickname);
        println!("[connect] Remote IP: {}", config.remote_ip);
        println!("[connect] Remote Port: {}", config.remote_port);
        println!("[connect] Username: {}", config.username);
        println!("[connect] Password: {}", config.password);

        match SshService::create_ssh_session_async(&config.remote_ip, &config.remote_port, &config.username, &config.password).await {
            Ok(_) => {
                // Mark as connected
                let mut sessions = state.0.lock().unwrap();
                sessions.insert(nickname.to_string(), true);

                let _ = app_handle.emit(
                    "ssh-connection-success",
                    serde_json::json!({
                        "nickname": nickname,
                        "message": "Successfully connected to robot"
                    }),
                );

                println!("Connected to robot: {}", nickname);
                Ok(true)
            }
            Err(e) => {
                let _ = app_handle.emit(
                    "ssh-connection-error",
                    serde_json::json!({
                        "nickname": nickname,
                        "error": e
                    }),
                );
                Err(format!("Failed to connect to robot {}: {}", nickname, e))
            }
        }
    }

    pub async fn disconnect(
        state_sessions: &SshSessions,
        state_processes: &RobotProcesses,
        config: &RemoteConfig,
        nickname: &str,
    ) -> Result<bool, String> {
        // Extract the PID before dropping the lock
        let pid_opt = {
            let mut processes = state_processes.0.lock().unwrap();
            if let Some(robot_process) = processes.remove(nickname) {
                println!(
                    "Found running process for robot: {} (PID: {})",
                    nickname, robot_process.pid
                );

                // Signal shutdown intent
                robot_process.shutdown_flag.store(true, Ordering::Relaxed);

                // Extract PID before dropping the guard
                Some(robot_process.pid)
            } else {
                println!("No running process found for robot: {}", nickname);
                None
            }
        }; // MutexGuard is dropped here

        // Now we can safely await - no guard is held
        if let Some(pid) = pid_opt {
            // Build kill commands (graceful → force)
            let kill_int = format!("kill -INT {} 2>/dev/null || true", pid);
            let kill_term = format!("kill -TERM {} 2>/dev/null || true", pid);
            let kill_kill = format!("kill -KILL {} 2>/dev/null || true", pid);

            // Use a fresh SSH session for each attempt
            if let Ok(mut session) = SshService::create_ssh_session_async(
                &config.remote_ip,
                &config.remote_port,
                &config.username,
                &config.password,
            ).await {
                let _ = SshService::execute_command_async(&mut session, &kill_int).await;
                let _ = SshService::execute_command_async(&mut session, &kill_term).await;
                let _ = SshService::execute_command_async(&mut session, &kill_kill).await;
            } else {
                println!("[WARN] Could not create SSH session to send kill signals");
            }
        }

        // Mark the robot as disconnected
        let mut sessions = state_sessions.0.lock().unwrap();
        sessions.insert(nickname.to_string(), false);
        println!("Disconnected robot: {}", nickname);
        Ok(true)
    }

    pub async fn is_connected(
        app_handle: AppHandle,
        state: &SshSessions,
        config: &RemoteConfig,
        nickname: &str,
    ) -> Result<bool, String> {
        // First check our tracked state - early return if not marked as connected
        if !SshService::is_robot_connected(state, nickname) {
            let _ = app_handle.emit(
                "ssh-is-connected-error",
                serde_json::json!({
                    "nickname": nickname,
                    "error": "Robot is not connected"
                }),
            );
            return Ok(false);
        }

        // Use timeout to prevent hanging - wrap the entire connection check
        match timeout(Duration::from_secs(10), async {
            // Try a fresh session (auth handshake is enough as a liveness probe)
            let mut session_result = SshService::create_ssh_session_async(
                &config.remote_ip,
                &config.remote_port,
                &config.username,
                &config.password,
            ).await?;

            // Try a trivial command to verify the session is alive
            let command_result = SshService::execute_command_async(&mut session_result, "echo ok").await;

            // Always disconnect properly
            let _ = session_result.disconnect(russh::Disconnect::ByApplication, "", "").await;

            command_result.map(|_| true)
        }).await {
            Ok(Ok(true)) => {
                println!("OK(OK(true): SSH is connected");
                let _ = app_handle.emit(
                    "ssh-is-connected",
                    serde_json::json!({
                        "nickname": nickname,
                        "message": "SSH is connected",
                        "output": "ok"
                    }),
                );
                Ok(true)
            }
            Ok(Ok(false)) => {
                // This should never happen, but handle it anyway
                println!("OK(OK(false): SSH is not connected");
                let _ = app_handle.emit(
                    "ssh-is-connected-error",
                    serde_json::json!({
                        "nickname": nickname,
                        "error": "Unexpected false result from connection check"
                    }),
                );
                Ok(false)
            }
            Ok(Err(e)) => {
                // Connection failed but within timeout
                println!("OK(Err(e)): SSH is not connected");
                let _ = app_handle.emit(
                    "ssh-is-connected-error",
                    serde_json::json!({
                        "nickname": nickname,
                        "error": e
                    }),
                );
                Err(format!("Connection check failed: {}", e))
            }
            Err(_) => {
                // Timeout occurred
                println!("OK(Err(_)): Connection check timed out");
                let _ = app_handle.emit(
                    "ssh-is-connected-error",
                    serde_json::json!({
                        "nickname": nickname,
                        "error": "Connection check timed out after 10 seconds"
                    }),
                );
                Err("Connection check timed out".to_string())
            }
        }
    }

    //-----------------------------------------------------------------------------
    // Robot Control Functions
    //-----------------------------------------------------------------------------
    pub async fn start_robot(
        app_handle: AppHandle,
        state_sessions: &SshSessions,
        state_processes: &RobotProcesses,
        remote_config: &RemoteConfig,
        nickname: &str,
    ) -> Result<bool, String> {
        // Check if robot is connected
        if !SshService::is_robot_connected(state_sessions, nickname) {
            return Err("Robot is not connected".to_string());
        }

        // First, check if robot is already running and stop it if needed
        let stop_check_command = "pgrep -f 'lerobot.robots.sourccey.sourccey.sourccey.sourccey_host' > /dev/null 2>&1 && echo 'running' || echo 'stopped'";

        // Create a session for checking/stopping
        let mut check_session = SshService::create_ssh_session_async(
            &remote_config.remote_ip,
            &remote_config.remote_port,
            &remote_config.username,
            &remote_config.password,
        ).await?;

        // Check if process is running
        match SshService::execute_command_read_output_async(&mut check_session, stop_check_command, 10).await {
            Ok(Some(output)) if output.trim().eq_ignore_ascii_case("running") => {
                println!("Robot process is already running, stopping it first...");

                // Stop any existing processes using pkill
                let kill_command = "pkill -f 'lerobot.robots.sourccey.sourccey.sourccey.sourccey_host' || true";
                let _ = SshService::execute_command_async(&mut check_session, kill_command).await;

                // Also clean up any tracked process in state_processes for this nickname
                {
                    let mut processes = state_processes.0.lock().unwrap();
                    if let Some(robot_process) = processes.remove(nickname) {
                        robot_process.shutdown_flag.store(true, Ordering::Relaxed);
                    }
                }
            }
            _ => {
                println!("No existing robot process found, proceeding with start...");
            }
        }

        // Close the check session properly
        let _ = check_session.disconnect(russh::Disconnect::ByApplication, "", "").await;

        // Get the working directory path
        let working_dir = RemoteDirectoryService::get_lerobot_vulcan_dir()?;
        let working_dir_str = RemoteDirectoryService::to_linux_path_string(&working_dir);

        let command = format!(
            "bash -l -c 'cd {} && uv run python -u -m lerobot.robots.sourccey.sourccey.sourccey.sourccey_host > /dev/null 2>&1 & UV_PID=$!; sleep 0.3; PYTHON_PID=$(pgrep -P $UV_PID | head -1); if [ -n \"$PYTHON_PID\" ] && ps -p $PYTHON_PID > /dev/null 2>&1; then echo $PYTHON_PID; else echo \"\"; fi'",
            working_dir_str
        );

        let success_event = "robot-start-success".to_string();
        let success_log = "Robot started successfully".to_string();
        let success_complete_log = "Robot start command closed successfully".to_string();
        let error_event = "robot-start-error".to_string();
        let error_log = "Robot start command failed".to_string();
        let config = BackgroundCommandConfig::new(app_handle.clone())
            .with_success(success_event.clone(), success_log.clone())
            .with_error(error_event.clone(), error_log.clone())
            .with_logs(success_complete_log.clone());

        // Use async background command on Tauri runtime - don't wait for result
        let processes = state_processes.0.clone();
        let cfg = config;
        let rc = remote_config.clone();
        let name = nickname.to_string();

        // Create a fresh session specifically for the background command execution
        let mut session = SshService::create_ssh_session_async(
            &rc.remote_ip,
            &rc.remote_port,
            &rc.username,
            &rc.password,
        ).await?;

        // Spawn the background command execution - session is moved into this closure
        tauri::async_runtime::spawn(async move {
            if let Err(e) = SshService::execute_background_command_async(
                processes,
                &mut session,
                command,
                cfg,
                name
            ).await {
                eprintln!("[ERROR] Background command failed: {}", e);
            }
        });

        // Return immediately - the result will come via the event
        Ok(true)
    }

    //-----------------------------------------------------------------------------
    // Voice Listener Control Functions
    //-----------------------------------------------------------------------------
    pub async fn start_voice_listener(
        app_handle: AppHandle,
        state_sessions: &SshSessions,
        state_processes: &VoiceProcesses,
        remote_config: &RemoteConfig,
        nickname: &str,
    ) -> Result<bool, String> {
        // Check if robot is connected
        if !SshService::is_robot_connected(state_sessions, nickname) {
            return Err("Robot is not connected".to_string());
        }

        // Stop any existing voice listener process (by name) before starting
        let stop_check_command = "pgrep -f 'lerobot.robots.sourccey.sourccey.sourccey.voice_listener' > /dev/null 2>&1 && echo 'running' || echo 'stopped'";

        let mut check_session = SshService::create_ssh_session_async(
            &remote_config.remote_ip,
            &remote_config.remote_port,
            &remote_config.username,
            &remote_config.password,
        )
        .await?;

        match SshService::execute_command_read_output_async(&mut check_session, stop_check_command, 10).await {
            Ok(Some(output)) if output.trim().eq_ignore_ascii_case("running") => {
                println!("Voice listener is already running, stopping it first...");
                let kill_command = "pkill -f 'lerobot.robots.sourccey.sourccey.sourccey.voice_listener' || true";
                let _ = SshService::execute_command_async(&mut check_session, kill_command).await;

                // Also clean up any tracked process in state_processes for this nickname
                {
                    let mut processes = state_processes.0.lock().unwrap();
                    if let Some(proc_) = processes.remove(nickname) {
                        proc_.shutdown_flag.store(true, Ordering::Relaxed);
                    }
                }
            }
            _ => {
                println!("No existing voice listener process found, proceeding with start...");
            }
        }

        let _ = check_session
            .disconnect(russh::Disconnect::ByApplication, "", "")
            .await;

        // Get the working directory path (same as robot host)
        let working_dir = RemoteDirectoryService::get_lerobot_vulcan_dir()?;
        let working_dir_str = RemoteDirectoryService::to_linux_path_string(&working_dir);

        // Write logs to a file so we can debug missing mic/model issues remotely.
        let command = format!(
            "bash -l -c 'cd {} && uv run python -u -m lerobot.robots.sourccey.sourccey.sourccey.voice_listener > voice_listener.log 2>&1 & UV_PID=$!; sleep 0.3; PYTHON_PID=$(pgrep -P $UV_PID | head -1); if [ -n \"$PYTHON_PID\" ] && ps -p $PYTHON_PID > /dev/null 2>&1; then echo $PYTHON_PID; else echo \"\"; fi'",
            working_dir_str
        );

        let success_event = "voice-start-success".to_string();
        let success_log = "Voice listener started successfully".to_string();
        let success_complete_log = "Voice start command closed successfully".to_string();
        let error_event = "voice-start-error".to_string();
        let error_log = "Voice start command failed".to_string();
        let cfg = BackgroundCommandConfig::new(app_handle.clone())
            .with_success(success_event.clone(), success_log.clone())
            .with_error(error_event.clone(), error_log.clone())
            .with_logs(success_complete_log.clone());

        let processes = state_processes.0.clone();
        let rc = remote_config.clone();
        let name = nickname.to_string();

        let mut session = SshService::create_ssh_session_async(
            &rc.remote_ip,
            &rc.remote_port,
            &rc.username,
            &rc.password,
        )
        .await?;

        tauri::async_runtime::spawn(async move {
            if let Err(e) = SshService::execute_background_command_async(processes, &mut session, command, cfg, name).await {
                eprintln!("[ERROR] Voice background command failed: {}", e);
            }
        });

        Ok(true)
    }

    pub async fn stop_voice_listener(
        app_handle: AppHandle,
        state_sessions: &SshSessions,
        state_processes: &VoiceProcesses,
        remote_config: &RemoteConfig,
        nickname: &str,
    ) -> Result<bool, String> {
        if !SshService::is_robot_connected(state_sessions, nickname) {
            return Err("Robot is not connected".to_string());
        }

        let success_event = "voice-stop-success".to_string();
        let success_log = "Voice listener stopped successfully".to_string();
        let error_event = "voice-stop-error".to_string();
        let error_log = "Voice stop command failed".to_string();

        // Prefer stopping tracked PID if we have one; fall back to pkill by module name.
        let pid_opt = {
            let mut processes = state_processes.0.lock().unwrap();
            processes.remove(nickname).map(|p| {
                p.shutdown_flag.store(true, Ordering::Relaxed);
                p.pid
            })
        };

        // Create a fresh session
        match SshService::create_ssh_session_async(
            &remote_config.remote_ip,
            &remote_config.remote_port,
            &remote_config.username,
            &remote_config.password,
        )
        .await {
            Ok(mut session) => {
                let cmd = if let Some(pid) = pid_opt {
                    format!("kill -INT {} 2>/dev/null || true", pid)
                } else {
                    "pkill -f 'lerobot.robots.sourccey.sourccey.sourccey.voice_listener' || true".to_string()
                };

                match SshService::execute_command_async(&mut session, &cmd).await {
                    Ok(_) => {
                        let _ = app_handle.emit(
                            &success_event,
                            serde_json::json!({
                                "nickname": nickname,
                                "message": success_log
                            }),
                        );
                        Ok(true)
                    }
                    Err(e) => {
                        let _ = app_handle.emit(
                            &error_event,
                            serde_json::json!({
                                "nickname": nickname,
                                "error": format!("{}: {}", error_log, e)
                            }),
                        );
                        Err(format!("Failed to stop voice listener: {}", e))
                    }
                }
            }
            Err(e) => {
                let _ = app_handle.emit(
                    &error_event,
                    serde_json::json!({
                        "nickname": nickname,
                        "error": format!("Failed to create SSH session: {}", e)
                    }),
                );
                Err(format!("Failed to create SSH session: {}", e))
            }
        }
    }

    pub async fn is_voice_listener_started(
        app_handle: AppHandle,
        state_sessions: &SshSessions,
        remote_config: &RemoteConfig,
        nickname: &str,
    ) -> Result<bool, String> {
        if !SshService::is_robot_connected(state_sessions, nickname) {
            return Ok(false);
        }

        let check_command = "pgrep -f 'lerobot.robots.sourccey.sourccey.sourccey.voice_listener' > /dev/null 2>&1 && echo 'started' || echo 'stopped'";

        let success_event = "voice-is-started-success".to_string();
        let success_log = "Voice listener is started".to_string();
        let error_event = "voice-is-started-error".to_string();
        let error_log = "Voice listener is not started".to_string();

        match SshService::create_ssh_session_async(
            &remote_config.remote_ip,
            &remote_config.remote_port,
            &remote_config.username,
            &remote_config.password,
        )
        .await {
            Ok(mut session) => match SshService::execute_command_read_output_async(&mut session, &check_command, 10).await {
                Ok(Some(line)) => {
                    if line.eq_ignore_ascii_case("started") {
                        let _ = app_handle.emit(
                            &success_event,
                            serde_json::json!({
                                "nickname": nickname,
                                "message": success_log,
                                "output": "started"
                            }),
                        );
                        Ok(true)
                    } else {
                        let _ = app_handle.emit(
                            &error_event,
                            serde_json::json!({
                                "nickname": nickname,
                                "error": error_log,
                                "output": line.trim()
                            }),
                        );
                        Ok(false)
                    }
                }
                Ok(None) => {
                    let _ = app_handle.emit(
                        &error_event,
                        serde_json::json!({
                            "nickname": nickname,
                            "error": error_log,
                            "output": "stopped"
                        }),
                    );
                    Ok(false)
                }
                Err(e) => {
                    let _ = app_handle.emit(
                        &error_event,
                        serde_json::json!({
                            "nickname": nickname,
                            "error": format!("{}: {}", error_log, e),
                            "output": "stopped"
                        }),
                    );
                    Ok(false)
                }
            },
            Err(e) => {
                let _ = app_handle.emit(
                    &error_event,
                    serde_json::json!({
                        "nickname": nickname,
                        "error": format!("Failed to create SSH session: {}", e)
                    }),
                );
                Ok(false)
            }
        }
    }

    pub async fn stop_robot(
        app_handle: AppHandle,
        state_sessions: &SshSessions,
        state_processes: &RobotProcesses,
        remote_config: &RemoteConfig,
        nickname: &str,
    ) -> Result<bool, String> {
        // Check if robot is connected
        if !SshService::is_robot_connected(state_sessions, nickname) {
            return Err("Robot is not connected".to_string());
        }

        let success_event = "robot-stop-success".to_string();
        let success_log = "Robot stopped successfully".to_string();
        let error_event = "robot-stop-error".to_string();
        let error_log = "Robot stop command failed".to_string();
        let robot_process = {
            let mut processes = state_processes.0.lock().unwrap();
            match processes.remove(nickname) {
                Some(process) => process,
                None => {
                    println!("No process found for robot: {}", nickname);
                    let _ = app_handle.emit(
                        &success_event,
                        serde_json::json!({
                            "nickname": nickname,
                            "message": "Robot was already stopped"
                        }),
                    );
                    return Ok(true);
                }
            }
        };

        // Set the shutdown flag immediately
        robot_process.shutdown_flag.store(true, Ordering::Relaxed);

        // Attempt graceful termination with SIGINT on the group process id
        let kill_command = format!("kill -INT {} 2>/dev/null || true", robot_process.pid);

        // Create a fresh session using async version
        match SshService::create_ssh_session_async(
            &remote_config.remote_ip,
            &remote_config.remote_port,
            &remote_config.username,
            &remote_config.password,
        ).await {
            Ok(mut session) => {
                // Execute kill command using async version
                match SshService::execute_command_async(&mut session, &kill_command).await {
                    Ok(_) => {
                        // Emit success event after successfully sending kill signal
                        let _ = app_handle.emit(
                            &success_event,
                            serde_json::json!({
                                "nickname": nickname,
                                "message": success_log
                            }),
                        );
                        Ok(true)
                    }
                    Err(e) => {
                        // Emit error event if kill command failed
                        let _ = app_handle.emit(
                            &error_event,
                            serde_json::json!({
                                "nickname": nickname,
                                "error": format!("{}: {}", error_log, e)
                            }),
                        );
                        Err(format!("Failed to stop robot: {}", e))
                    }
                }
            }
            Err(e) => {
                // Emit error event if session creation failed
                let _ = app_handle.emit(
                    &error_event,
                    serde_json::json!({
                        "nickname": nickname,
                        "error": format!("Failed to create SSH session: {}", e)
                    }),
                );
                Err(format!("Failed to create SSH session: {}", e))
            }
        }
    }

    pub async fn is_robot_started(
        app_handle: AppHandle,
        state_sessions: &SshSessions,
        remote_config: &RemoteConfig,
        nickname: &str,
    ) -> Result<bool, String> {
        if !SshService::is_robot_connected(state_sessions, nickname) {
            return Ok(false);
        }

        // Check for the process by name instead of PID
        let check_command = "pgrep -f 'lerobot.robots.sourccey.sourccey.sourccey.sourccey_host' > /dev/null 2>&1 && echo 'started' || echo 'stopped'";

        // Add logging for the command being executed
        let success_event = "robot-is-started-success".to_string();
        let success_log = "Robot is started".to_string();
        let error_event = "robot-is-started-error".to_string();
        let error_log = "Robot is not started".to_string();

        match SshService::create_ssh_session_async(
            &remote_config.remote_ip,
            &remote_config.remote_port,
            &remote_config.username,
            &remote_config.password,
        ).await {
            Ok(mut session) => {
                match SshService::execute_command_read_output_async(&mut session, &check_command, 10).await {
                    Ok(Some(line)) => {
                        // Log the raw output received
                        if line.eq_ignore_ascii_case("started") {
                            let _ = app_handle.emit(
                                &success_event,
                                serde_json::json!({
                                    "nickname": nickname,
                                    "message": success_log,
                                    "output": "started"
                                }),
                            );
                            Ok(true)
                        } else {
                            let _ = app_handle.emit(
                                &error_event,
                                serde_json::json!({
                                    "nickname": nickname,
                                    "error": error_log,
                                    "output": line.trim()
                                }),
                            );
                            Ok(false)
                        }
                    }
                    Ok(None) => {
                        let _ = app_handle.emit(
                            &error_event,
                            serde_json::json!({
                                "nickname": nickname,
                                "error": error_log,
                                "output": "stopped"
                            }),
                        );
                        Ok(false)
                    }
                    Err(e) => {
                        let _ = app_handle.emit(
                            &error_event,
                            serde_json::json!({
                                "nickname": nickname,
                                "error": format!("{}: {}", error_log, e),
                                "output": "stopped"
                            }),
                        );
                        Ok(false)
                    }
                }
            }
            Err(e) => {
                let _ = app_handle.emit(
                    &error_event,
                    serde_json::json!({
                        "nickname": nickname,
                        "error": format!("Failed to create SSH session: {}", e)
                    }),
                );
                Ok(false)
            }
        }
    }
}
