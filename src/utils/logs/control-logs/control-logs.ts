import { ControlType, setControlledRobot } from '@/hooks/Control/control.hook';
import { getRemoteRobotState, setRemoteRobotState } from '@/hooks/Control/remote-control.hook';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'react-toastify';

export interface ProcessFailurePayload {
    nickname: string;
    exit_code: number | null;
    message: string;
}

export const filterLogs = (logs: string[]) => {
    return logs.filter((log) => {
        if (!log) return false;

        const trimmedLog = log.trim();
        if (trimmedLog === '') return false;

        return true;
    });
};

//----------------------------------------------------------------
// Log Listener Functions - BULLETPROOF VERSION
//----------------------------------------------------------------

class LogListenerManager {
    private static instance: LogListenerManager | null = null;
    private listeners: Map<string, () => void> = new Map();
    private isSetup = false;
    private setupPromise: Promise<void> | null = null;
    private onLogReceived: ((log: string) => void) | null = null;

    private constructor() {}

    public static getInstance(): LogListenerManager {
        if (!LogListenerManager.instance) {
            LogListenerManager.instance = new LogListenerManager();
        }
        return LogListenerManager.instance;
    }

    public async setup(onLogReceived: (log: string) => void): Promise<void> {
        // Store the callback
        this.onLogReceived = onLogReceived;

        // If already setup, return immediately
        if (this.isSetup) {
            return;
        }

        // If setup is in progress, wait for it
        if (this.setupPromise) {
            await this.setupPromise;
            return;
        }

        // Start setup
        this.setupPromise = this._doSetup();
        await this.setupPromise;
    }

    private async _doSetup(): Promise<void> {
        const logEvents = ['teleop-log', 'record-log', 'replay-log', 'evaluate-log', 'inference-log'];

        for (const eventName of logEvents) {
            const unlisten = await this.createLogListener(eventName);
            this.listeners.set(eventName, unlisten);
        }

        this.isSetup = true;
    }

    private async createLogListener(eventName: string): Promise<() => void> {
        try {
            const unlisten = await listen<string>(eventName, (event: any) => {
                if (this.onLogReceived) {
                    this.onLogReceived(event.payload);
                }
            });

            return unlisten;
        } catch (error) {
            console.error(`Failed to create listener for ${eventName}:`, error);
            return () => {}; // Return a no-op function as fallback
        }
    }

    public cleanup(): void {
        this.listeners.forEach((unlisten, eventName) => {
            try {
                unlisten();
            } catch (error) {
                console.error(`Error cleaning up listener for ${eventName}:`, error);
            }
        });
        this.listeners.clear();
        this.isSetup = false;
        this.setupPromise = null;
        this.onLogReceived = null;
    }

    public isListenerSetup(): boolean {
        return this.isSetup;
    }
}

// Export the singleton instance
export const logListenerManager = LogListenerManager.getInstance();

// New setup function that uses the singleton
export const setupLogListeners = async (onLogReceived: (log: string) => void) => {
    await logListenerManager.setup(onLogReceived);

    // Return a cleanup function that does nothing since we're using a singleton
    return () => {};
};

// Global cleanup function (call this when the app is shutting down)
export const cleanupAllLogListeners = () => {
    logListenerManager.cleanup();
};

//----------------------------------------------------------------
// Process Shutdown Listener Functions - BULLETPROOF VERSION
//----------------------------------------------------------------

class ProcessShutdownManager {
    private static instance: ProcessShutdownManager | null = null;
    private listeners: Map<string, () => void> = new Map();
    private isSetup = false;
    private setupPromise: Promise<void> | null = null;

    private constructor() {}

    public static getInstance(): ProcessShutdownManager {
        if (!ProcessShutdownManager.instance) {
            ProcessShutdownManager.instance = new ProcessShutdownManager();
        }
        return ProcessShutdownManager.instance;
    }

    public async setup(): Promise<void> {
        // If already setup, return immediately
        if (this.isSetup) {
            return;
        }

        // If setup is in progress, wait for it
        if (this.setupPromise) {
            await this.setupPromise;
            return;
        }

        // Start setup
        this.setupPromise = this._doSetup();
        await this.setupPromise;
    }

    private async _doSetup(): Promise<void> {
        const shutdownEvents = [
            { event: 'teleop-process-shutdown', controlType: ControlType.TELEOP, name: 'Teleop' },
            { event: 'record-process-shutdown', controlType: ControlType.RECORD, name: 'Record' },
            { event: 'replay-process-shutdown', controlType: ControlType.REPLAY, name: 'Replay' },
            { event: 'evaluate-process-shutdown', controlType: ControlType.EVALUATE, name: 'Evaluate' },
            { event: 'inference-process-shutdown', controlType: ControlType.AIMODEL, name: 'Inference' },
        ];

        for (const { event, controlType, name } of shutdownEvents) {
            const unlisten = await this.createProcessShutdownListener(event, controlType, name);
            this.listeners.set(event, unlisten);
        }

        this.isSetup = true;
    }

    private async createProcessShutdownListener(eventName: string, controlType: ControlType, processName: string): Promise<() => void> {
        try {
            const unlisten = await listen(eventName, (event: any) => {
                const { nickname, exit_code, message } = event.payload as ProcessFailurePayload;

                // Check if there's an error (non-zero exit code)
                if (exit_code !== null && exit_code !== 0) {
                    console.error(`🚨 ${processName} process failed:`, { nickname, exit_code, message });
                    toast.error(`${processName} process failed: ${message}`, {
                        ...toastErrorDefaults,
                    });
                } else {
                    // Success case (exit code 0 or null)
                    toast.success(`${processName} process completed successfully`, {
                        ...toastSuccessDefaults,
                    });
                }

                // Set controlled Robot
                setControlledRobot(nickname, controlType as ControlType, null);

                // Set remote controlled Robot
                const remoteRobotState = getRemoteRobotState(nickname);
                if (remoteRobotState) {
                    setRemoteRobotState(nickname, remoteRobotState.status, null, remoteRobotState.controlledRobot);
                }
            });

            return unlisten;
        } catch (error) {
            console.error(`Failed to create process shutdown listener for ${eventName}:`, error);
            return () => {}; // Return a no-op function as fallback
        }
    }

    public cleanup(): void {
        this.listeners.forEach((unlisten, eventName) => {
            try {
                unlisten();
            } catch (error) {
                console.error(`Error cleaning up listener for ${eventName}:`, error);
            }
        });
        this.listeners.clear();
        this.isSetup = false;
        this.setupPromise = null;
    }

    public isListenerSetup(): boolean {
        return this.isSetup;
    }
}

// Export the singleton instance
export const processShutdownManager = ProcessShutdownManager.getInstance();

// New setup function that uses the singleton
export const setupProcessShutdownListeners = async () => {
    await processShutdownManager.setup();

    // Return a cleanup function that does nothing since we're using a singleton
    return () => {};
};

// Global cleanup function (call this when the app is shutting down)
export const cleanupAllProcessShutdownListeners = () => {
    processShutdownManager.cleanup();
};
