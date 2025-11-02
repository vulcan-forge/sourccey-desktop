import React from 'react';
import { FaDatabase, FaFolder, FaTasks, FaEye, FaCalendarAlt, FaSpinner } from 'react-icons/fa';
import { formatFileSize } from '@/utils/file';
import type { Dataset } from '@/types/Module/Dataset/dataset';
import Link from 'next/link';

interface DatasetOverviewProps {
    dataset: Dataset | null;
    isLoading: boolean;
}

export const DatasetOverview: React.FC<DatasetOverviewProps> = ({ dataset, isLoading }) => {
    if (isLoading) {
        return (
            <div className="flex h-[310px] items-center justify-center rounded-xl border-2 border-slate-700 bg-slate-800 p-4 backdrop-blur-sm">
                <div className="flex items-center justify-center py-8">
                    <FaSpinner className="h-8 w-8 animate-spin text-blue-500" />
                </div>
            </div>
        );
    }

    if (!dataset) {
        return (
            <div className="flex h-[310px] items-center justify-center rounded-xl border-2 border-slate-700 bg-slate-800 p-4 backdrop-blur-sm">
                <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                        <FaDatabase className="mx-auto mb-3 h-8 w-8 text-slate-600" />
                        <h3 className="text-lg font-medium text-slate-300">No dataset selected</h3>
                        <p className="text-sm text-slate-400">Select a dataset from the list below to view details</p>
                    </div>
                </div>
            </div>
        );
    }

    const nickname = dataset?.nickname;
    const datasetName = dataset?.dataset;
    const repoId = `${nickname}/${datasetName}`;

    const episodes = dataset?.episodes || 0;
    const tasks = dataset?.tasks?.total_tasks || 0;
    const taskList = dataset?.tasks?.task_list || [];
    const size = dataset?.size || 0;
    const updatedAt = dataset?.updated_at;
    const formattedSize = formatFileSize(size);

    // Format the updated date
    const formatDate = (dateString: string) => {
        try {
            return new Date(dateString).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            });
        } catch {
            return 'Unknown';
        }
    };

    const datasetURL = `/app/data?nickname=${nickname}&dataset=${datasetName}`;
    return (
        <div className="flex h-[310px] flex-col gap-4 rounded-xl border-2 border-slate-700 bg-slate-800 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b-2 border-slate-700 pb-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/20">
                        <FaDatabase className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Selected Dataset</h2>
                    </div>
                </div>
                <div className="grow"></div>
                <div className="flex items-center gap-2">
                    <Link
                        href={datasetURL}
                        className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-500/20 px-4 py-2.5 font-medium text-blue-200 transition-all duration-200 hover:bg-blue-500/30 hover:text-blue-300 hover:shadow-md"
                    >
                        <FaEye className="text-sm" /> View Dataset
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg bg-slate-700 p-4">
                    <div className="mb-2 flex items-center gap-2">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/20">
                            <FaDatabase className="h-4 w-4 text-blue-400" />
                        </div>
                        <span className="text-sm font-medium text-slate-400">Dataset</span>
                    </div>
                    <div className="truncate text-sm text-slate-300">{datasetName || 'Unknown Dataset'}</div>
                </div>

                <div className="rounded-lg bg-slate-700 p-4">
                    <div className="mb-2 flex items-center gap-2">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-yellow-500/30">
                            <FaFolder className="h-4 w-4 text-yellow-400" />
                        </div>
                        <span className="text-sm font-medium text-slate-400">Repository</span>
                    </div>
                    <div className="truncate text-sm text-slate-300">{repoId || 'Unknown Repository'}</div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <div className="rounded-lg bg-slate-700 p-4">
                    <div className="mb-1 flex items-center gap-2">
                        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-green-500/20">
                            <FaTasks className="h-3 w-3 text-green-500" />
                        </div>
                        <span className="text-xs font-medium text-slate-400">Tasks</span>
                    </div>
                    <div className="text-lg font-bold text-slate-200">{tasks.toLocaleString()}</div>
                </div>
                <div className="rounded-lg bg-slate-700 p-4">
                    <div className="mb-1 text-xs font-medium text-slate-400">Episodes</div>
                    <div className="text-lg font-bold text-slate-200">{episodes.toLocaleString()}</div>
                </div>
                <div className="rounded-lg bg-slate-700 p-4">
                    <div className="mb-1 text-xs font-medium text-slate-400">Size</div>
                    <div className="text-lg font-bold text-slate-200">{formattedSize}</div>
                </div>
                <div className="rounded-lg bg-slate-700 p-4">
                    <div className="mb-1 flex items-center gap-2">
                        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-purple-500/20">
                            <FaCalendarAlt className="h-3 w-3 text-purple-500" />
                        </div>
                        <span className="text-xs font-medium text-slate-400">Updated</span>
                    </div>
                    <div className="text-lg font-bold text-slate-200">{formatDate(updatedAt)}</div>
                </div>
            </div>

            {/* Task List */}
            {taskList.length > 0 && (
                <div className="rounded-lg bg-slate-700 p-4">
                    <div className="mb-2 flex items-center gap-2">
                        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-orange-500/20">
                            <FaTasks className="h-3 w-3 text-orange-500" />
                        </div>
                        <span className="text-sm font-medium text-slate-400">Task List</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {taskList.slice(0, 4).map((task, index) => (
                            <span key={index} className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-300">
                                {task}
                            </span>
                        ))}
                        {taskList.length > 4 && (
                            <span className="rounded-full bg-slate-600/50 px-2 py-0.5 text-xs font-medium text-slate-400">
                                +{taskList.length - 4} more
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
