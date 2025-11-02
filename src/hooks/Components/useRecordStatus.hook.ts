import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface RecordStatus {
    active: boolean;
    last_command_time: number;
    source: string;
    nickname: string;
}

export const useRecordStatus = (pollInterval: number = 2000, enabled: boolean = true) => {
    const [recordStatus, setRecordStatus] = useState<RecordStatus | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Don't poll if disabled
        if (!enabled) {
            setIsLoading(false);
            setRecordStatus({
                active: false,
                last_command_time: 0,
                source: 'none',
                nickname: ''
            });
            return;
        }
        const pollRecordStatus = async () => {
            try {
                const status = await invoke<RecordStatus>('get_record_status');
                setRecordStatus(status);
                setError(null);
            } catch (err) {
                console.error('Failed to get record status:', err);
                setError(err instanceof Error ? err.message : 'Unknown error');
                // Set a default inactive status on error
                setRecordStatus({
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
        pollRecordStatus();

        // Set up polling interval
        const interval = setInterval(pollRecordStatus, pollInterval);

        return () => clearInterval(interval);
    }, [pollInterval, enabled]);

    return { 
        recordStatus, 
        isLoading, 
        error,
        isActive: recordStatus?.active ?? false,
        source: recordStatus?.source ?? 'none',
        nickname: recordStatus?.nickname ?? ''
    };
};
