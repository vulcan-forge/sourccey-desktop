'use client';

import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';

interface TimeContextType {
  currentTime: number;
  isPlaying: boolean;
  duration: number;
  playbackRate: number;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  seek: (time: number) => void;
  setDuration: (duration: number) => void;
  setPlaybackRate: (rate: number) => void;
  currentFrame: number;
  totalFrames: number;
  seekToFrame: (frame: number) => void;
  setTotalFrames: (frames: number) => void;
}

const TimeContext = createContext<TimeContextType | undefined>(undefined);

interface TimeProviderProps {
  children: ReactNode;
  initialDuration?: number;
  initialTotalFrames?: number;
}

export const TimeProvider = ({ 
  children, 
  initialDuration = 0, 
  initialTotalFrames = 0 
}: TimeProviderProps) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(initialDuration);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [totalFrames, setTotalFrames] = useState<number>(initialTotalFrames);

  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Calculate current frame
  const currentFrame = duration > 0 && totalFrames > 0
    ? Math.floor((currentTime / duration) * totalFrames)
    : 0;

  // Simple animation loop - no complex syncing
  useEffect(() => {
    if (isPlaying) {
      const updateTime = (timestamp: number) => {
        if (lastTimeRef.current === 0) {
          lastTimeRef.current = timestamp;
        }
        
        const deltaTime = (timestamp - lastTimeRef.current) / 1000;
        const newTime = Math.min(currentTime + (deltaTime * playbackRate), duration);
        
        setCurrentTime(newTime);
        lastTimeRef.current = timestamp;
        
        if (newTime < duration) {
          animationFrameRef.current = requestAnimationFrame(updateTime);
        } else {
          setIsPlaying(false);
        }
      };
      
      animationFrameRef.current = requestAnimationFrame(updateTime);
    } else {
      lastTimeRef.current = 0;
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, currentTime, duration, playbackRate]);

  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);
  const togglePlayPause = useCallback(() => setIsPlaying(prev => !prev), []);
  
  const seek = useCallback((time: number) => {
    const clampedTime = Math.max(0, Math.min(time, duration));
    setCurrentTime(clampedTime);
  }, [duration]);

  const seekToFrame = useCallback((frame: number) => {
    const clampedFrame = Math.max(0, Math.min(frame, totalFrames));
    const time = (clampedFrame / totalFrames) * duration;
    seek(time);
  }, [totalFrames, duration, seek]);

  const value: TimeContextType = {
    currentTime,
    isPlaying,
    duration,
    playbackRate,
    play,
    pause,
    togglePlayPause,
    seek,
    setDuration,
    setPlaybackRate,
    currentFrame,
    totalFrames,
    seekToFrame,
    setTotalFrames,
  };

  return (
    <TimeContext.Provider value={value}>
      {children}
    </TimeContext.Provider>
  );
};

export const useTime = () => {
  const context = useContext(TimeContext);
  if (context === undefined) {
    throw new Error('useTime must be used within a TimeProvider');
  }
  return context;
};
