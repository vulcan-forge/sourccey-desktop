'use client';

import React, { createContext, useContext, useState, type ReactNode } from 'react';

interface RobotStatusContextType {
    isRobotStarted: boolean;
    setIsRobotStarted: (started: boolean) => void;    
}

const RobotStatusContext = createContext<RobotStatusContextType | undefined>(undefined);

export const RobotStatusProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isRobotStarted, setIsRobotStarted] = useState(false);

    return (
        <RobotStatusContext.Provider value={{ isRobotStarted, setIsRobotStarted }}>
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

