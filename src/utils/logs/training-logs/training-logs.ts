import { setIsTraining } from '@/hooks/AI/training.hook';
import { getTrainingLogs, setTrainingLogs } from '@/hooks/Components/Log/training-log.hook';
import { ControlType, setControlledRobot } from '@/hooks/Control/control.hook';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'react-toastify';

export interface ProcessFailurePayload {
    nickname: string;
    model_name?: string;
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
// Log Listener Functions - CLEANED UP VERSION
//----------------------------------------------------------------

class LogListenerManager {
    private static instance: LogListenerManager | null = null;
    private listeners: Map<string, () => void> = new Map();
    private isSetup = false;
    private setupPromise: Promise<void> | null = null;
    private onLogReceived: ((log: string, modelName: string) => void) | null = null;

    private constructor() {}

    public static getInstance(): LogListenerManager {
        if (!LogListenerManager.instance) {
            LogListenerManager.instance = new LogListenerManager();
        }
        return LogListenerManager.instance;
    }

    public async setup(onLogReceived: (log: string, modelName: string) => void): Promise<void> {
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
        const logEvents = ['training-log'];

        for (const eventName of logEvents) {
            const unlisten = await this.createLogListener(eventName);
            this.listeners.set(eventName, unlisten);
        }

        this.isSetup = true;
    }

    // Method to add listeners for specific models
    public async addModelListener(modelName: string): Promise<void> {
        const eventName = `training-log-${modelName}`;

        if (this.listeners.has(eventName)) {
            return; // Already listening to this model
        }

        try {
            const unlisten = await this.createLogListener(eventName);
            this.listeners.set(eventName, unlisten);
        } catch (error) {
            console.error(`Failed to create listener for ${eventName}:`, error);
        }
    }

    // Method to remove listeners for specific models
    public removeModelListener(modelName: string): void {
        const eventName = `training-log-${modelName}`;
        const unlisten = this.listeners.get(eventName);

        if (unlisten) {
            try {
                unlisten();
            } catch (error) {
                console.error(`Error cleaning up listener for ${eventName}:`, error);
            }
            this.listeners.delete(eventName);
        }
    }

    private async createLogListener(eventName: string): Promise<() => void> {
        try {
            const unlisten = await listen<string>(eventName, (event: any) => {
                if (this.onLogReceived) {
                    const modelName = this.extractModelNameFromEvent(eventName, event.payload);
                    this.onLogReceived(event.payload, modelName);
                }
            });

            return unlisten;
        } catch (error) {
            console.error(`Failed to create listener for ${eventName}:`, error);
            return () => {}; // Return a no-op function as fallback
        }
    }

    private extractModelNameFromEvent(eventName: string, payload: string): string {
        // If it's a model-specific event, extract from event name
        if (eventName.startsWith('training-log-')) {
            return eventName.replace('training-log-', '');
        }

        // Otherwise, try to extract from payload or return 'default'
        // You can adjust this based on your payload format
        return 'default';
    }
}

// Export the singleton instance
export const logListenerManager = LogListenerManager.getInstance();

// Setup function that uses the singleton
export const setupLogListeners = async () => {
    // Set up the callback to process logs when they arrive
    const onLogReceived = (log: string, modelName: string) => {
        const currentLogs = getTrainingLogs(modelName);
        const updatedLogs = Array.isArray(currentLogs) ? [...currentLogs, log] : [log];
        setTrainingLogs(modelName, updatedLogs);
    };

    await logListenerManager.setup(onLogReceived);
};

// Helper functions to manage model-specific listeners
export const addModelLogListener = async (modelName: string) => {
    await setupLogListeners();
    await logListenerManager.addModelListener(modelName);
};

export const removeModelLogListener = (modelName: string) => {
    logListenerManager.removeModelListener(modelName);
};

//----------------------------------------------------------------
// Process Shutdown Listener Functions - CLEANED UP VERSION
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
        const shutdownEvents = [{ event: 'training-process-shutdown', controlType: ControlType.TRAINING, name: 'Training' }];

        for (const { event, controlType, name } of shutdownEvents) {
            const unlisten = await this.createProcessShutdownListener(event, controlType, name);
            this.listeners.set(event, unlisten);
        }

        this.isSetup = true;
    }

    // Method to add listeners for specific models
    public async addModelShutdownListener(modelName: string): Promise<void> {
        const eventName = `training-process-shutdown-${modelName}`;

        if (this.listeners.has(eventName)) {
            return; // Already listening to this model
        }

        try {
            const unlisten = await this.createProcessShutdownListener(eventName, ControlType.TRAINING, `Training-${modelName}`);
            this.listeners.set(eventName, unlisten);
        } catch (error) {
            console.error(`Failed to create shutdown listener for ${eventName}:`, error);
        }
    }

    // Method to remove listeners for specific models
    public removeModelShutdownListener(modelName: string): void {
        const eventName = `training-process-shutdown-${modelName}`;
        const unlisten = this.listeners.get(eventName);

        if (unlisten) {
            try {
                unlisten();
            } catch (error) {
                console.error(`Error cleaning up listener for ${eventName}:`, error);
            }
            this.listeners.delete(eventName);
        }
    }

    private async createProcessShutdownListener(eventName: string, controlType: ControlType, processName: string): Promise<() => void> {
        try {
            const unlisten = await listen(eventName, (event: any) => {
                const { nickname, model_name, exit_code, message } = event.payload as ProcessFailurePayload;

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

                setTrainingLogs(model_name ?? '', null);
            });

            return unlisten;
        } catch (error) {
            console.error(`Failed to create process shutdown listener for ${eventName}:`, error);
            return () => {}; // Return a no-op function as fallback
        }
    }
}

// Export the singleton instance
export const processShutdownManager = ProcessShutdownManager.getInstance();

// Setup function that uses the singleton
export const setupProcessShutdownListeners = async () => {
    await processShutdownManager.setup();
};

// Helper functions to manage model-specific shutdown listeners
export const addModelShutdownListener = async (modelName: string) => {
    await processShutdownManager.addModelShutdownListener(modelName);
};

export const removeModelShutdownListener = (modelName: string) => {
    processShutdownManager.removeModelShutdownListener(modelName);
};
