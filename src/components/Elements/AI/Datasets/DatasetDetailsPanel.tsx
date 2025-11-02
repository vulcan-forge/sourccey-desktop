import { getFeatures } from '@/utils/lerobot-dataset/features';
import React from 'react';
import { FaTrash, FaDatabase } from 'react-icons/fa';
import { useGetSelectedDatasets } from '@/hooks/Components/AI/Dataset/dataset.hook';

interface DatasetDetailsPanelProps {
    // Remove the dataset prop since we'll get it from the hook
}

export const DatasetDetailsPanel: React.FC<DatasetDetailsPanelProps> = () => {
    const { data: selectedDatasets = [] }: any = useGetSelectedDatasets();
    const dataset = selectedDatasets.length > 0 ? selectedDatasets[0] : null;
    if (!dataset) {
        return (
            <div className="mb-4 flex w-full flex-col items-center justify-center rounded-xl border border-slate-700 bg-slate-800 p-12 shadow-lg">
                <FaDatabase className="mx-auto mb-4 h-16 w-16 text-slate-600" />
                <h3 className="mb-2 text-xl font-semibold text-slate-300">No Dataset Selected</h3>
                <p className="max-w-md text-center text-slate-400">
                    Please select a dataset from the list to view its details and available actions.
                </p>
            </div>
        );
    }

    const { repo_id, name, size, episodes, updated_at, path } = dataset;
    const tasks = dataset?.tasks?.task_list;
    const features = getFeatures(dataset);

    const currentURL = window?.location?.pathname;
    const datasetURL = `/app/data?repo_id=${repo_id}&name=${name}`;
    return (
        <div className="mb-4 flex w-full flex-col rounded-xl border-2 border-slate-700 bg-slate-800 p-8 shadow-lg">
            <div className="border-slate-650 relative mb-8 border-b pb-6">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="mb-2 text-xl font-bold text-white">{name}</h3>
                        <p className="text-sm text-slate-400">Path: {path || 'N/A'}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                <div className="bg-slate-750 border-slate-650 rounded-lg border-2 p-6">
                    <h4 className="border-slate-650 mb-4 border-b pb-2 text-lg font-semibold text-white">Metadata</h4>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Episodes</span>
                            <span className="font-medium text-slate-200">{episodes || 0}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Size</span>
                            <span className="font-medium text-slate-200">{size ? `${(size / (1024 * 1024)).toFixed(2)} MB` : 'Unknown'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">Date Modified</span>
                            <span className="max-w-[60%] text-right font-medium break-words text-slate-200">{updated_at || 'Unknown'}</span>
                        </div>
                    </div>
                </div>

                {/* Tasks Section */}
                <div className="bg-slate-750 border-slate-650 rounded-lg border-2 p-6">
                    <h4 className="border-slate-650 mb-4 border-b pb-2 text-lg font-semibold text-white">Tasks</h4>
                    <div className="space-y-2">
                        {tasks?.length ? (
                            tasks.map((task: string, idx: number) => (
                                <div key={idx} className="rounded-md bg-slate-600/30 px-3 py-2 text-sm text-slate-200">
                                    {task}
                                </div>
                            ))
                        ) : (
                            <div className="py-2 text-sm text-slate-500">No tasks available</div>
                        )}
                    </div>
                </div>

                <div className="bg-slate-750 border-slate-650 rounded-lg border-2 p-6">
                    <h4 className="border-slate-650 mb-4 border-b pb-2 text-lg font-semibold text-white">Features</h4>
                    <div className="flex flex-wrap gap-2">
                        {(features || []).length ? (
                            features.map((feature: string, idx: number) => (
                                <span
                                    key={idx}
                                    className="inline-flex items-center rounded-md border border-green-400/20 bg-green-500/20 px-3 py-1.5 text-xs font-medium text-green-300"
                                >
                                    {feature}
                                </span>
                            ))
                        ) : (
                            <span className="text-sm text-slate-500">No features listed</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="border-slate-650 mt-8 flex flex-wrap justify-end gap-3 border-t pt-6">
                <button className="flex cursor-pointer items-center gap-2 rounded-lg bg-red-500/40 px-4 py-2.5 font-medium text-red-200 transition-all duration-200 hover:bg-red-500/60 hover:text-red-300 hover:shadow-md active:bg-red-500/80">
                    <FaTrash className="text-sm" /> Delete
                </button>
            </div>
        </div>
    );
};
