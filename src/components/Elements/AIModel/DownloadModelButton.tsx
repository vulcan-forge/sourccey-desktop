'use client';

import { useEffect, useRef, useState } from 'react';
import { FaDownload, FaStop } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { toastErrorDefaults } from '@/utils/toast/toast-utils';
import {
    AI_MODEL_KEY,
    useAiModelDownloadStatus,
    useCancelAiModelDownload,
    useDownloadAiModelFromHuggingface,
} from '@/hooks/Models/AIModel/ai-model.hook';
import { queryClient } from '@/hooks/default';
import { GeneralModal } from '@/components/Elements/Modals/GeneralModal';

type DownloadModelButtonProps = {
    onCompleteAction?: () => void;
    className?: string;
    label?: string;
};

export const DownloadModelButton = ({ onCompleteAction, className, label = 'Download Model' }: DownloadModelButtonProps) => {
    const { mutateAsync: downloadModel, isPending: isStarting } = useDownloadAiModelFromHuggingface();
    const { mutateAsync: cancelDownload, isPending: isCancelling } = useCancelAiModelDownload();
    const { data: download } = useAiModelDownloadStatus();
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
    const [downloadInput, setDownloadInput] = useState('');
    const observedUpdateRef = useRef<number | null>(null);

    useEffect(() => {
        if (!download) return;
        if (observedUpdateRef.current === null) {
            observedUpdateRef.current = download.updatedAtEpochMs;
            return;
        }
        if (observedUpdateRef.current === download.updatedAtEpochMs) return;
        observedUpdateRef.current = download.updatedAtEpochMs;

        if (download.status === 'completed') {
            void queryClient.invalidateQueries({ queryKey: AI_MODEL_KEY });
            onCompleteAction?.();
        }
    }, [download, onCompleteAction]);

    const parseHuggingFaceInput = (input: string): string | null => {
        const trimmed = input.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            try {
                const url = new URL(trimmed);
                const host = url.hostname.toLowerCase();
                if (!host.endsWith('huggingface.co') && !host.endsWith('hf.co')) return null;
                const [owner, repo] = url.pathname.split('/').filter(Boolean);
                if (!owner || !repo) return null;
                return `${owner}/${repo.replace(/\.git$/i, '')}`;
            } catch {
                return null;
            }
        }

        const [owner, repo] = trimmed.split('/').filter(Boolean);
        if (!owner || !repo) return null;
        return `${owner}/${repo.replace(/\.git$/i, '')}`;
    };

    const handleDownloadModel = async () => {
        const repoId = parseHuggingFaceInput(downloadInput);
        if (!repoId) {
            toast.error('Enter a valid Hugging Face repo URL or repo ID (org/model).', { ...toastErrorDefaults });
            return;
        }

        try {
            await downloadModel({ repoId });
            setDownloadInput('');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error || 'Model download failed.');
            toast.error(message, { ...toastErrorDefaults });
        }
    };

    const handleCancelDownload = async () => {
        try {
            await cancelDownload();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error || 'Could not cancel model download.');
            toast.error(message, { ...toastErrorDefaults });
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
        return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    };

    const isDownloading = Boolean(download?.running || isStarting);
    const progress = download?.progress ?? null;
    const statusLabel =
        download?.status === 'completed'
            ? 'Download complete'
            : download?.status === 'error'
              ? 'Download failed'
              : download?.status === 'cancelled'
                ? 'Download cancelled'
                : download?.status === 'cancelling'
                  ? 'Cancelling download'
                  : download?.status === 'stalled'
                    ? 'Download stalled'
                    : download?.status === 'starting'
                      ? 'Preparing download'
                      : 'Downloading from Hugging Face';

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
                {isDownloading && typeof progress === 'number' ? `${progress}%` : label}
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
                            disabled={isDownloading}
                            placeholder="Enter Hugging Face repo URL or repo ID (org/model)"
                            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:border-emerald-400/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>

                    {download && download.status !== 'idle' && (
                        <div className="min-w-0 space-y-2 rounded-md border border-slate-700/60 bg-slate-900/70 px-3 py-2">
                            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
                                <span className="min-w-0 truncate">{download.repoId ? `${statusLabel}: ${download.repoId}` : statusLabel}</span>
                                {typeof progress === 'number' && <span className="shrink-0">{progress}%</span>}
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                                <div
                                    className={`h-2 rounded-full transition-all ${
                                        download.status === 'error'
                                            ? 'bg-red-500/70'
                                            : download.status === 'stalled'
                                              ? 'bg-amber-400/80'
                                              : download.status === 'cancelled'
                                                ? 'bg-slate-500/70'
                                                : 'bg-emerald-400/80'
                                    } ${progress === null && download.running ? 'w-1/3 animate-pulse' : ''}`}
                                    style={progress !== null ? { width: `${progress}%` } : undefined}
                                />
                            </div>
                            <div className="text-[11px] text-slate-300">
                                {`Transferred ${formatBytes(download.downloadedBytes)} / ${formatBytes(download.totalBytes)}`}
                                {download.speedBps && download.running ? ` at ${formatBytes(download.speedBps)}/s` : ''}
                            </div>
                            {download.currentFile && download.running && (
                                <div className="space-y-1 text-[11px] text-slate-400">
                                    <div className="rounded border border-slate-700/60 bg-slate-950/30 px-2 py-1 break-all">
                                        {`Current file: ${download.currentFile}`}
                                    </div>
                                    {download.currentFileTotalBytes && (
                                        <div>{`${formatBytes(download.currentFileBytes)} / ${formatBytes(download.currentFileTotalBytes)}`}</div>
                                    )}
                                </div>
                            )}
                            {download.status === 'stalled' && (
                                <div className="text-[11px] text-amber-300">
                                    {`No byte progress for ${formatDuration(download.stallSeconds)}. The backend is still retrying.`}
                                </div>
                            )}
                            {download.message && <div className="text-[11px] text-slate-300">{download.message}</div>}
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                        {isDownloading && (
                            <div className="pr-2 text-[11px] text-amber-200/90">You can close this window; the download will continue.</div>
                        )}
                        {download?.running ? (
                            <button
                                type="button"
                                onClick={() => void handleCancelDownload()}
                                disabled={download.cancelRequested || isCancelling}
                                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-100 transition-colors hover:border-red-400/70 disabled:cursor-wait disabled:opacity-60"
                            >
                                <FaStop />
                                {download.cancelRequested || isCancelling ? 'Cancelling...' : 'Cancel'}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => void handleDownloadModel()}
                                disabled={isStarting}
                                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-100 transition-colors hover:border-emerald-400/70 disabled:cursor-wait disabled:opacity-60"
                            >
                                {isStarting ? 'Starting...' : 'Download'}
                            </button>
                        )}
                    </div>
                </div>
            </GeneralModal>
        </>
    );
};
