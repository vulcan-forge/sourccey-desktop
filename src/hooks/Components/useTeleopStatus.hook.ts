import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface TeleopStatus {
    active: boolean;
    last_command_time: number;
    source: string;
    nickname: string;
}

export const useTeleopStatus = (pollInterval: number = 2000, enabled: boolean = true) => {
    const [teleopStatus, setTeleopStatus] = useState<TeleopStatus | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Don't poll if disabled
        if (!enabled) {
            setIsLoading(false);
            setTeleopStatus({
                active: false,
                last_command_time: 0,
                source: 'none',
                nickname: ''
            });
            return;
        }
        const pollTeleopStatus = async () => {
            try {
                const status = await invoke<TeleopStatus>('get_teleop_status');
                setTeleopStatus(status);
                setError(null);
            } catch (err) {
                console.error('Failed to get teleop status:', err);
                setError(err instanceof Error ? err.message : 'Unknown error');
                // Set a default inactive status on error
                setTeleopStatus({
                    active: false,
                    last_command_time: 0,
                    source: 'none',
                    nickname: ''
                });
            } finally {
                setIsLoading(false);
            }
        };

        // Poll immediately
        pollTeleopStatus();

        // Set up polling interval
        const interval = setInterval(pollTeleopStatus, pollInterval);

        return () => clearInterval(interval);
    }, [pollInterval, enabled]);

    return { 
        teleopStatus, 
        isLoading, 
        error,
        isActive: teleopStatus?.active ?? false,
        source: teleopStatus?.source ?? 'none',
        nickname: teleopStatus?.nickname ?? ''
    };
};
