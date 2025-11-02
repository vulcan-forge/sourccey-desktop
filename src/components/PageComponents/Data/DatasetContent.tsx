'use client';

import { useState } from 'react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { formatFileSize } from '@/utils/file';
import { useGetDatasetParquet } from '@/hooks/Components/AI/Dataset/dataset-parquet.hook';
import type { ColumnInfo, ParquetEpisode } from '@/types/Module/Dataset/dataset-parquet';
import type { Dataset } from '@/types/Module/Dataset/dataset';

interface DataContentProps {
    dataset: Dataset;
    isLoading: boolean;
}

export const DataContent = ({ dataset, isLoading }: DataContentProps) => {
    const [selectedEpisode, setSelectedEpisode] = useState<ParquetEpisode | null>(null);
    const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set());
    const [showAllRows, setShowAllRows] = useState(false);

    const datasetPath = dataset.path;
    const { data: parquet, isLoading: isLoadingParquet, error }: any = useGetDatasetParquet(datasetPath);

    const toggleColumnExpansion = (columnName: string) => {
        const newExpanded = new Set(expandedColumns);
        if (newExpanded.has(columnName)) {
            newExpanded.delete(columnName);
        } else {
            newExpanded.add(columnName);
        }
        setExpandedColumns(newExpanded);
    };

    const renderValue = (value: any): string => {
        if (value === null || value === undefined) return 'null';
        if (typeof value === 'object') {
            return JSON.stringify(value, null, 2);
        }
        return String(value);
    };

    if (isLoading || isLoadingParquet) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500"></div>
                    <p className="mt-4 text-slate-400">Loading parquet data...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-lg border border-red-700/50 bg-red-900/20 p-6">
                <h3 className="mb-2 text-lg font-semibold text-red-400">Error Loading Data</h3>
                <p className="text-red-300">{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-4 rounded-md bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (!parquet) {
        return (
            <div className="py-12 text-center">
                <p className="text-slate-400">No dataset information available</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Dataset Overview */}
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
                <h2 className="mb-4 text-xl font-semibold text-white">Dataset Overview</h2>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div className="text-center">
                        <p className="text-2xl font-bold text-white">{parquet.total_episodes}</p>
                        <p className="text-sm text-slate-400">Total Episodes</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold text-white">{parquet.total_rows.toLocaleString()}</p>
                        <p className="text-sm text-slate-400">Total Rows</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold text-white">{formatFileSize(parquet.total_size)}</p>
                        <p className="text-sm text-slate-400">Total Size</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold text-white">{parquet.chunks.length}</p>
                        <p className="text-sm text-slate-400">Chunks</p>
                    </div>
                </div>
            </div>

            {/* Column Schema */}
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
                <h3 className="mb-4 text-lg font-semibold text-white">Column Schema</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-700">
                                <th className="p-2 text-left text-slate-300">Column</th>
                                <th className="p-2 text-left text-slate-300">Type</th>
                                <th className="p-2 text-left text-slate-300">Nullable</th>
                            </tr>
                        </thead>
                        <tbody>
                            {parquet.column_schema.map((column: ColumnInfo, index: number) => (
                                <tr key={index} className="border-b border-slate-700/30">
                                    <td className="p-2 text-white">{column.name}</td>
                                    <td className="p-2 font-mono text-xs text-slate-300">{column.data_type}</td>
                                    <td className="p-2">
                                        <span
                                            className={`rounded px-2 py-1 text-xs ${
                                                column.nullable ? 'bg-yellow-900/30 text-yellow-300' : 'bg-green-900/30 text-green-300'
                                            }`}
                                        >
                                            {column.nullable ? 'Yes' : 'No'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Episodes List */}
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
                <h3 className="mb-4 text-lg font-semibold text-white">Episodes</h3>
                <div className="space-y-3">
                    {parquet.episodes.map((episode: any, index: number) => (
                        <div
                            key={index}
                            className={`cursor-pointer rounded-lg border p-4 transition-all ${
                                selectedEpisode?.episode_id === episode.episode_id
                                    ? 'border-blue-600/50 bg-blue-900/30'
                                    : 'border-slate-600/50 bg-slate-700/30 hover:bg-slate-700/50'
                            }`}
                            onClick={() => setSelectedEpisode(episode)}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-medium text-white">{episode.episode_id}</h4>
                                    <p className="text-sm text-slate-400">Chunk: {episode.chunk_id}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-white">{episode.row_count.toLocaleString()} rows</p>
                                    <p className="text-sm text-slate-400">{formatFileSize(episode.file_size)}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Selected Episode Data */}
            {selectedEpisode && (
                <div className="rounded-lg border border-slate-700 bg-slate-800 p-6">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-white">Episode Data: {selectedEpisode.episode_id}</h3>
                        <button
                            onClick={() => setShowAllRows(!showAllRows)}
                            className="flex items-center gap-2 rounded bg-slate-700 px-3 py-1 text-sm transition-colors hover:bg-slate-600"
                        >
                            {showAllRows ? <FaEyeSlash /> : <FaEye />}
                            {showAllRows ? 'Show Sample' : 'Show All'}
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-700">
                                    {selectedEpisode.columns.map((column, index) => (
                                        <th key={index} className="p-2 text-left text-slate-300">
                                            <div className="flex items-center gap-2">
                                                <span>{column}</span>
                                                <button
                                                    onClick={() => toggleColumnExpansion(column)}
                                                    className="text-slate-500 hover:text-slate-300"
                                                >
                                                    {expandedColumns.has(column) ? <FaEyeSlash size={12} /> : <FaEye size={12} />}
                                                </button>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(showAllRows ? selectedEpisode.sample_data : selectedEpisode.sample_data.slice(0, 10)).map((row, rowIndex) => (
                                    <tr key={rowIndex} className="border-b border-slate-700/30">
                                        {selectedEpisode.columns.map((column, colIndex) => (
                                            <td key={colIndex} className="p-2">
                                                <div className={`max-w-xs ${expandedColumns.has(column) ? '' : 'truncate'}`}>
                                                    {expandedColumns.has(column) ? (
                                                        <pre className="text-xs whitespace-pre-wrap text-slate-300">
                                                            {renderValue(row[column])}
                                                        </pre>
                                                    ) : (
                                                        <span className="text-slate-300" title={renderValue(row[column])}>
                                                            {renderValue(row[column])}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
