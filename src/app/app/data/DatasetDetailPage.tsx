'use client';

import { useEffect, useState } from 'react';
import { DatasetNavbar } from '@/components/Layouts/Navbar/Dataset/DatasetNavbar';
import { useGetEpisodeParquet } from '@/hooks/Components/AI/Dataset/dataset-parquet.hook';
import { setVideoGridSize, useGetEpisodeVideos, useVideoGridSize } from '@/hooks/Components/AI/Dataset/dataset-video.hook';
import { Spinner } from '@/components/Elements/Spinner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { FaEye, FaEyeSlash, FaTh, FaThLarge } from 'react-icons/fa';
import { useGetDatasetMetadata } from '@/hooks/Components/AI/Dataset/dataset-metadata.hook';
import type { DatasetMetadata } from '@/types/Module/Dataset/dataset-metadata';
import { TimeProvider } from '@/context/time-context';
import { useTime } from '@/context/time-context';
import { TimeControl } from '@/components/Elements/TimeControl/TimeControl';
import { SynchronizedVideoPlayer } from '@/components/Elements/Video/SynchronizedVideoPlayer';
import { setEpisodeNumber, setEpisodeSidebar, useGetEpisodeNumber, useGetEpisodeSidebar } from '@/hooks/Components/Data/episode.hook';
import { DatasetEpisodeSidebar } from '@/components/Elements/AI/Datasets/DatasetEpisodeSidebar';

interface DatasetDetailPageProps {
    nickname: string;
    dataset: string;
}

export const DatasetDetailPage = ({ nickname, dataset }: DatasetDetailPageProps) => {
    return (
        <TimeProvider>
            <DatasetDetailContent nickname={nickname} dataset={dataset} />
        </TimeProvider>
    );
};

const DatasetDetailContent = ({ nickname, dataset }: DatasetDetailPageProps) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'dataset' | 'videos'>('overview');
    const [videosLoaded, setVideosLoaded] = useState(true);

    const { data: toggle, isLoading: isLoadingEpisodeSidebar }: any = useGetEpisodeSidebar();
    const { data: episodeNumber, isLoading: isLoadingEpisodeNumber }: any = useGetEpisodeNumber(nickname, dataset);
    const {
        data: datasetMetadata,
        isLoading: isLoadingDatasetMetadata,
        error: datasetMetadataError,
    }: any = useGetDatasetMetadata(nickname, dataset);

    // Add time context
    const { setDuration, setTotalFrames } = useTime();

    const calculateCameraCount = (datasetMetadata: DatasetMetadata) => {
        const cameraCount = Object.keys(datasetMetadata?.features || {}).filter((key) => key.startsWith('observation.images.')).length;
        return cameraCount;
    };
    const cameraCount = calculateCameraCount(datasetMetadata);

    // Initialize time context with dataset data - but don't set totalFrames here
    // We'll set it from the actual parquet data instead
    useEffect(() => {
        if (datasetMetadata) {
            // Don't set totalFrames here - we'll get it from parquet data
            // Just set a reasonable duration for now
            const duration = 20; // 20 seconds default, will be updated by parquet data
            setDuration(duration);
        }
    }, [datasetMetadata, setDuration]);

    const isLoading = isLoadingDatasetMetadata;

    const totalEpisodes = datasetMetadata?.total_episodes || 0;
    const episodeList = Array.from({ length: totalEpisodes }, (_, index) => index);

    return (
        <div className="bg-slate-850 flex min-h-screen w-full flex-col">
            {isLoading ? (
                <div className="flex flex-col gap-4 p-4">
                    <div className="flex h-48 w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 p-4">
                        <div className="text-center text-white">Loading Episode Data...</div>
                        <Spinner color="yellow" />
                    </div>
                </div>
            ) : (
                <>
                    <DatasetNavbar
                        activeTab={activeTab}
                        setActiveTab={(tab: string) => setActiveTab(tab as 'overview' | 'dataset' | 'videos')}
                    />
                    <div className="flex flex-col gap-4 p-4">
                        <DatasetHeader
                            nickname={nickname}
                            dataset={dataset}
                            episodeNumber={episodeNumber}
                            datasetMetadata={datasetMetadata}
                            isLoadingDatasetMetadata={isLoadingDatasetMetadata}
                            datasetMetadataError={datasetMetadataError}
                        />

                        <DatasetVideoContainer
                            nickname={nickname}
                            dataset={dataset}
                            episode={episodeNumber}
                            cameraCount={cameraCount}
                            setVideosLoaded={setVideosLoaded}
                        />
                        <DatasetParquetContainer nickname={nickname} dataset={dataset} episode={episodeNumber} />
                    </div>
                    <DatasetEpisodeSidebar
                        isOpen={toggle}
                        onClose={() => setEpisodeSidebar(false)}
                        episodes={episodeList}
                        selectedEpisode={episodeNumber}
                        onEpisodeSelect={(episodeNumber: number) => {
                            setEpisodeNumber(nickname, dataset, episodeNumber);
                            setEpisodeSidebar(false);
                        }}
                        isLoading={isLoadingEpisodeSidebar || isLoadingEpisodeNumber}
                    />
                    {!videosLoaded && <TimeControl />}
                </>
            )}
        </div>
    );
};

