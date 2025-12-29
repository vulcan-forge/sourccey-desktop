import { listen } from '@tauri-apps/api/event';

// Export types for use in components
interface SshConnectionSuccess {
    nickname: string;
    message: string;
}

interface SshConnectionError {
    nickname: string;
    error: string;
}

interface SshConnectionStatusSuccess {
    nickname: string;
    message: string;
    output: string;
}

interface SshConnectionStatusError {
    nickname: string;
    error: string;
}

interface SshRobotStartSuccess {
    nickname: string;
    message: string;
}

interface SshRobotStartError {
    nickname: string;
    error: string;
}

interface SshRobotStopSuccess {
    nickname: string;
    message: string;
}

interface SshRobotStopError {
    nickname: string;
    error: string;
}

interface SshRobotStartedSuccess {
    nickname: string;
    message: string;
    output: string;
}

interface SshRobotStartedError {
    nickname: string;
    error: string;
}

interface SshVoiceStartSuccess {
    nickname: string;
    message: string;
    pid?: number;
}

interface SshVoiceStartError {
    nickname: string;
    error: string;
}

interface SshVoiceStopSuccess {
    nickname: string;
    message: string;
}

interface SshVoiceStopError {
    nickname: string;
    error: string;
}

interface SshVoiceStartedSuccess {
    nickname: string;
    message: string;
    output: string;
}

interface SshVoiceStartedError {
    nickname: string;
    error: string;
    output?: string;
}

// SSH connection state management
class SshEventManager {
    private listeners: (() => void)[] = [];
    private connectionStates: Map<string, 'connecting' | 'connected' | 'disconnected' | 'error'> = new Map();
    private errorMessages: Map<string, string> = new Map();
    private isInitialized = false;

    constructor() {
        // Only initialize on client side to prevent SSR errors
        if (typeof window !== 'undefined') {
            this.setupEventListeners();
            this.isInitialized = true;
        }
    }

    private async setupEventListeners() {
        // Double check we're in browser environment
        if (typeof window === 'undefined') {
            return;
        }

        try {
            // Listen for SSH connection success
            const unlistenConnectionSuccess = await listen<SshConnectionSuccess>('ssh-connection-success', (event) => {
                console.log('SSH connection successful:', event.payload);
                this.connectionStates.set(event.payload.nickname, 'connected');
                this.errorMessages.delete(event.payload.nickname);

                // Call the event handler
                this.onConnectionSuccess(event.payload);
            });

            // Listen for SSH connection errors
            const unlistenConnectionError = await listen<SshConnectionError>('ssh-connection-error', (event) => {
                console.error('SSH connection failed:', event.payload);
                this.connectionStates.set(event.payload.nickname, 'error');
                this.errorMessages.set(event.payload.nickname, event.payload.error);

                // Call the event handler
                this.onConnectionError(event.payload);
            });

            const unlistenConnectionStatusSuccess = await listen<SshConnectionStatusSuccess>('ssh-is-connected', (event) => {
                this.onConnectionStatusSuccess(event.payload);
            });

            const unlistenConnectionStatusError = await listen<SshConnectionStatusError>('ssh-is-connected-error', (event) => {
                this.onConnectionStatusError(event.payload);
            });

            const unlistenRobotStartSuccess = await listen<SshRobotStartSuccess>('robot-start-success', (event) => {
                this.onRobotStartSuccess(event.payload);
            });

            const unlistenRobotStartError = await listen<SshRobotStartError>('robot-start-error', (event) => {
                this.onRobotStartError(event.payload);
            });

            const unlistenRobotStopSuccess = await listen<SshRobotStopSuccess>('robot-stop-success', (event) => {
                this.onRobotStopSuccess(event.payload);
            });

            const unlistenRobotStopError = await listen<SshRobotStopError>('robot-stop-error', (event) => {
                this.onRobotStopError(event.payload);
            });

            const unlistenRobotStartedSuccess = await listen<SshRobotStartedSuccess>('robot-is-started-success', (event) => {
                this.onRobotStartedSuccess(event.payload);
            });

            const unlistenRobotStartedError = await listen<SshRobotStartedError>('robot-is-started-error', (event) => {
                this.onRobotStartedError(event.payload);
            });

            const unlistenVoiceStartSuccess = await listen<SshVoiceStartSuccess>('voice-start-success', (event) => {
                this.onVoiceStartSuccess(event.payload);
            });

            const unlistenVoiceStartError = await listen<SshVoiceStartError>('voice-start-error', (event) => {
                this.onVoiceStartError(event.payload);
            });

            const unlistenVoiceStopSuccess = await listen<SshVoiceStopSuccess>('voice-stop-success', (event) => {
                this.onVoiceStopSuccess(event.payload);
            });

            const unlistenVoiceStopError = await listen<SshVoiceStopError>('voice-stop-error', (event) => {
                this.onVoiceStopError(event.payload);
            });

            const unlistenVoiceStartedSuccess = await listen<SshVoiceStartedSuccess>('voice-is-started-success', (event) => {
                this.onVoiceStartedSuccess(event.payload);
            });

            const unlistenVoiceStartedError = await listen<SshVoiceStartedError>('voice-is-started-error', (event) => {
                this.onVoiceStartedError(event.payload);
            });

            // Store listeners for cleanup
            this.listeners.push(
                unlistenConnectionSuccess,
                unlistenConnectionError as () => void,
                unlistenConnectionStatusSuccess,
                unlistenConnectionStatusError as () => void,
                unlistenRobotStartSuccess,
                unlistenRobotStartError as () => void,
                unlistenRobotStopSuccess,
                unlistenRobotStopError as () => void,
                unlistenRobotStartedSuccess,
                unlistenRobotStartedError as () => void,
                unlistenVoiceStartSuccess,
                unlistenVoiceStartError as () => void,
                unlistenVoiceStopSuccess,
                unlistenVoiceStopError as () => void,
                unlistenVoiceStartedSuccess,
                unlistenVoiceStartedError as () => void
            );
        } catch (error) {
            console.error('Failed to setup SSH event listeners:', error);
        }
    }

