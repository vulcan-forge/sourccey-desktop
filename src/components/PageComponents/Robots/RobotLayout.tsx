'use client';

import { RobotNavbar } from '@/components/Layouts/Navbar/Robot/RobotNavbar';

export const RobotLayout = ({ children, ownedRobot }: { children: React.ReactNode; ownedRobot: any }) => {
    return (
        <div className="flex flex-col">
            <RobotNavbar ownedRobot={ownedRobot} />
            <div className="flex-1">{children}</div>
        </div>
    );
};
