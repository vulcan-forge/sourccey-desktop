import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ReplayStatus {
    active: boolean;
    last_command_time: number;
    source: string;
    nickname: string;
}

export const useReplayStatus = (pollInterval: number = 2000, enabled: boolean = true) => {
    const [replayStatus, setReplayStatus] = useState<ReplayStatus | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Don't poll if disabled
        if (!enabled) {
            setIsLoading(false);
            setReplayStatus({
                active: false,
                last_command_time: 0,
                source: 'none',
                nickname: ''
            });
            return;
        }
        const pollReplayStatus = async () => {
            try {
                const status = await invoke<ReplayStatus>('get_replay_status');
                setReplayStatus(status);
                setError(null);
            } catch (err) {
                console.error('Failed to get replay status:', err);
                setError(err instanceof Error ? err.message : 'Unknown error');
                // Set a default inactive status on error
                setReplayStatus({
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
        pollReplayStatus();

        // Set up polling interval
        const interval = setInterval(pollReplayStatus, pollInterval);

        return () => clearInterval(interval);
    }, [pollInterval, enabled]);

    return { 
        replayStatus, 
        isLoading, 
        error,
        isActive: replayStatus?.active ?? false,
        source: replayStatus?.source ?? 'none',
        nickname: replayStatus?.nickname ?? ''
    };
};
