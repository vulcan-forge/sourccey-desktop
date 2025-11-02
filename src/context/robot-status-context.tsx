'use client';

import React, { createContext, useContext, useState, type ReactNode } from 'react';

interface RobotStatusContextType {
    robotStarted: boolean;
    isHostReady: boolean;
    setRobotStarted: (started: boolean) => void;
    setIsHostReady: (ready: boolean) => void;
}

const RobotStatusContext = createContext<RobotStatusContextType | undefined>(undefined);

export const RobotStatusProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [robotStarted, setRobotStarted] = useState(false);
    const [isHostReady, setIsHostReady] = useState(false);

    return (
        <RobotStatusContext.Provider value={{ robotStarted, isHostReady, setRobotStarted, setIsHostReady }}>
            {children}
        </RobotStatusContext.Provider>
    );
};

export const useRobotStatus = () => {
    const context = useContext(RobotStatusContext);
    if (context === undefined) {
        throw new Error('useRobotStatus must be used within a RobotStatusProvider');
    }
    return context;
};

