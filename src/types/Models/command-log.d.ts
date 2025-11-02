import { Robot } from '@/types/Models/robot';

export interface CommandLog {
    id: string;
    command: string;
    description?: string;
    status: 'success' | 'failed' | 'running' | 'cancelled';
    exit_code?: number;
    output?: string;
    error_message?: string;
    robot_id?: string;
    owned_robot_id?: string;
    profile_id?: string;
    execution_time_ms?: number;
    started_at: string;
    completed_at?: string;
    created_at?: string;
    updated_at?: string;
    deleted_at?: string;

    // Relations
    robot?: {
        id: string;
        name?: string;
        long_name?: string;
        robot_type?: string;
    };
    owned_robot?: {
        id: string;
        nickname?: string;
    };
    profile?: {
        id: string;
        handle: string;
        name?: string;
    };
}

export interface CommandLogFilters {
    command?: string;
    robot_id?: string;
    owned_robot_id?: string;
    profile_id?: string;
    status?: string;
    started_after?: string; // ISO date string
    started_before?: string; // ISO date string
    completed_after?: string; // ISO date string
    completed_before?: string; // ISO date string
}

export interface CommandLogSort {
    field: string;
    order: 'asc' | 'desc';
}