    // Cleanup method
    public cleanup() {
        this.listeners.forEach((unlisten) => unlisten());
        this.listeners = [];
    }

    // Event handler callbacks that can be overridden by components
    public onConnectionSuccess: (event: SshConnectionSuccess) => void = (event) => {
        console.log(`✅ Robot ${event.nickname} connected successfully: ${event.message}`);
    };

    public onConnectionError: (event: SshConnectionError) => void = (event) => {
        console.error(`❌ Robot ${event.nickname} connection failed: ${event.error}`);
    };

    public onConnectionStatusSuccess: (event: SshConnectionStatusSuccess) => void = (event) => {
        console.log(`🔄 Robot ${event.nickname} is connected: ${event.message}`);
    };

    public onConnectionStatusError: (event: SshConnectionStatusError) => void = (event) => {
        console.error(`❌ Robot ${event.nickname} is not connected: ${event.error}`);
    };

    public onRobotStartSuccess: (event: SshRobotStartSuccess) => void = (event) => {
        console.log(`✅ Robot ${event.nickname} started successfully: ${event.message}`);
    };

    public onRobotStartError: (event: SshRobotStartError) => void = (event) => {
        console.error(`❌ Robot ${event.nickname} start failed: ${event.error}`);
    };

    public onRobotStopSuccess: (event: SshRobotStopSuccess) => void = (event) => {
        console.log(`✅ Robot ${event.nickname} stopped successfully: ${event.message}`);
    };

    public onRobotStopError: (event: SshRobotStopError) => void = (event) => {
        console.error(`❌ Robot ${event.nickname} stop failed: ${event.error}`);
    };

    public onRobotStartedSuccess: (event: SshRobotStartedSuccess) => void = (event) => {
        console.log(`✅ Robot ${event.nickname} is running: ${event.message}`);
    };

    public onRobotStartedError: (event: SshRobotStartedError) => void = (event) => {
        console.error(`❌ Robot ${event.nickname} is not running: ${event.error}`);
    };

    public onVoiceStartSuccess: (event: SshVoiceStartSuccess) => void = (event) => {
        console.log(`✅ Voice listener started for ${event.nickname}: ${event.message}`);
    };

    public onVoiceStartError: (event: SshVoiceStartError) => void = (event) => {
        console.error(`❌ Voice listener start failed for ${event.nickname}: ${event.error}`);
    };

    public onVoiceStopSuccess: (event: SshVoiceStopSuccess) => void = (event) => {
        console.log(`✅ Voice listener stopped for ${event.nickname}: ${event.message}`);
    };

    public onVoiceStopError: (event: SshVoiceStopError) => void = (event) => {
        console.error(`❌ Voice listener stop failed for ${event.nickname}: ${event.error}`);
    };

    public onVoiceStartedSuccess: (event: SshVoiceStartedSuccess) => void = (event) => {
        console.log(`✅ Voice listener running for ${event.nickname}: ${event.message}`);
    };

    public onVoiceStartedError: (event: SshVoiceStartedError) => void = (event) => {
        console.error(`❌ Voice listener not running for ${event.nickname}: ${event.error}`);
    };
}

// Export singleton instance
export const sshLogManager = new SshEventManager();

export type {
    SshConnectionSuccess,
    SshConnectionError,
    SshConnectionStatusSuccess,
    SshConnectionStatusError,
    SshRobotStartSuccess,
    SshRobotStartError,
    SshRobotStopSuccess,
    SshRobotStopError,
    SshRobotStartedSuccess,
    SshRobotStartedError,
    SshVoiceStartSuccess,
    SshVoiceStartError,
    SshVoiceStopSuccess,
    SshVoiceStopError,
    SshVoiceStartedSuccess,
    SshVoiceStartedError,
};
