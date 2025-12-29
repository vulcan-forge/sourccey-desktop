import type { RemoteConfig } from '@/components/PageComponents/OwnedRobots/RemoteRobotConfig';
import { invoke } from '@tauri-apps/api/core';

// SSH Control Functions
export class SshControl {
    // Connection management
    public static async connect(config: RemoteConfig, nickname: string): Promise<boolean> {
        try {
            const result = await invoke<boolean>('connect', { config, nickname });
            return result;
        } catch (error) {
            console.error(`Failed to connect to robot ${nickname}:`, error);
            throw error;
        }
    }

    public static async disconnect(config: RemoteConfig, nickname: string): Promise<boolean> {
        try {
            const result = await invoke<boolean>('disconnect', { config, nickname });
            return result;
        } catch (error) {
            console.error(`Failed to disconnect from robot ${nickname}:`, error);
            throw error;
        }
    }

    public static async isConnected(config: RemoteConfig, nickname: string): Promise<boolean> {
        try {
            console.info(`Before: Checking connection status for robot ${nickname}`);
            const result = await invoke<boolean>('is_connected', { config, nickname });
            console.info(`After: Connection status for robot ${nickname}:`, result);
            return result;
        } catch (error) {
            console.error(`Failed to check connection status for robot ${nickname}:`, error);
            throw error;
        }
    }

    // Robot control functions
    public static async startRobot(config: RemoteConfig, nickname: string): Promise<boolean> {
        try {
            const result = await invoke<boolean>('start_robot', { config, nickname });
            return result;
        } catch (error) {
            console.error(`Failed to start robot ${nickname}:`, error);
            throw error;
        }
    }

    public static async stopRobot(config: RemoteConfig, nickname: string): Promise<boolean> {
        try {
            const result = await invoke<boolean>('stop_robot', { config, nickname });
            return result;
        } catch (error) {
            console.error(`Failed to stop robot ${nickname}:`, error);
            throw error;
        }
    }

    public static async isRobotStarted(config: RemoteConfig, nickname: string): Promise<boolean> {
        try {
            const result = await invoke<boolean>('is_robot_started', { config, nickname });
            return result;
        } catch (error) {
            console.error(`Failed to check robot status for ${nickname}:`, error);
            throw error;
        }
    }

    // Voice listener control functions
    public static async startVoiceListener(config: RemoteConfig, nickname: string): Promise<boolean> {
        try {
            const result = await invoke<boolean>('start_voice_listener', { config, nickname });
            return result;
        } catch (error) {
            console.error(`Failed to start voice listener for ${nickname}:`, error);
            throw error;
        }
    }

    public static async stopVoiceListener(config: RemoteConfig, nickname: string): Promise<boolean> {
        try {
            const result = await invoke<boolean>('stop_voice_listener', { config, nickname });
            return result;
        } catch (error) {
            console.error(`Failed to stop voice listener for ${nickname}:`, error);
            throw error;
        }
    }

    public static async isVoiceListenerStarted(config: RemoteConfig, nickname: string): Promise<boolean> {
        try {
            const result = await invoke<boolean>('is_voice_listener_started', { config, nickname });
            return result;
        } catch (error) {
            console.error(`Failed to check voice listener status for ${nickname}:`, error);
            throw error;
        }
    }
}

// Convenience functions for direct use
export const sshConnect = SshControl.connect;
export const sshDisconnect = SshControl.disconnect;
export const sshIsConnected = SshControl.isConnected;
export const sshStartRobot = SshControl.startRobot;
export const sshStopRobot = SshControl.stopRobot;
export const sshIsRobotStarted = SshControl.isRobotStarted;
export const sshStartVoiceListener = SshControl.startVoiceListener;
export const sshStopVoiceListener = SshControl.stopVoiceListener;
export const sshIsVoiceListenerStarted = SshControl.isVoiceListenerStarted;
