import type {
    DatasetSyncIdentity,
    QueueDatasetMetadataRequest,
    QueuedDatasetMetadata,
    UploadDiscoveryReport,
    UploadJobsReport,
} from '@/types/Module/Upload/upload';
import { invoke } from '@tauri-apps/api/core';

export const discoverUploadDatasets = async (): Promise<UploadDiscoveryReport> => {
    return invoke<UploadDiscoveryReport>('discover_upload_datasets');
};

export const getUploadJobs = async (): Promise<UploadJobsReport> => {
    return invoke<UploadJobsReport>('get_upload_jobs');
};

export const getDatasetSyncIdentity = async (): Promise<DatasetSyncIdentity> => {
    return invoke<DatasetSyncIdentity>('get_dataset_sync_identity');
};

export const queueDatasetMetadata = async (
    request: QueueDatasetMetadataRequest,
): Promise<QueuedDatasetMetadata> => {
    return invoke<QueuedDatasetMetadata>('queue_dataset_metadata', { request });
};
