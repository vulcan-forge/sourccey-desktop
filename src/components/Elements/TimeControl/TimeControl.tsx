'use client';

import React, { useEffect, useState } from 'react';
import { useTime } from '@/context/time-context';
import { FaPlay, FaPause } from 'react-icons/fa';

export const TimeControl = () => {
    const {
        duration,
        isPlaying,
        totalFrames,
        togglePlayPause,
        seek,
        seekToFrame
    } = useTime();

    // Track the actual video time instead of global time
    const [currentTime, setCurrentTime] = useState(0);

    // Calculate current frame from actual video time
    // Use the same FPS calculation as the chart (30 FPS)
    const fps = 30;
    // Remove the Math.min cap to allow reaching the full frame count
    const currentFrame = duration > 0 && totalFrames > 0
        ? Math.round((currentTime / duration) * totalFrames)
        : Math.round(currentTime * fps);

    // Update currentTime from the master video
    useEffect(() => {
        const updateTimeFromVideo = () => {
            const videos = document.querySelectorAll('video');
            if (videos.length > 0) {
                // Use the first video as the master for time tracking
                const masterVideo = videos[0] as HTMLVideoElement;
                if (masterVideo) {
                    setCurrentTime(masterVideo.currentTime);
                }
            }
        };

        let interval: NodeJS.Timeout;
        if (isPlaying) {
            // Update time more frequently when playing
            interval = setInterval(updateTimeFromVideo, 100);
        } else {
            // Update less frequently when paused
            interval = setInterval(updateTimeFromVideo, 500);
        }

        return () => clearInterval(interval);
    }, [isPlaying]);

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = clickX / rect.width;
        const newTime = percentage * duration;
        
        // Seek all videos directly
        seekAllVideos(newTime);
        setCurrentTime(newTime); // Update local time immediately
        seek(newTime);
    };

    // Function to seek all videos directly
    const seekAllVideos = (time: number) => {
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            video.currentTime = time;
        });
    };

    // Simple play/pause handler - NO VIDEO STATE SYNCING
    const handlePlayPause = () => {
        const videos = document.querySelectorAll('video');
        if (videos.length > 0) {
            const masterVideo = videos[0] as HTMLVideoElement;
            
            // If video has ended, reset to beginning before playing
            if (masterVideo.ended) {
                setCurrentTime(0);
                seekAllVideos(0);
                seek(0);
            }
        }
        
        togglePlayPause();
    };

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
            <div className="flex items-center gap-4 rounded-lg border border-slate-600 bg-slate-800 p-4 shadow-lg">
                {/* Play/Pause Button */}
                <button
                    onClick={handlePlayPause}
                    className="flex cursor-pointer h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700"
                >
                    {isPlaying ? <FaPause className="h-4 w-4" /> : <FaPlay className="h-4 w-4" />}
                </button>

                {/* Time Display */}
                <div className="text-sm text-slate-300">
                    {formatTime(currentTime)} / {formatTime(duration)}
                </div>

                {/* Progress Bar */}
                <div className="flex items-center gap-2">
                    <div
                        className="h-2 w-64 cursor-pointer rounded-full bg-slate-600"
                        onClick={handleProgressClick}
                    >
                        <div
                            className="h-full rounded-full bg-blue-500 transition-all duration-100"
                            style={{ width: `${progressPercentage}%` }}
                        />
                    </div>
                </div>

                {/* Frame Display - now calculated from actual video time */}
                <div className="text-sm text-slate-400">
                    Frame: {currentFrame} / {totalFrames}
                </div>
            </div>
        </div>
    );
};
