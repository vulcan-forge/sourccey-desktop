'use client';

import { RobotNavbar } from '@/components/Layouts/Navbar/Robot/RobotNavbar';

export const RobotLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="flex flex-col">
            <RobotNavbar />
            <div className="flex-1">{children}</div>
        </div>
    );
};
