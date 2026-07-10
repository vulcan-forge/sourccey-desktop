#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::Command as StdCommand;
use tokio::process::Command as TokioCommand;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn configure_std_command(_command: &mut StdCommand) {
    #[cfg(windows)]
    {
        _command.creation_flags(CREATE_NO_WINDOW);
    }
}

pub fn configure_tokio_command(_command: &mut TokioCommand) {
    #[cfg(windows)]
    {
        _command.creation_flags(CREATE_NO_WINDOW);
    }
}
