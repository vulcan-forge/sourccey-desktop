'use client';

import { invoke, isTauri } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';

export const CALIBRATION_DEBUG_LOGS_KEY = 'calibration-debug-logs';

type CalibrationDebugLogsOptions = {
    enabled?: boolean;
    maxLines?: number;
    maxLinesPerFile?: number;
    refetchIntervalMs?: number | false;
};

export const getCalibrationDebugLogs = async ({
    maxLines = 300,
    maxLinesPerFile = 150,
}: CalibrationDebugLogsOptions = {}): Promise<string[]> => {
    if (!isTauri()) {
        return [];
    }

    return await invoke<string[]>('get_log_tail_all', {
        max_lines: maxLines,
        max_lines_per_file: maxLinesPerFile,
    });
};

export const useCalibrationDebugLogs = ({
    enabled = true,
    maxLines = 300,
    maxLinesPerFile = 150,
    refetchIntervalMs = false,
}: CalibrationDebugLogsOptions = {}) =>
    useQuery({
        queryKey: [CALIBRATION_DEBUG_LOGS_KEY, maxLines, maxLinesPerFile],
        queryFn: () => getCalibrationDebugLogs({ maxLines, maxLinesPerFile }),
        enabled,
        staleTime: 0,
        retry: 1,
        refetchInterval: refetchIntervalMs,
    });
