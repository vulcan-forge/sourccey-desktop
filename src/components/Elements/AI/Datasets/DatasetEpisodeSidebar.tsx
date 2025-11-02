import React from 'react';
import { FaTimes, FaDatabase } from 'react-icons/fa';

interface DatasetEpisodeSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    episodes: number[];
    selectedEpisode?: number | null;
    onEpisodeSelect: (episodeNumber: number) => void;
    isLoading?: boolean;
}

export const DatasetEpisodeSidebar: React.FC<DatasetEpisodeSidebarProps> = ({
    isOpen,
    onClose,
    episodes,
    selectedEpisode,
    onEpisodeSelect,
    isLoading = false,
}) => {
    return (
        <>
            {/* Sidebar */}
            <div
                className={`fixed top-16 right-0 z-50 h-[calc(100vh-1rem)] w-80 transform border-l-2 border-slate-700 bg-slate-800 shadow-2xl transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} `}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b-2 border-slate-700 p-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                            <FaDatabase className="h-5 w-5 text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">Episodes</h2>
                            <p className="text-sm text-slate-400">{episodes.length} episodes</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-slate-700 text-slate-400 transition-colors hover:bg-slate-600 hover:text-slate-300"
                    >
                        <FaTimes className="h-4 w-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex h-[calc(100%-80px)] flex-col">
                    {isLoading ? (
                        <div className="flex flex-1 items-center justify-center">
                            <div className="text-center">
                                <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
                                <p className="text-slate-400">Loading episodes...</p>
                            </div>
                        </div>
                    ) : episodes.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center">
                            <div className="text-center">
                                <FaDatabase className="mx-auto mb-4 h-12 w-12 text-slate-600" />
                                <h3 className="mb-2 text-lg font-medium text-slate-300">No Episodes</h3>
                                <p className="text-sm text-slate-400">No episodes available for this dataset</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto p-4">
                            <div className="space-y-2">
                                {episodes.map((episodeNumber) => (
                                    <button
                                        key={episodeNumber}
                                        className={`w-full cursor-pointer rounded-lg border-2 p-3 text-left transition-all duration-200 ${
                                            selectedEpisode === episodeNumber
                                                ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                                                : 'border-slate-600 bg-slate-700 text-slate-200 hover:border-slate-500 hover:bg-slate-600 hover:text-slate-100'
                                        }`}
                                        onClick={() => onEpisodeSelect(episodeNumber)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                                                    selectedEpisode === episodeNumber ? 'bg-blue-500 text-white' : 'bg-slate-600 text-slate-300'
                                                }`}
                                            >
                                                {episodeNumber}
                                            </div>
                                            <span className="font-medium">Episode {episodeNumber}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {selectedEpisode && (
                    <div className="border-t-2 border-slate-700 p-4">
                        <div className="rounded-lg bg-slate-700 p-3">
                            <div className="text-sm font-medium text-slate-200">Selected Episode</div>
                            <div className="text-xs text-slate-400">Episode {selectedEpisode}</div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};
