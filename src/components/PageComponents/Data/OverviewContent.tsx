'use client';

import React from 'react';
import { FaDatabase, FaVideo, FaChartBar, FaInfoCircle } from 'react-icons/fa';
import type { Dataset } from '@/types/Module/Dataset/dataset';
import type { ColumnInfo, ParquetDataset } from '@/types/Module/Dataset/dataset-parquet';
import type { VideoData } from '@/types/Module/Dataset/dataset-video';

interface OverviewContentProps {
    dataset: Dataset;
    parquetData: ParquetDataset | null;
    videoInfo: VideoData | null;
    isLoading: boolean;
}

export const OverviewContent: React.FC<OverviewContentProps> = ({ dataset, parquetData, videoInfo, isLoading }) => {
    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500"></div>
                    <p className="mt-4 text-slate-400">Loading dataset overview...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Dataset Summary */}
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
                <div className="mb-4 flex items-center gap-2">
                    <FaDatabase className="text-blue-400" />
                    <h2 className="text-xl font-semibold text-white">Dataset Summary</h2>
                </div>

                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div className="text-center">
                        <p className="text-2xl font-bold text-white">{parquetData?.total_episodes || 0}</p>
                        <p className="text-sm text-slate-400">Total Episodes</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold text-white">{parquetData?.total_rows.toLocaleString() || 0}</p>
                        <p className="text-sm text-slate-400">Total Rows</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold text-white">{videoInfo?.total_videos || 0}</p>
                        <p className="text-sm text-slate-400">Total Videos</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold text-white">{parquetData?.chunks.length || 0}</p>
                        <p className="text-sm text-slate-400">Chunks</p>
                    </div>
                </div>
            </div>

            {/* Dataset Information */}
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
                <div className="mb-4 flex items-center gap-2">
                    <FaInfoCircle className="text-green-400" />
                    <h3 className="text-lg font-semibold text-white">Dataset Information</h3>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                        <h4 className="font-medium text-slate-300">Repository Directory</h4>
                        <p className="text-white">{dataset.nickname}</p>
                    </div>
                    <div>
                        <h4 className="font-medium text-slate-300">Dataset Name</h4>
                        <p className="text-white">{dataset.dataset}</p>
                    </div>
                    <div>
                        <h4 className="font-medium text-slate-300">Path</h4>
                        <p className="font-mono text-sm text-white">{dataset.path}</p>
                    </div>
                    <div>
                        <h4 className="font-medium text-slate-300">Size</h4>
                        <p className="text-white">{dataset.size ? formatFileSize(dataset.size) : 'Unknown'}</p>
                    </div>
                    <div>
                        <h4 className="font-medium text-slate-300">Last Modified</h4>
                        <p className="text-white">{dataset.updated_at || 'Unknown'}</p>
                    </div>
                    <div>
                        <h4 className="font-medium text-slate-300">Episodes</h4>
                        <p className="text-white">{dataset.episodes || 0}</p>
                    </div>
                </div>
            </div>

            {/* Data Analysis Overview */}
            {parquetData && (
                <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
                    <div className="mb-4 flex items-center gap-2">
                        <FaChartBar className="text-purple-400" />
                        <h3 className="text-lg font-semibold text-white">Data Analysis Overview</h3>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="text-center">
                            <p className="text-2xl font-bold text-white">{parquetData.column_schema.length}</p>
                            <p className="text-sm text-slate-400">Data Columns</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-white">{formatFileSize(parquetData.total_size)}</p>
                            <p className="text-sm text-slate-400">Data Size</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-white">{parquetData.chunks.length}</p>
                            <p className="text-sm text-slate-400">Data Chunks</p>
                        </div>
                    </div>

                    {/* Column Types Summary */}
                    <div className="mt-4">
                        <h4 className="mb-2 font-medium text-slate-300">Column Types</h4>
                        <div className="flex flex-wrap gap-2">
                            {parquetData.column_schema.slice(0, 10).map((column: ColumnInfo, index: number) => (
                                <span key={index} className="rounded-md bg-slate-700 px-2 py-1 text-xs text-slate-300">
                                    {column.name}: {column.data_type}
                                </span>
                            ))}
                            {parquetData.column_schema.length > 10 && (
                                <span className="rounded-md bg-slate-600 px-2 py-1 text-xs text-slate-400">
                                    +{parquetData.column_schema.length - 10} more
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Video Analysis Overview */}
            {videoInfo && (
                <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
                    <div className="mb-4 flex items-center gap-2">
                        <FaVideo className="text-orange-400" />
                        <h3 className="text-lg font-semibold text-white">Video Analysis Overview</h3>
                    </div>

                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <div className="text-center">
                            <p className="text-2xl font-bold text-white">{videoInfo.cameras.length}</p>
                            <p className="text-sm text-slate-400">Cameras</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-white">{videoInfo.total_videos}</p>
                            <p className="text-sm text-slate-400">Video Episodes</p>
                        </div>
                    </div>

                    {/* Available Cameras */}
                    <div className="mt-4">
                        <h4 className="mb-2 font-medium text-slate-300">Available Cameras</h4>
                        <div className="flex flex-wrap gap-2">
                            {videoInfo.cameras.map((camera: string, index: number) => (
                                <span
                                    key={index}
                                    className="rounded-md border border-orange-500/20 bg-orange-900/30 px-2 py-1 text-xs text-orange-300"
                                >
                                    {camera}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Dataset Description */}
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
                <h3 className="mb-4 text-lg font-semibold text-white">Dataset Description</h3>
                <p className="text-slate-300">
                    This dataset contains {parquetData?.total_episodes || 0} episodes with {parquetData?.total_rows.toLocaleString() || 0} total
                    data points.
                    {videoInfo?.cameras && videoInfo.cameras.length > 0 && (
                        <>
                            {' '}
                            It includes video data from {videoInfo.cameras.length} camera
                            {videoInfo.cameras.length > 1 ? 's' : ''}: {videoInfo.cameras.join(', ')}.
                        </>
                    )}
                    {parquetData?.column_schema && (
                        <>
                            {' '}
                            The dataset includes {parquetData.column_schema.length} data columns covering various sensor readings and robot
                            states.
                        </>
                    )}
                </p>
            </div>
        </div>
    );
};
