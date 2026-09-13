import type { UploadDiscoveryReport, UploadJobsReport } from '@/types/Module/Upload/upload';
import { invoke } from '@tauri-apps/api/core';

export const discoverUploadDatasets = async (): Promise<UploadDiscoveryReport> => {
    return invoke<UploadDiscoveryReport>('discover_upload_datasets');
};

export const getUploadJobs = async (): Promise<UploadJobsReport> => {
    return invoke<UploadJobsReport>('get_upload_jobs');
};
