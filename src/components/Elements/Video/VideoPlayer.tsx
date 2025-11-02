import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FaPlay, FaPause, FaExpand, FaCompress, FaVolumeUp, FaVolumeMute, FaBackward, FaForward } from 'react-icons/fa';

interface VideoPlayerProps {
    src: string;
    title?: string;
    onPlay?: () => void;
    onPause?: () => void;
    onEnded?: () => void;
    onTimeUpdate?: (currentTime: number) => void;
    onDurationChange?: (duration: number) => void;
    className?: string;
    autoPlay?: boolean;
    loop?: boolean;
    muted?: boolean;
    compact?: boolean; // New prop for compact mode
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
    src,
    title,
    onPlay,
    onPause,
    onEnded,
    onTimeUpdate,
    onDurationChange,
    className = '',
    autoPlay = false,
    loop = false,
    muted = false,
    compact = false,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(muted);
    const [volume, setVolume] = useState(1);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [isHovering, setIsHovering] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Reset state when src changes
    useEffect(() => {
        setIsLoading(true);
        setError(null);
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setShowControls(true);
        setIsHovering(false);

        // Reset video element
        if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.pause();
        }
    }, [src]);

    // Format time in MM:SS format
    const formatTime = (time: number): string => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    // Handle play/pause
    const togglePlay = useCallback(() => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play().catch((err) => {
                    setError('Failed to play video');
                });
            }
        }
    }, [isPlaying]);

    // Handle volume change
    const handleVolumeChange = useCallback((newVolume: number) => {
        if (videoRef.current) {
            videoRef.current.volume = newVolume;
            setVolume(newVolume);
            setIsMuted(newVolume === 0);
        }
    }, []);

    // Handle mute toggle
    const toggleMute = useCallback(() => {
        if (videoRef.current) {
            videoRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    }, [isMuted]);

    // Handle seek
    const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newTime = parseFloat(e.target.value);
        if (videoRef.current) {
            videoRef.current.currentTime = newTime;
            setCurrentTime(newTime);
        }
    }, []);

    // Handle fullscreen toggle
    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    }, []);

    // Handle skip forward/backward
    const skipTime = useCallback((seconds: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime += seconds;
        }
    }, []);

    // Event handlers
    const handleLoadedMetadata = useCallback(() => {
        if (videoRef.current) {
            setDuration(videoRef.current.duration);
            setIsLoading(false);
            onDurationChange?.(videoRef.current.duration);
        }
    }, [videoRef, onDurationChange]);

    const handleTimeUpdate = useCallback(() => {
        if (videoRef.current) {
            const time = videoRef.current.currentTime;
            const dur = videoRef.current.duration;

            // Cap the currentTime to duration to prevent overflow
            const cappedTime = dur > 0 ? Math.min(time, dur) : time;

            setCurrentTime(cappedTime);
            onTimeUpdate?.(cappedTime);
        }
    }, [videoRef, onTimeUpdate]);

    const handlePlay = () => {
        setIsPlaying(true);
        onPlay?.();
    };

    const handlePause = () => {
        setIsPlaying(false);
        onPause?.();
    };

    const handleEnded = () => {
        setIsPlaying(false);
        onEnded?.();
    };

    const handleError = (e: any) => {
        let errorMessage = 'Error loading video';
        if (videoRef.current?.error) {
            switch (videoRef.current.error.code) {
                case 1:
                    errorMessage = 'Video loading aborted';
                    break;
                case 2:
                    errorMessage = 'Network error while loading video';
                    break;
                case 3:
                    errorMessage = 'Video decoding failed';
                    break;
                case 4:
                    errorMessage = 'Video format not supported';
                    break;
            }
        }

        setError(errorMessage);
        setIsLoading(false);
    };

    const handleLoadStart = () => {
        setIsLoading(true);
        setError(null);
    };

    const handleCanPlay = () => {
        setIsLoading(false);
    };

    // Auto-hide controls - more aggressive hiding in compact mode
    useEffect(() => {
        let timeout: NodeJS.Timeout;
        const hideDelay = compact ? 1500 : 3000; // Hide faster in compact mode

        if (isPlaying && showControls && !isHovering) {
            timeout = setTimeout(() => setShowControls(false), hideDelay);
        }
        return () => clearTimeout(timeout);
    }, [isPlaying, showControls, isHovering, compact]);

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (!containerRef.current?.contains(e.target as Node)) return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    skipTime(-10);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    skipTime(10);
                    break;
                case 'KeyM':
                    e.preventDefault();
                    toggleMute();
                    break;
                case 'KeyF':
                    e.preventDefault();
                    toggleFullscreen();
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyPress);
        return () => document.removeEventListener('keydown', handleKeyPress);
    }, [isPlaying, isMuted, toggleFullscreen, toggleMute, togglePlay, skipTime]);

    // Check if src is valid
    if (!src) {
        return (
            <div className={`relative overflow-hidden rounded-lg bg-slate-900 ${className}`}>
                <div className="flex aspect-video items-center justify-center rounded-lg border border-slate-700/50 bg-slate-900/50">
                    <div className="text-center">
                        <p className="text-sm text-red-400">No video source provided</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className={`group relative overflow-hidden rounded-lg bg-slate-900 ${className}`}
            onMouseEnter={() => {
                setIsHovering(true);
                setShowControls(true);
            }}
            onMouseLeave={() => {
                setIsHovering(false);
                if (isPlaying) {
                    // Only hide controls when leaving if video is playing
                    setTimeout(() => {
                        if (!isHovering) {
                            setShowControls(false);
                        }
                    }, 100);
                }
            }}
        >
            {/* Video Element */}
            <video
                ref={videoRef}
                src={src}
                className="h-full w-full cursor-pointer"
                autoPlay={autoPlay}
                loop={loop}
                muted={muted}
                preload="metadata"
                onLoadStart={handleLoadStart}
                onLoadedMetadata={handleLoadedMetadata}
                onCanPlay={handleCanPlay}
                onTimeUpdate={handleTimeUpdate}
                onPlay={handlePlay}
                onPause={handlePause}
                onEnded={handleEnded}
                onError={handleError}
                onClick={togglePlay}
            />

            {/* Loading Overlay */}
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                    <div className="text-center">
                        <div
                            className={`mx-auto animate-spin rounded-full border-b-2 border-blue-500 ${compact ? 'h-6 w-6' : 'h-8 w-8'}`}
                        ></div>
                        <p className={`mt-2 text-slate-400 ${compact ? 'text-xs' : 'text-sm'}`}>Loading video...</p>
                        {!compact && <p className="mt-1 text-xs text-slate-500">{src}</p>}
                    </div>
                </div>
            )}

            {/* Error Overlay */}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                    <div className="text-center">
                        <p className={`text-red-400 ${compact ? 'text-xs' : 'text-sm'}`}>{error}</p>
                        {!compact && <p className="mt-1 text-xs text-slate-500">{src}</p>}
                    </div>
                </div>
            )}

            {/* Title Overlay - Only show in non-compact mode */}
            {title && !compact && (
                <div className="absolute top-0 right-0 left-0 bg-gradient-to-b from-slate-900/80 to-transparent p-4">
                    <h3 className="font-medium text-white">{title}</h3>
                </div>
            )}

            {/* Controls Overlay - Hide completely when not hovering in compact mode */}
            <div
                className={`absolute right-0 bottom-0 left-0 z-10 bg-gradient-to-t from-slate-900/90 to-transparent transition-opacity duration-300 ${
                    showControls ? 'opacity-100' : 'opacity-0'
                } ${compact ? 'p-2' : 'p-4'}`}
            >
                {/* Progress Bar - Hide in compact mode when not hovering */}
                {(!compact || isHovering) && (
                    <div className={`${compact ? 'mb-1' : 'mb-2'}`}>
                        <input
                            type="range"
                            min={0}
                            max={duration || 0}
                            step={0.01}
                            value={currentTime}
                            onChange={handleSeek}
                            className={`slider-thumb-blue w-full cursor-pointer appearance-none rounded-lg bg-slate-600 ${compact ? 'h-0.5' : 'h-1'}`}
                            style={{
                                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0}%, #475569 ${duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0}%, #475569 100%)`,
                            }}
                        />
                    </div>
                )}

                {/* Control Buttons */}
                <div className="flex items-center justify-between">
                    <div className={`flex items-center ${compact ? 'gap-2' : 'gap-4'}`}>
                        {/* Play/Pause */}
                        <button
                            onClick={togglePlay}
                            className={`cursor-pointer rounded-lg text-white transition-colors hover:bg-white/10 hover:text-blue-400 ${compact ? 'p-1' : 'p-2'}`}
                        >
                            {isPlaying ? <FaPause size={compact ? 12 : 16} /> : <FaPlay size={compact ? 12 : 16} />}
                        </button>

                        {/* Skip Backward - Hide in compact mode */}
                        {!compact && (
                            <button
                                onClick={() => skipTime(-10)}
                                className="cursor-pointer rounded-lg p-2 text-white transition-colors hover:bg-white/10 hover:text-blue-400"
                            >
                                <FaBackward size={14} />
                            </button>
                        )}

                        {/* Skip Forward - Hide in compact mode */}
                        {!compact && (
                            <button
                                onClick={() => skipTime(10)}
                                className="cursor-pointer rounded-lg p-2 text-white transition-colors hover:bg-white/10 hover:text-blue-400"
                            >
                                <FaForward size={14} />
                            </button>
                        )}

                        {/* Volume Control - Hide in compact mode */}
                        {!compact && (
                            <div className="group/volume flex items-center gap-2">
                                <button
                                    onClick={toggleMute}
                                    className="cursor-pointer rounded-lg p-2 text-white transition-colors hover:bg-white/10 hover:text-blue-400"
                                >
                                    {isMuted ? <FaVolumeMute size={14} /> : <FaVolumeUp size={14} />}
                                </button>
                                <div className="w-0 overflow-hidden transition-all duration-300 group-hover/volume:w-16">
                                    <input
                                        type="range"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={isMuted ? 0 : volume}
                                        onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                                        className="slider-thumb-blue h-2 w-16 cursor-pointer appearance-none rounded-lg bg-slate-600"
                                        style={{
                                            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(isMuted ? 0 : volume) * 100}%, #475569 ${(isMuted ? 0 : volume) * 100}%, #475569 100%)`,
                                        }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Time Display - Hide in compact mode */}
                        {!compact && (
                            <div className="font-mono text-sm text-white">
                                {formatTime(currentTime)} / {formatTime(duration)}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Fullscreen Toggle */}
                        <button
                            onClick={toggleFullscreen}
                            className={`cursor-pointer rounded-lg text-white transition-colors hover:bg-white/10 hover:text-blue-400 ${compact ? 'p-1' : 'p-2'}`}
                        >
                            {isFullscreen ? <FaCompress size={compact ? 10 : 14} /> : <FaExpand size={compact ? 10 : 14} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Play Button Overlay (when paused) - show when not playing and controls are hidden */}
            {!isPlaying && !isLoading && !error && !showControls && (
                <div className="absolute inset-0 z-5 flex items-center justify-center">
                    <button
                        onClick={togglePlay}
                        className={`cursor-pointer rounded-full bg-slate-900/80 text-white transition-colors hover:bg-slate-800/80 hover:text-blue-400 ${compact ? 'p-2' : 'p-4'}`}
                    >
                        <FaPlay size={compact ? 16 : 24} />
                    </button>
                </div>
            )}

            {/* Custom CSS for slider styling */}
            <style jsx>{`
                .slider-thumb-blue::-webkit-slider-thumb {
                    appearance: none;
                    height: 16px;
                    width: 16px;
                    border-radius: 50%;
                    background: #3b82f6;
                    cursor: pointer;
                    border: 2px solid #ffffff;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                    transition: all 0.2s ease;
                }

                .slider-thumb-blue::-webkit-slider-thumb:hover {
                    background: #2563eb;
                    transform: scale(1.1);
                }

                .slider-thumb-blue::-moz-range-thumb {
                    height: 16px;
                    width: 16px;
                    border-radius: 50%;
                    background: #3b82f6;
                    cursor: pointer;
                    border: 2px solid #ffffff;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                    transition: all 0.2s ease;
                }

                .slider-thumb-blue::-moz-range-thumb:hover {
                    background: #2563eb;
                    transform: scale(1.1);
                }

                .slider-thumb-blue::-ms-thumb {
                    height: 16px;
                    width: 16px;
                    border-radius: 50%;
                    background: #3b82f6;
                    cursor: pointer;
                    border: 2px solid #ffffff;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                    transition: all 0.2s ease;
                }

                .slider-thumb-blue::-ms-thumb:hover {
                    background: #2563eb;
                    transform: scale(1.1);
                }
            `}</style>
        </div>
    );
};
