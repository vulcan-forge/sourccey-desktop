import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface EvaluateStatus {
    active: boolean;
    last_command_time: number;
    source: string;
    nickname: string;
}

export const useEvaluateStatus = (pollInterval: number = 2000, enabled: boolean = true) => {
    const [evaluateStatus, setEvaluateStatus] = useState<EvaluateStatus | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Don't poll if disabled
        if (!enabled) {
            setIsLoading(false);
            setEvaluateStatus({
                active: false,
                last_command_time: 0,
                source: 'none',
                nickname: ''
            });
            return;
        }
        const pollEvaluateStatus = async () => {
            try {
                const status = await invoke<EvaluateStatus>('get_evaluate_status');
                setEvaluateStatus(status);
                setError(null);
            } catch (err) {
                console.error('Failed to get evaluate status:', err);
                setError(err instanceof Error ? err.message : 'Unknown error');
                // Set a default inactive status on error
                setEvaluateStatus({
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
        pollEvaluateStatus();

        // Set up polling interval
        const interval = setInterval(pollEvaluateStatus, pollInterval);

        return () => clearInterval(interval);
    }, [pollInterval, enabled]);

    return { 
        evaluateStatus, 
        isLoading, 
        error,
        isActive: evaluateStatus?.active ?? false,
        source: evaluateStatus?.source ?? 'none',
        nickname: evaluateStatus?.nickname ?? ''
    };
};
