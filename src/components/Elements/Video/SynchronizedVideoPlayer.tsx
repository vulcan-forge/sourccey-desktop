'use client';

import React, { useEffect, useRef } from 'react';
import { VideoPlayer } from './VideoPlayer';
import { useTime } from '@/context/time-context';

interface SynchronizedVideoPlayerProps {
    src: string;
    title?: string;
    className?: string;
    autoPlay?: boolean;
    muted?: boolean;
    compact?: boolean;
    videoId: string; // Unique identifier for this video
}

export const SynchronizedVideoPlayer: React.FC<SynchronizedVideoPlayerProps> = ({
    src,
    title,
    className,
    autoPlay = false,
    muted = true,
    compact = true,
    videoId,
}) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    
    const { 
        isPlaying, 
        setDuration: setGlobalDuration,
    } = useTime();

    // Find the video element
    useEffect(() => {
        const findVideoElement = () => {
            const video = document.querySelector(`video[src="${src}"]`) as HTMLVideoElement;
            if (video) {
                videoRef.current = video;
            }
        };

        const timer = setTimeout(findVideoElement, 100);
        return () => clearTimeout(timer);
    }, [src]);

    // ONLY control play/pause - NO time syncing at all
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handlePlay = async () => {
            try {
                if (isPlaying && video.paused) {
                    await video.play();
                }
            } catch (error) {
                console.log('Play interrupted, this is normal:', error);
                // Don't throw the error, just log it
            }
        };

        const handlePause = () => {
            if (!isPlaying && !video.paused) {
                video.pause();
            }
        };

        // Use a small delay to prevent race conditions
        const timer = setTimeout(() => {
            if (isPlaying) {
                handlePlay();
            } else {
                handlePause();
            }
        }, 10);

        return () => clearTimeout(timer);
    }, [isPlaying]);

    // Only the master video sets duration
    const handleDurationChange = (videoDuration: number) => {
        if (videoId === 'master') {
            setGlobalDuration(videoDuration);
        }
    };

    return (
        <VideoPlayer
            src={src}
            title={title}
            className={className}
            autoPlay={autoPlay}
            muted={muted}
            compact={compact}
            onDurationChange={handleDurationChange}
        />
    );
};
