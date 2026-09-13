export interface UploadDataset {
    name: string;
    path: string;
    infoPath: string;
    codebaseVersion: string;
    totalEpisodes: number;
    totalFrames: number;
}

export interface SkippedUploadDataset {
    name: string;
    path: string;
    reason: string;
}

export interface UploadDiscoveryReport {
    protocolVersion: number;
    root: string;
    datasets: UploadDataset[];
    skipped: SkippedUploadDataset[];
}

export interface UploadJob {
    id: string;
    sourcePath: string;
    repoId: string;
    revision: string;
    state: 'queued' | 'uploading' | 'paused' | 'completed' | 'failed' | 'cancelled';
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    completedAt: string | null;
    attemptCount: number;
    nextAttemptAt: number | null;
    filesTotal: number | null;
    bytesTotal: number | null;
    remoteUrl: string | null;
    lastError: string | null;
}

export interface UploadJobsReport {
    protocolVersion: number;
    jobs: UploadJob[];
}

export interface DatasetSyncIdentity {
    installationId: string;
    customerId: string | null;
    createdAt: string;
}

export interface QueueDatasetMetadataRequest {
    robotId: string;
    datasetId: string;
    metadata: unknown;
}

export interface QueuedDatasetMetadata {
    id: string;
    objectKey: string;
    payloadSha256: string;
    state: string;
    duplicate: boolean;
}
