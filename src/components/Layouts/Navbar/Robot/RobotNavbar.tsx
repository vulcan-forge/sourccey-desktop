import { FaGamepad, FaVideo } from 'react-icons/fa';

import { setContent, useGetContent } from '@/hooks/Components/OwnedRobots/owned-robots.hook';
import Link from 'next/link';
import { FaArrowLeft, FaCog } from 'react-icons/fa';

export const RobotNavbar = () => {
    const { data: content } = useGetContent();

    const overview = 'overview';
    const teleoperate = 'teleoperate';
    const runAIModel = 'run ai model';

    const isOverviewActive = content === overview;
    const isTeleoperateActive = content === teleoperate;
    const isRunAIModelActive = content === runAIModel;

    return (
        <nav className="bg-slate-825 border-slate-725 flex flex-col border-b px-6 py-4 backdrop-blur-sm">
            <div className="flex items-center gap-4">
                <Link
                    href="/app/owned-robots"
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:bg-slate-700/70 hover:text-white"
                >
                    <FaArrowLeft className="h-4 w-4" />
                    Back
                </Link>

                <div className="bg-slate-725 mx-4 h-8 w-0.5" />

                <div className="flex gap-2">
                    <NavButton content={overview} icon={FaCog} isActive={isOverviewActive}>
                        Overview
                    </NavButton>
                    <NavButton content={teleoperate} icon={FaGamepad} isActive={isTeleoperateActive}>
                        Teleoperate
                    </NavButton>
                    <NavButton content={runAIModel} icon={FaVideo} isActive={isRunAIModelActive}>
                        Run AI Model
                    </NavButton>
                </div>

                <div className="grow" />
            </div>
        </nav>
    );
};

const NavButton = ({
    content,
    icon: Icon,
    isActive,
    children,
}: {
    content: string;
    icon: any;
    isActive: boolean;
    children: React.ReactNode;
}) => {
    return (
        <button
            onClick={() => setContent(content)}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                isActive
                    ? 'bg-gradient-to-r from-orange-500 to-yellow-500 text-white shadow-lg hover:from-orange-600 hover:to-yellow-600'
                    : 'bg-slate-725 text-slate-300 transition-all duration-200 hover:bg-slate-700 hover:text-white'
            }`}
        >
            <Icon className="h-4 w-4" />
            {children}
        </button>
    );
};
