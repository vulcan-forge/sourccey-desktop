import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FaRobot, FaUsers } from 'react-icons/fa';

export const RobotNavbar = () => {
    const searchParams = useSearchParams();
    const tab = searchParams.get('tab') || 'my';

    return (
        <div className="flex justify-start border-b border-slate-700/50 bg-slate-800/60 pl-6 shadow-sm">
            <div className="my-2 flex gap-2 rounded-lg bg-slate-600/40 p-1">
                <Link
                    href="/dashboard/robots?tab=my"
                    className={`flex items-center gap-2 rounded-md px-4 py-1 text-base font-semibold transition-all duration-200 ${
                        tab === 'my'
                            ? 'bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 text-white shadow-md'
                            : 'text-white hover:bg-slate-500/40'
                    }`}
                >
                    <FaRobot className="h-5 w-5" />
                    My Robots
                </Link>
                <Link
                    href="/dashboard/robots?tab=all"
                    className={`flex items-center gap-2 rounded-md px-4 py-1 text-base font-semibold transition-all duration-200 ${
                        tab === 'all'
                            ? 'bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 text-white shadow-md'
                            : 'text-white hover:bg-slate-500/40'
                    }`}
                >
                    <FaUsers className="h-5 w-5" />
                    All Robots
                </Link>
            </div>
        </div>
    );
};