const calculateCameraCount = (datasetMetadata: DatasetMetadata) => {
    // Features that have a key that starts with 'observation.images.'
    const cameras = Object.keys(datasetMetadata?.features || {}).filter((key) => key.startsWith('observation.images.'));
    const cameraCount = cameras.length;
    return cameraCount;
};

const calculateChunksCount = (datasetMetadata: DatasetMetadata, total_episodes: number) => {
    const chunksCount = Math.ceil(total_episodes / datasetMetadata?.chunks_size || 1);
    return chunksCount;
};

export const DatasetHeader = ({
    nickname,
    dataset,
    episodeNumber,
    datasetMetadata,
    isLoadingDatasetMetadata,
    datasetMetadataError,
}: {
    nickname: string;
    dataset: string;
    episodeNumber: number;
    datasetMetadata: DatasetMetadata;
    isLoadingDatasetMetadata: boolean;
    datasetMetadataError: string;
}) => {
    const total_episodes = datasetMetadata?.total_episodes || 0;
    const cameraCount = calculateCameraCount(datasetMetadata);
    const total_videos = cameraCount * total_episodes;
    const total_rows = total_episodes * datasetMetadata?.total_frames || 0;
    const total_chunks = calculateChunksCount(datasetMetadata, total_episodes);
    return (
        <>
            <div className="flex w-full">
                {isLoadingDatasetMetadata ? (
                    <div className="flex h-48 w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 p-4">
                        <Spinner color="yellow" />
                        <p className="text-slate-400">Loading dataset metadata...</p>
                    </div>
                ) : (
                    <>
                        <div className="flex-1 overflow-y-auto">
                            {datasetMetadataError && (
                                <div className="rounded-lg border border-red-700/50 bg-red-900/20 p-4">
                                    <h3 className="mb-2 text-lg font-semibold text-red-400">Error Loading Data</h3>
                                    <p className="text-red-300">{datasetMetadataError}</p>
                                </div>
                            )}

                            <div className="flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-800 p-4">
                                <div className="flex items-center gap-2">
                                    <h1 className="flex gap-2 text-white">
                                        <div className="text-lg font-semibold">Dataset: </div>
                                        <div className="text-md mt-0.5 font-semibold">
                                            {nickname}/{dataset}
                                        </div>
                                    </h1>
                                    <div className="grow"></div>
                                    <div className="flex gap-2 text-white">
                                        <div className="text-md font-semibold">Episode: </div>
                                        <div className="text-md font-semibold">{episodeNumber || 0}</div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-white">{total_episodes.toLocaleString() || 0}</p>
                                        <p className="text-sm text-slate-400">Total Episodes</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-white">{total_videos.toLocaleString() || 0}</p>
                                        <p className="text-sm text-slate-400">Total Videos</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-white">{total_rows.toLocaleString() || 0}</p>
                                        <p className="text-sm text-slate-400">Total Rows</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-white">{total_chunks.toLocaleString() || 0}</p>
                                        <p className="text-sm text-slate-400">Chunks</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    );
};

export const DatasetVideoContainer = ({
    nickname,
    dataset,
    episode,
    cameraCount = 0,
    setVideosLoaded,
}: {
    nickname: string;
    dataset: string;
    episode: number;
    cameraCount: number;
    setVideosLoaded: any;
}) => {
    const { videos, isLoading, error } = useGetEpisodeVideos(nickname, dataset, episode, cameraCount);

    useEffect(() => {
        setVideosLoaded(isLoading);
    }, [isLoading, setVideosLoaded]);

    if (isLoading || !videos || videos?.length === 0) {
        return (
            <div className="flex w-full">
                <div className="flex w-full flex-col gap-4 rounded-lg border border-slate-700 bg-slate-800 p-4">
                    <div className="flex h-48 w-full flex-col items-center justify-center gap-4">
                        <Spinner color="yellow" />
                        <p className="text-slate-400">Loading video data...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-screen max-h-screen">
                <div className="flex-1 overflow-y-auto">
                    <div className="mb-6 rounded-lg border border-red-700/50 bg-red-900/20 p-6">
                        <h3 className="mb-2 text-lg font-semibold text-red-400">Error Loading Videos</h3>
                        <p className="text-red-300">{error}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex w-full">
            <div className="flex w-full flex-col gap-4 rounded-lg border border-slate-700 bg-slate-800 p-4">
                <DatasetVideoGrid videos={videos || []} isLoading={isLoading} episode={episode} />
            </div>
        </div>
    );
};

export const DatasetVideoGrid = ({ videos, isLoading, episode }: { videos: any[]; isLoading: boolean; episode: number }) => {
    const { data: gridSize }: any = useVideoGridSize();
    return (
        <>
            {isLoading ? (
                <div className="flex h-64 w-full items-center justify-center gap-4">
                    <div className="text-center">
                        <p className="text-xs text-slate-400">Loading videos...</p>
                    </div>
                    <Spinner color="yellow" />
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-4">
                        <h2 className="text-lg font-semibold text-white">Episode {episode}</h2>
                        <div className="grow"></div>
                        {/* Grid Toggle Buttons */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setVideoGridSize('small')}
                                className={`flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm font-medium transition-all duration-200 ${
                                    gridSize === 'small'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
                                }`}
                            >
                                <FaTh className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => setVideoGridSize('large')}
                                className={`flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm font-medium transition-all duration-200 ${
                                    gridSize === 'large'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
                                }`}
                            >
                                <FaThLarge className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    <div
                        className={`grid gap-4 ${
                            gridSize === 'small' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'
                        }`}
                    >
                        {videos.map((video: any, index: number) => (
                            <DatasetVideoCard key={video.id} video={video} index={index} />
                        ))}
                    </div>
                </>
            )}
        </>
    );
};

const cleanCameraName = (cameraName: string) => {
    return cameraName?.replace(/^observation\.images\./, '');
};

export const DatasetVideoCard = ({
    video,
    index = 0, // Add index prop to identify videos
}: {
    video: any;
    index?: number;
}) => {
    const cameraName = cleanCameraName(video.camera);
    const isMasterVideo = index === 0; // First video is the master

    return (
        <div className="group">
            {/* Video Label */}
            <div className="mb-2 flex items-center justify-between">
                <h3 className="flex gap-2 text-sm text-slate-300">
                    <div className="font-bold">Camera: </div>
                    <div>{cameraName}</div>
                </h3>
            </div>

            {/* Video Container */}
            <div className="relative overflow-hidden rounded-2xl border-2 border-slate-600 bg-slate-900 transition-all duration-500 group-hover:border-blue-500 group-hover:shadow-lg group-hover:shadow-blue-500/20">
                {video.isLoading ? (
                    <div className="flex aspect-video items-center justify-center">
                        <div className="flex items-center gap-4 text-center">
                            <Spinner color="yellow" />
                            <p className="text-xs text-slate-400">Loading...</p>
                        </div>
                    </div>
                ) : video.error ? (
                    <div className="flex aspect-video items-center justify-center bg-red-900/20">
                        <div className="text-center">
                            <p className="text-xs text-red-400">Error loading video</p>
                            <p className="mt-1 text-xs text-red-300">{video.error}</p>
                        </div>
                    </div>
                ) : video.url ? (
                    <>
                        <SynchronizedVideoPlayer
                            src={video.url || ''}
                            title={`${cameraName} - ${video.title}`}
                            className="w-full"
                            autoPlay={false}
                            muted={true}
                            compact={true}
                            videoId={isMasterVideo ? 'master' : `video-${index}`}
                        />
                    </>
                ) : (
                    <div className="flex aspect-video items-center justify-center bg-slate-900/50">
                        <div className="text-center">
                            <p className="text-xs text-slate-400">No video available</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export const DatasetParquetContainer = ({ nickname, dataset, episode }: { nickname: string; dataset: string; episode: number }) => {
    const { data: episodeParquet, isLoading, error }: any = useGetEpisodeParquet(nickname, dataset, episode);
    const { setTotalFrames, setDuration } = useTime();

    // Set the correct frame count and duration from parquet data
    useEffect(() => {
        if (episodeParquet?.parquet) {
            const actualFrameCount = episodeParquet.parquet.length;
            const duration = actualFrameCount * (1 / 30); // Assuming 30 FPS, adjust as needed

            setTotalFrames(actualFrameCount);
            setDuration(duration);

            console.log(`Setting frames: ${actualFrameCount}, duration: ${duration}s`);
        }
    }, [episodeParquet, setTotalFrames, setDuration]);

    console.log('episodeParquet', episodeParquet);
    return (
        <>
            {(isLoading || !episodeParquet || episodeParquet?.parquet?.length) === 0 ? (
                <div className="flex h-48 w-full items-center justify-center gap-4">
                    <div className="text-center">
                        <p className="text-xs text-slate-400">Loading chart data...</p>
                    </div>
                    <Spinner color="yellow" />
                </div>
            ) : (
                <>
                    <DatasetChartContainer
                        episodeParquet={episodeParquet}
                        isLoading={isLoading}
                        error={error}
                        fps={30} // Pass FPS as prop
                    />
                    <DatasetTableContainer episodeParquet={episodeParquet} isLoading={isLoading} error={error} />
                </>
            )}
        </>
    );
};

export const DatasetChartContainer = ({
    episodeParquet,
    isLoading,
    error,
    fps = 30,
}: {
    episodeParquet: any;
    isLoading: boolean;
    error: string;
    fps?: number;
}) => {
    // Track the actual video time locally (same as TimeControl)
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [totalFrames, setTotalFrames] = useState(0);

    // Update time from the master video (same logic as TimeControl)
    useEffect(() => {
        const updateTimeFromVideo = () => {
            const videos = document.querySelectorAll('video');
            if (videos.length > 0) {
                const masterVideo = videos[0] as HTMLVideoElement;
                if (masterVideo) {
                    setCurrentTime(masterVideo.currentTime);
                    setDuration(masterVideo.duration || 0);
                }
            }
        };

        const interval = setInterval(updateTimeFromVideo, 100);
        return () => clearInterval(interval);
    }, []);

    // Set totalFrames from parquet data
    useEffect(() => {
        if (episodeParquet?.parquet) {
            const actualFrameCount = episodeParquet.parquet.length;
            setTotalFrames(actualFrameCount);
        }
    }, [episodeParquet]);

    // Get current values for display (first frame or empty if no data)
    const chartData = episodeParquet?.parquet ? convertData(episodeParquet.parquet) : [];

    // Calculate the x position for the vertical line based on current time
    // Use a more precise approach that maps to chart coordinates
    const getLineX = () => {
        if (!chartData.length) return chartData[0]?.frame || 0;

        // Calculate which frame we should be at based on video time
        const targetFrame = currentTime * fps;

        // Clamp the target frame to the data range
        const minFrame = chartData[0].frame;
        const maxFrame = chartData[chartData.length - 1].frame;
        const clampedFrame = Math.max(minFrame, Math.min(targetFrame, maxFrame));

        return clampedFrame;
    };

    const lineX = getLineX();

    // Add some debugging to see what's happening
    console.log('Chart Debug:', {
        currentTime,
        fps,
        targetFrame: currentTime * fps,
        lineX,
        chartDataLength: chartData.length,
        firstFrame: chartData[0]?.frame,
        lastFrame: chartData[chartData.length - 1]?.frame,
    });

    // Calculate current frame from actual video time
    const currentFrame = duration > 0 && totalFrames > 0 ? Math.floor((currentTime / duration) * totalFrames) : 0;

    // Get current values for the current frame (not just first frame)
    const getCurrentValues = () => {
        if (!chartData.length) return {};

        const targetFrame = currentTime * fps;
        const closestDataPoint = chartData.find((point, index) => {
            const nextPoint = chartData[index + 1];
            if (!nextPoint) return true;
            return point.frame <= targetFrame && nextPoint.frame > targetFrame;
        });

        return closestDataPoint || chartData[0] || {};
    };

    const currentValues = getCurrentValues();

    // Custom tooltip component
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="rounded-lg border border-slate-600 bg-slate-800 p-4 shadow-lg">
                    <p className="mb-2 text-sm font-semibold text-white">Frame: {label}</p>
                    {/* Observation States */}
                    <div className="mb-2">
                        <p className="mb-1 text-xs font-medium text-blue-400">Observation States:</p>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                            {Array.from({ length: 6 }, (_, i) => (
                                <div key={i} className="flex items-center gap-1">
                                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: motorColors[i] }}></div>
                                    <span className="text-slate-300">M{i + 1}:</span>
                                    <span className="font-mono text-white">
                                        {data[`motor${i + 1}`] !== undefined ? data[`motor${i + 1}`].toFixed(3) : 'N/A'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div>
                        <p className="mb-1 text-xs font-medium text-green-400">Actions:</p>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                            {Array.from({ length: 6 }, (_, i) => (
                                <div key={i} className="flex items-center gap-1">
                                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: motorColors[i] }}></div>
                                    <span className="text-slate-300">A{i + 1}:</span>
                                    <span className="font-mono text-white">
                                        {data[`action${i + 1}`] !== undefined ? data[`action${i + 1}`].toFixed(3) : 'N/A'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    // Add debounced line position at the top of the component
    const [debouncedLineX, setDebouncedLineX] = useState(0);

    // Add this useEffect after the other useEffects
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedLineX(Math.floor(lineX));
        }, 50); // Update every 50ms instead of every 100ms

        return () => clearTimeout(timer);
    }, [lineX]);

    // Then use debouncedLineX in both ReferenceLine components:
    return (
        <div className="flex w-full">
            <div className="flex w-full flex-col gap-4 rounded-lg border border-slate-700 bg-slate-800 p-4">
                {!episodeParquet && isLoading ? (
                    <div className="flex h-96 w-full items-center justify-center gap-4">
                        <div className="text-center">
                            <p className="text-xs text-slate-400">Loading chart data...</p>
                        </div>
                        <Spinner color="yellow" />
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-white">Motor Data</h2>
                            <div className="flex items-center gap-4">
                                <div className="text-sm text-slate-400">
                                    Frame: {currentFrame} / {totalFrames}
                                </div>
                                <div className="text-sm text-slate-400">Time: {currentTime.toFixed(2)}s</div>
                                <div className="text-sm text-slate-400">FPS: {fps}</div>
                            </div>
                        </div>

                        {/* Chart Container */}
                        <div className="flex flex-col gap-4">
                            {/* States Chart */}
                            <div className="h-48 w-full">
                                <div className="mb-2 text-sm font-medium text-slate-300">Motor States</div>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 5, right: 30, left: 5, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                        <XAxis dataKey="frame" stroke="#9CA3AF" fontSize={12} tickFormatter={(value) => `${value}f`} />
                                        <YAxis
                                            stroke="#9CA3AF"
                                            fontSize={12}
                                            domain={[-100, 100]}
                                            width={40}
                                            tickCount={5}
                                            tickFormatter={(value) => value.toFixed(0)}
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        {/* ReferenceLine - simplified */}
                                        <ReferenceLine x={debouncedLineX} stroke="white" strokeWidth={2} strokeDasharray="5,5" opacity={0.8} />
                                        {Array.from({ length: 6 }, (_, i) => (
                                            <Line
                                                key={`motor${i + 1}`}
                                                type="monotone"
                                                dataKey={`motor${i + 1}`}
                                                stroke={motorColors[i]}
                                                strokeWidth={1.5}
                                                dot={false}
                                                name={`Motor ${i + 1}`}
                                            />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Actions Chart */}
                            <div className="h-48 w-full">
                                <div className="mb-2 text-sm font-medium text-slate-300">Motor Actions</div>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 5, right: 30, left: 5, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                        <XAxis dataKey="frame" stroke="#9CA3AF" fontSize={12} tickFormatter={(value) => `${value}f`} />
                                        <YAxis
                                            stroke="#9CA3AF"
                                            fontSize={12}
                                            domain={[-100, 100]}
                                            width={40}
                                            tickCount={5}
                                            tickFormatter={(value) => value.toFixed(0)}
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        {/* ReferenceLine - simplified */}
                                        <ReferenceLine
                                            x={debouncedLineX} // Use integer values for stability
                                            stroke="white"
                                            strokeWidth={2}
                                            strokeDasharray="5,5"
                                            opacity={0.8}
                                        />
                                        {Array.from({ length: 6 }, (_, i) => (
                                            <Line
                                                key={`action${i + 1}`}
                                                type="monotone"
                                                dataKey={`action${i + 1}`}
                                                stroke={motorColors[i]}
                                                strokeWidth={1.5}
                                                dot={false}
                                                name={`Action ${i + 1}`}
                                            />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Legend Grid */}
                        <div className="grid grid-cols-3 gap-2 text-xs">
                            {Array.from({ length: 6 }, (_, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: motorColors[i] }}></div>
                                    <span className="text-slate-300">M{i + 1}</span>
                                </div>
                            ))}
                        </div>

                        {/* Current Values Grid - Fixed */}
                        <div className="rounded-lg border border-slate-600 bg-slate-900 p-3">
                            <div className="grid grid-cols-3 gap-2 text-center">
                                {Array.from({ length: 6 }, (_, i) => (
                                    <div key={i}>
                                        <p className="text-sm font-bold" style={{ color: motorColors[i] }}>
                                            {currentValues[`motor${i + 1}`] !== undefined ? currentValues[`motor${i + 1}`].toFixed(3) : 'N/A'}
                                        </p>
                                        <p className="text-xs text-slate-400">M{i + 1}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export const DatasetTableContainer = ({ episodeParquet, isLoading, error }: { episodeParquet: any; isLoading: boolean; error: string }) => {
    const [showAllRows, setShowAllRows] = useState(false);
    const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set());

    const toggleColumnExpansion = (columnName: string) => {
        const newExpanded = new Set(expandedColumns);
        if (newExpanded.has(columnName)) {
            newExpanded.delete(columnName);
        } else {
            newExpanded.add(columnName);
        }
        setExpandedColumns(newExpanded);
    };

    const renderValue = (value: any, columnName?: string): string => {
        if (value === null || value === undefined) return 'null';
        if (typeof value === 'object') {
            return JSON.stringify(value, null, 2);
        }
        if (typeof value === 'number') {
            // Frame column should display as integers
            if (columnName === 'frame') {
                return Math.round(value).toString();
            }
            // Other numeric values get 3 decimal places
            return value.toFixed(3);
        }
        return String(value);
    };

    if (isLoading) {
        return (
            <div className="flex w-full">
                <div className="flex w-full flex-col gap-4 rounded-lg border border-slate-700 bg-slate-800 p-4">
                    <div className="flex items-center justify-center py-12">
                        <div className="text-center">
                            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500"></div>
                            <p className="mt-4 text-slate-400">Loading parquet data...</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex w-full">
                <div className="flex w-full flex-col gap-4 rounded-lg border border-slate-700 bg-slate-800 p-4">
                    <div className="flex items-center justify-center py-12">
                        <div className="text-center">
                            <div className="mb-4 text-red-400">Error loading parquet data</div>
                            <p className="text-slate-400">{error}</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!episodeParquet) {
        return (
            <div className="flex w-full">
                <div className="flex w-full flex-col gap-4 rounded-lg border border-slate-700 bg-slate-800 p-4">
                    <h2 className="text-lg font-semibold text-white">Parquet Data</h2>
                    <div className="flex items-center justify-center py-12">
                        <div className="text-center">
                            <p className="text-slate-400">No parquet data available</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const tableData = episodeParquet?.parquet ? convertData(episodeParquet.parquet) : [];
    const columns = tableData.length > 0 ? Object.keys(tableData[0]) : [];

    return (
        <div className="flex w-full">
            <div className="flex w-full flex-col gap-4 rounded-lg border border-slate-700 bg-slate-800 p-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">Parquet Data</h2>
                    <div className="flex items-center gap-4">
                        <div className="text-sm text-slate-400">{tableData.length} rows</div>
                        <button
                            onClick={() => setShowAllRows(!showAllRows)}
                            className="flex cursor-pointer items-center gap-2 rounded bg-slate-700 px-3 py-1 text-sm transition-colors hover:bg-slate-600"
                        >
                            {showAllRows ? <FaEyeSlash className="text-white" /> : <FaEye className="text-white" />}
                            {showAllRows ? <div className="text-slate-100">Show Sample</div> : <div className="text-slate-100">Show All</div>}
                        </button>
                    </div>
                </div>

                {tableData.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-700">
                                    {columns.map((column, index) => (
                                        <th key={index} className="p-2 text-left text-slate-300">
                                            <div className="flex items-center gap-2">
                                                <span>{column}</span>
                                                <button
                                                    onClick={() => toggleColumnExpansion(column)}
                                                    className="cursor-pointer text-slate-500 hover:text-slate-300"
                                                >
                                                    {expandedColumns.has(column) ? <FaEyeSlash size={12} /> : <FaEye size={12} />}
                                                </button>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(showAllRows ? tableData : tableData.slice(0, 20)).map((row, rowIndex) => (
                                    <tr key={rowIndex} className="border-b border-slate-700/30">
                                        {columns.map((column, colIndex) => (
                                            <td key={colIndex} className="p-2">
                                                <div className={`max-w-xs ${expandedColumns.has(column) ? '' : 'truncate'}`}>
                                                    {expandedColumns.has(column) ? (
                                                        <pre className="text-xs whitespace-pre-wrap text-slate-300">
                                                            {renderValue(row[column], column)}
                                                        </pre>
                                                    ) : (
                                                        <span className="text-slate-300" title={renderValue(row[column], column)}>
                                                            {renderValue(row[column], column)}
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
                ) : (
                    <div className="flex items-center justify-center py-12">
                        <div className="text-center">
                            <p className="text-slate-400">No data available for this episode</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Helper function to convert real data to chart format
const convertData = (episodeData: any[]) => {
    if (!episodeData || episodeData.length === 0) return [];

    return episodeData.map((item: any, index: number) => {
        const chartItem: any = {
            frame: item.frame_index || index,
        };

        // Convert observation.state
        if (item['observation.state'] && Array.isArray(item['observation.state'])) {
            item['observation.state'].forEach((value: number, motorIndex: number) => {
                chartItem[`motor${motorIndex + 1}`] = value;
            });
        }

        // Convert action
        if (item.action && Array.isArray(item.action)) {
            item.action.forEach((value: number, actionIndex: number) => {
                chartItem[`action${actionIndex + 1}`] = value;
            });
        }

        return chartItem;
    });
};

// Color palette for up to 24 motors (expanded for future scalability)
const motorColors = [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Yellow
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#06B6D4', // Cyan
    '#F97316', // Orange
    '#84CC16', // Lime
    '#EC4899', // Pink
    '#6366F1', // Indigo
    '#14B8A6', // Teal
    '#F43F5E', // Rose
    '#8B5A2B', // Brown
    '#6B7280', // Gray
    '#DC2626', // Dark Red
    '#059669', // Dark Green
    '#7C3AED', // Dark Purple
    '#0891B2', // Dark Cyan
    '#EA580C', // Dark Orange
    '#65A30D', // Dark Lime
    '#BE185D', // Dark Pink
    '#4F46E5', // Dark Indigo
    '#0F766E', // Dark Teal
    '#BE123C', // Dark Rose
];
