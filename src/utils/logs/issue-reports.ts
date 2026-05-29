import { invoke, isTauri } from '@tauri-apps/api/core';

export const writeIssueReport = async (category: string, title: string, detail: string): Promise<string | null> => {
    if (!isTauri()) {
        return null;
    }

    try {
        return await invoke<string>('write_issue_report', { category, title, detail });
    } catch (error) {
        console.error('Failed to write issue report:', error);
        return null;
    }
};
