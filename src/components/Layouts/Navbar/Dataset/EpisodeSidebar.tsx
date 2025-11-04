'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { FaChevronLeft, FaChevronRight, FaDatabase, FaSearch, FaTimes } from 'react-icons/fa';
import type { ParquetEpisode } from '@/types/Module/Dataset/dataset-parquet';

interface EpisodeSidebarProps {
    episodes: ParquetEpisode[];
    selectedEpisodeId: string | null;
    onEpisodeSelect: (episodeId: string) => void;
    isLoading?: boolean;
    className?: string;
}

export const EpisodeSidebar: React.FC<EpisodeSidebarProps> = ({
    episodes,
    selectedEpisodeId,
    onEpisodeSelect,
    isLoading = false,
    className = '',
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [displayedEpisodes, setDisplayedEpisodes] = useState<ParquetEpisode[]>([]);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadingTriggerRef = useRef<HTMLDivElement>(null);

    const EPISODES_PER_PAGE = 15;

    // Memoize filtered episodes to prevent infinite re-renders
    const filteredEpisodes = useMemo(() => {
        return episodes.filter(
            (episode) =>
                episode.episode_id.toString().toLowerCase().includes(searchTerm.toLowerCase()) ||
                episode.chunk_id.toString().toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [episodes, searchTerm]);

    // Load more episodes for infinite scroll
    const loadMoreEpisodes = useCallback(() => {
        if (isLoadingMore || !hasMore) return;

        setIsLoadingMore(true);

        setTimeout(() => {
            const currentLength = displayedEpisodes.length;
            const nextBatch = filteredEpisodes.slice(currentLength, currentLength + EPISODES_PER_PAGE);

            if (nextBatch.length === 0) {
                setHasMore(false);
            } else {
                setDisplayedEpisodes((prev) => [...prev, ...nextBatch]);
            }

            setIsLoadingMore(false);
        }, 150);
    }, [displayedEpisodes.length, filteredEpisodes, isLoadingMore, hasMore]);

    // Initialize displayed episodes
    useEffect(() => {
        setDisplayedEpisodes(filteredEpisodes.slice(0, EPISODES_PER_PAGE));
        setHasMore(filteredEpisodes.length > EPISODES_PER_PAGE);
    }, [searchTerm, filteredEpisodes]);

    // Set up intersection observer for infinite scroll
    useEffect(() => {
        if (observerRef.current) {
            observerRef.current.disconnect();
        }

        observerRef.current = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting && hasMore && !isLoadingMore) {
                    loadMoreEpisodes();
                }
            },
            { threshold: 0.1 }
        );

        if (loadingTriggerRef.current) {
            observerRef.current.observe(loadingTriggerRef.current);
        }

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [loadMoreEpisodes, hasMore, isLoadingMore]);

    // Reset search when episodes change
    useEffect(() => {
        setSearchTerm('');
    }, [episodes]);

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const clearSearch = () => {
        setSearchTerm('');
    };

    if (isCollapsed) {
        return (
            <div className={`flex flex-col items-center border-l border-gray-600 bg-gradient-to-b from-gray-800 to-gray-900 py-4 ${className}`}>
                <button
                    onClick={() => setIsCollapsed(false)}
                    className="cursor-pointer rounded-lg p-2 text-gray-400 transition-all duration-200 hover:bg-gray-700 hover:text-white"
                    title="Expand sidebar"
                >
                    <FaChevronLeft className="h-4 w-4" />
                </button>
            </div>
        );
    }

    return (
        <div className={`flex h-full w-80 flex-col border-l border-gray-600 bg-gradient-to-b from-gray-800 to-gray-900 shadow-xl ${className}`}>
            {/* Header */}
            <div className="border-b border-gray-600 p-4">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                        <FaDatabase className="h-4 w-4 text-emerald-400" />
                        Episodes
                    </h2>
                    <button
                        onClick={() => setIsCollapsed(true)}
                        className="rounded-lg p-1.5 text-gray-400 transition-all duration-200 hover:bg-gray-700 hover:text-white"
                        title="Collapse sidebar"
                    >
                        <FaChevronRight className="h-3 w-3" />
                    </button>
                </div>

                {/* Search */}
                <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <FaSearch className="h-3 w-3 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search episodes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full rounded-lg border border-gray-600 bg-gray-700 py-2 pr-8 pl-9 text-sm text-white placeholder-gray-400 transition-all duration-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                    />
                    {searchTerm && (
                        <button
                            onClick={clearSearch}
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 transition-colors hover:text-white"
                        >
                            <FaTimes className="h-3 w-3" />
                        </button>
                    )}
                </div>
            </div>

            {/* Episodes List */}
            <div className="flex-1 overflow-hidden">
                {isLoading ? (
                    <div className="p-6 text-center text-gray-400">
                        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
                        <p className="text-sm">Loading episodes...</p>
                    </div>
                ) : (
                    <div
                        ref={scrollContainerRef}
                        className="scrollbar scrollbar-thumb-gray-600 scrollbar-track-gray-800 h-full overflow-y-auto p-3"
                    >
                        <div className="space-y-3">
                            {displayedEpisodes.map((episode) => (
                                <EpisodeCard
                                    key={episode.episode_id}
                                    episode={episode}
                                    isSelected={selectedEpisodeId === episode.episode_id.toString()}
                                    onSelect={onEpisodeSelect}
                                    formatFileSize={formatFileSize}
                                />
                            ))}
                        </div>

                        {/* Loading trigger for infinite scroll */}
                        {hasMore && (
                            <div ref={loadingTriggerRef} className="p-4 text-center">
                                {isLoadingMore ? (
                                    <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
                                ) : (
                                    <div className="text-xs text-gray-400">Scroll for more...</div>
                                )}
                            </div>
                        )}

                        {/* End of list indicator */}
                        {!hasMore && displayedEpisodes.length > 0 && (
                            <div className="p-4 text-center text-xs text-gray-500">✨ All episodes loaded</div>
                        )}

                        {/* Empty state */}
                        {displayedEpisodes.length === 0 && !isLoading && (
                            <div className="p-8 text-center text-gray-400">
                                <FaDatabase className="mx-auto mb-3 h-10 w-10 opacity-50" />
                                <p className="text-sm">No episodes found</p>
                                {searchTerm && <p className="mt-1 text-xs">Try adjusting your search terms</p>}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer with quick stats */}
            <div className="border-t border-gray-600 bg-gray-800/50 p-4">
                <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-gray-400">
                        <span>Total Episodes:</span>
                        <span className="font-medium text-emerald-400">{episodes.length}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                        <span>Total Rows:</span>
                        <span className="font-medium text-emerald-400">
                            {episodes.reduce((sum, ep) => sum + ep.row_count, 0).toLocaleString()}
                        </span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                        <span>Total Size:</span>
                        <span className="font-medium text-emerald-400">
                            {formatFileSize(episodes.reduce((sum, ep) => sum + ep.file_size, 0))}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface EpisodeCardProps {
    episode: ParquetEpisode;
    isSelected: boolean;
    onSelect: (episodeId: string) => void;
    formatFileSize: (bytes: number) => string;
}

const EpisodeCard: React.FC<EpisodeCardProps> = ({ episode, isSelected, onSelect, formatFileSize }) => {
    return (
        <div
            onClick={() => onSelect(episode.episode_id.toString())}
            className={`group cursor-pointer rounded-xl border transition-all duration-200 hover:bg-emerald-500/50 ${
                isSelected ? 'border-emerald-500 bg-emerald-500/40' : 'border-gray-600 bg-emerald-700/40'
            }`}
        >
            <div className="p-3">
                {/* Episode Header */}
                <div className="mb-2 flex items-center justify-between border-b border-emerald-400 pb-2">
                    <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${isSelected ? 'bg-emerald-400' : 'bg-emerald-400'}`} />
                        <h3 className="truncate text-sm font-medium text-white">Episode {episode.episode_id}</h3>
                    </div>
                    <span className="rounded-full bg-emerald-600 px-2 py-1 text-xs text-white">{formatFileSize(episode.file_size)}</span>
                </div>

                {/* Episode Details */}
                <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                        <span className="text-white">Rows:</span>
                        <span className="font-medium text-emerald-400">{episode.row_count.toLocaleString()}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
