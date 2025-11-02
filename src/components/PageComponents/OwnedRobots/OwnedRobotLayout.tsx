'use client';

import { OwnedRobotNavbar } from '@/components/Layouts/Navbar/OwnedRobot/OwnedRobotNavbar';

export const OwnedRobotLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="flex flex-col">
            <OwnedRobotNavbar />
            <div className="flex-1">{children}</div>
        </div>
    );
};
