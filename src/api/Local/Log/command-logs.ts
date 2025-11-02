import type { CommandLog, CommandLogFilters } from '@/types/Models/command-log';
import type { PaginatedResponse, PaginationParameters } from '@/types/PaginatedResponse';
import { invoke } from '@tauri-apps/api/core';

//-------------------------------------------------------------------------//
// Get Command Log
//-------------------------------------------------------------------------//
export const getCommandLog = async (id: string) => {
    const result = await invoke('get_command_log', { id });
    return result;
};

//-------------------------------------------------------------------------//
// Add Command Log
//-------------------------------------------------------------------------//

export const addCommandLog = async (commandLog: CommandLog) => {
    const result = await invoke('add_command_log', { commandLog });
    return result;
};

//-------------------------------------------------------------------------//
// Update Command Log
//-------------------------------------------------------------------------//
export const updateCommandLog = async (commandLog: CommandLog) => {
    const result = await invoke('update_command_log', { commandLog });
    return result;
};

//-------------------------------------------------------------------------//
// Delete Command Log
//-------------------------------------------------------------------------//
export const deleteCommandLog = async (id: string) => {
    const result = await invoke('delete_command_log', { id });
    return result;
};

export const deleteAllCommandLogs = async () => {
    await invoke('delete_all_command_logs');
};

//-------------------------------------------------------------------------//
// Get Command Logs Paginated
//-------------------------------------------------------------------------//
export const getCommandLogsPaginated = async (
    filters: CommandLogFilters,
    pagination: PaginationParameters
): Promise<PaginatedResponse<CommandLog>> => {
    try {
        const result = await invoke('get_command_logs_paginated', { filters, pagination });
        return result as PaginatedResponse<CommandLog>;
    } catch (error) {
        console.error('Error getting command logs:', error);
        throw error;
    }
};
