'use client';

import { useEffect, useRef, useState } from 'react';
import { FaDownload } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { useDownloadAiModelFromHuggingface } from '@/hooks/Models/AIModel/ai-model.hook';
import { GeneralModal } from '@/components/Elements/Modals/GeneralModal';
import { listen } from '@tauri-apps/api/event';

type DownloadStatus = 'idle' | 'starting' | 'downloading' | 'stalled' | 'completed' | 'error';

type DownloadModelButtonProps = {
    onCompleteAction?: () => void;
    className?: string;
    label?: string;
};

export const DownloadModelButton = ({ onCompleteAction, className, label = 'Download Model' }: DownloadModelButtonProps) => {
    const { mutateAsync: downloadModel, isPending: isDownloading } = useDownloadAiModelFromHuggingface();
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
    const [downloadInput, setDownloadInput] = useState('');
    const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('idle');
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
    const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
    const [downloadedBytes, setDownloadedBytes] = useState<number | null>(null);
    const [totalBytes, setTotalBytes] = useState<number | null>(null);
    const [downloadSpeedBps, setDownloadSpeedBps] = useState<number | null>(null);
    const [stallSeconds, setStallSeconds] = useState<number>(0);
    const [currentFile, setCurrentFile] = useState<string | null>(null);
    const [currentFileBytes, setCurrentFileBytes] = useState<number | null>(null);
    const [currentFileTotalBytes, setCurrentFileTotalBytes] = useState<number | null>(null);
    const [activeDownloadRepo, setActiveDownloadRepo] = useState<string | null>(null);
    const activeDownloadRepoRef = useRef<string | null>(null);
    const completionHandledRef = useRef(false);
    const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        activeDownloadRepoRef.current = activeDownloadRepo;
    }, [activeDownloadRepo]);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        listen('ai-model-download-progress', (event) => {
            const payload = event.payload as {
                repoId?: string;
                status?: 'starting' | 'downloading' | 'stalled' | 'completed' | 'error';
                progress?: number | null;
                message?: string;
                current?: number | null;
                total?: number | null;
                downloadedBytes?: number | null;
                totalBytes?: number | null;
                speedBps?: number | null;
                stallSeconds?: number | null;
                currentFile?: string | null;
                currentFileBytes?: number | null;
                currentFileTotalBytes?: number | null;
            };

            const trackedRepo = activeDownloadRepoRef.current;
            if (!trackedRepo) {
                return;
            }
            if (payload?.repoId && payload.repoId !== trackedRepo) {
                return;
            }

            if (payload?.status) {
                setDownloadStatus(payload.status);
            }

            if (typeof payload?.progress === 'number') {
                const normalized = Math.max(0, Math.min(100, Math.round(payload.progress)));
                setDownloadProgress(normalized);
            } else if (typeof payload?.downloadedBytes === 'number' && typeof payload?.totalBytes === 'number' && payload.totalBytes > 0) {
                const computed = Math.round((payload.downloadedBytes / payload.totalBytes) * 100);
                setDownloadProgress(Math.max(0, Math.min(100, computed)));
            } else if (typeof payload?.current === 'number' && typeof payload?.total === 'number' && payload.total > 0) {
                const computed = Math.round((payload.current / payload.total) * 100);
                setDownloadProgress(Math.max(0, Math.min(100, computed)));
            }

            if (payload?.message) {
                setDownloadMessage(payload.message);
            }

            if (typeof payload?.downloadedBytes === 'number') {
                setDownloadedBytes(payload.downloadedBytes);
            }
            if (typeof payload?.totalBytes === 'number') {
                setTotalBytes(payload.totalBytes);
            }
            if (typeof payload?.speedBps === 'number') {
                setDownloadSpeedBps(payload.speedBps);
            }
            if (typeof payload?.stallSeconds === 'number') {
                setStallSeconds(Math.max(0, Math.round(payload.stallSeconds)));
            }
            if ('currentFile' in payload) {
                setCurrentFile(payload.currentFile ?? null);
            }
            if (typeof payload?.currentFileBytes === 'number') {
                setCurrentFileBytes(payload.currentFileBytes);
            } else if ('currentFileBytes' in payload && payload.currentFileBytes === null) {
                setCurrentFileBytes(null);
            }
            if (typeof payload?.currentFileTotalBytes === 'number') {
                setCurrentFileTotalBytes(payload.currentFileTotalBytes);
            } else if ('currentFileTotalBytes' in payload && payload.currentFileTotalBytes === null) {
                setCurrentFileTotalBytes(null);
            }
        }).then((fn) => {
            unlisten = fn;
        });

        return () => {
            if (unlisten) {
                unlisten();
            }
        };
    }, []);

    useEffect(() => {
        if (!isDownloadModalOpen) {
            completionHandledRef.current = false;
            if (completionTimeoutRef.current) {
                clearTimeout(completionTimeoutRef.current);
                completionTimeoutRef.current = null;
            }
            setDownloadStatus('idle');
            setDownloadProgress(null);
            setDownloadMessage(null);
            setDownloadedBytes(null);
            setTotalBytes(null);
            setDownloadSpeedBps(null);
            setStallSeconds(0);
            setCurrentFile(null);
            setCurrentFileBytes(null);
            setCurrentFileTotalBytes(null);
            setActiveDownloadRepo(null);
            activeDownloadRepoRef.current = null;
        }
    }, [isDownloadModalOpen]);

    useEffect(() => {
        if (!isDownloadModalOpen) return;
        if (downloadStatus !== 'completed') return;
        if (downloadProgress !== 100) return;
        if (completionHandledRef.current) return;

        completionHandledRef.current = true;
        completionTimeoutRef.current = setTimeout(() => {
            setIsDownloadModalOpen(false);
            setDownloadInput('');
            setActiveDownloadRepo(null);
            toast.success('Model download complete.', { ...toastSuccessDefaults });
            if (onCompleteAction) {
                onCompleteAction();
            }
            completionTimeoutRef.current = null;
        }, 450);
    }, [downloadProgress, downloadStatus, isDownloadModalOpen, onCompleteAction]);

    const parseHuggingFaceInput = (input: string): string | null => {
        const trimmed = input.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            try {
                const url = new URL(trimmed);
                const host = url.hostname.toLowerCase();
                if (!host.endsWith('huggingface.co') && !host.endsWith('hf.co')) {
                    return null;
                }
                const parts = url.pathname.split('/').filter(Boolean);
                const [owner, repo] = parts;
                if (!owner || !repo) return null;
                return `${owner}/${repo.replace(/\.git$/i, '')}`;
            } catch {
                return null;
            }
        }

        const parts = trimmed.split('/').filter(Boolean);
        const [owner, repo] = parts;
        if (!owner || !repo) return null;
        return trimmed.replace(/\.git$/i, '');
    };

    const handleDownloadModel = async () => {
        const repoId = parseHuggingFaceInput(downloadInput);
        if (!repoId) {
            toast.error('Enter a valid Hugging Face repo URL or repo ID (org/model).', { ...toastErrorDefaults });
            return;
        }

        try {
            completionHandledRef.current = false;
            if (completionTimeoutRef.current) {
                clearTimeout(completionTimeoutRef.current);
                completionTimeoutRef.current = null;
            }
            setActiveDownloadRepo(repoId);
            activeDownloadRepoRef.current = repoId;
            setDownloadStatus('starting');
            setDownloadProgress(0);
            setDownloadMessage(null);
            setDownloadedBytes(0);
            setTotalBytes(null);
            setDownloadSpeedBps(null);
            setStallSeconds(0);
            setCurrentFile(null);
            setCurrentFileBytes(null);
            setCurrentFileTotalBytes(null);
            await downloadModel({ repoId });
            setDownloadStatus('completed');
            setDownloadProgress(100);
        } catch (error: any) {
            console.error(error);
            setDownloadStatus('error');
            setDownloadMessage(error?.message || 'Model download failed.');
            toast.error(error?.message || 'Model download failed.', { ...toastErrorDefaults });
        }
    };

    const formatBytes = (value?: number | null): string => {
        if (typeof value !== 'number' || Number.isNaN(value) || value < 0) return '--';
        if (value === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
        const scaled = value / Math.pow(1024, exponent);
        const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
        return `${scaled.toFixed(digits)} ${units[exponent]}`;
    };

    const formatDuration = (seconds: number): string => {
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remain = seconds % 60;
        if (minutes < 60) return `${minutes}m ${remain}s`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ${minutes % 60}m`;
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setIsDownloadModalOpen(true)}
                className={
                    className ??
                    'inline-flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-500/50 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:border-emerald-400/70 hover:text-emerald-100'
                }
            >
                <FaDownload />
                {label}
            </button>

            <GeneralModal
                isOpen={isDownloadModalOpen}
                onClose={() => setIsDownloadModalOpen(false)}
                title="Download AI Models"
                size="sm"
                borderClassName="border-2 border-slate-600"
            >
                <div className="space-y-4 rounded-lg border-slate-700/50 bg-slate-900 p-4">
                    <div className="space-y-3">
                        <label className="text-xs font-semibold text-slate-300">Model repo</label>
                        <input
                            value={downloadInput}
                            onChange={(event) => setDownloadInput(event.target.value)}
                            placeholder="Enter Hugging Face repo URL or repo ID (org/model)"
                            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:border-emerald-400/60 focus:outline-none"
                        />
                    </div>

                    {downloadStatus !== 'idle' && (
                        <div className="space-y-2 rounded-md border border-slate-700/60 bg-slate-900/70 px-3 py-2">
                            <div className="flex items-center justify-between text-[11px] text-slate-300">
                                <span>
                                    {downloadStatus === 'completed'
                                        ? 'Download complete'
                                        : downloadStatus === 'error'
                                          ? 'Download failed'
                                          : downloadStatus === 'stalled'
                                            ? 'Download stalled'
                                            : downloadStatus === 'starting'
                                              ? 'Preparing download'
                                              : 'Downloading from Hugging Face'}
                                </span>
                                {typeof downloadProgress === 'number' && <span>{downloadProgress}%</span>}
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                                <div
                                    className={`h-2 rounded-full transition-all ${
                                        downloadStatus === 'error'
                                            ? 'bg-red-500/70'
                                            : downloadStatus === 'stalled'
                                              ? 'bg-amber-400/80'
                                              : 'bg-emerald-400/80'
                                    } ${downloadProgress === null ? 'w-1/3 animate-pulse' : ''}`}
                                    style={downloadProgress !== null ? { width: `${downloadProgress}%` } : undefined}
                                />
                            </div>
                            <div className="text-[11px] text-slate-300">
                                {`Transferred ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`}
                                {downloadSpeedBps && downloadStatus !== 'completed' ? ` at ${formatBytes(downloadSpeedBps)}/s` : ''}
                            </div>
                            {currentFile && downloadStatus !== 'completed' && (
                                <div className="space-y-1 text-[11px] text-slate-400">
                                    <div className="overflow-x-auto rounded border border-slate-700/60 bg-slate-950/30 px-2 py-1 whitespace-nowrap">
                                        {`Current file: ${currentFile}`}
                                    </div>
                                    {currentFileTotalBytes && (
                                        <div>{`${formatBytes(currentFileBytes)} / ${formatBytes(currentFileTotalBytes)}`}</div>
                                    )}
                                </div>
                            )}
                            {downloadStatus === 'stalled' && (
                                <div className="text-[11px] text-amber-300">
                                    {`No byte progress for ${formatDuration(stallSeconds)}. Download is still running and will resume once data flows.`}
                                </div>
                            )}
                            {downloadMessage && (
                                <div className={`text-[11px] ${downloadStatus === 'error' ? 'text-red-300' : 'text-slate-300'}`}>
                                    {downloadMessage}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                        {isDownloading && (
                            <div className="pr-2 text-[11px] text-amber-200/90">
                                Some robotics models are very large and will take a long time to download
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={handleDownloadModel}
                            disabled={isDownloading}
                            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                                isDownloading
                                    ? 'cursor-not-allowed border border-slate-700/60 bg-slate-800/60 text-slate-400'
                                    : 'cursor-pointer border border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:border-emerald-400/70'
                            }`}
                        >
                            {isDownloading ? 'Downloading...' : 'Download'}
                        </button>
                    </div>
                </div>
            </GeneralModal>
        </>
    );
};
