import { useGetOwnedRobots } from '@/hooks/Models/OwnedRobot/owned-robot.hook';
import { useGetProfile } from '@/hooks/Models/Profile/profile.hook';
import Link from 'next/link';
import { FaBrain, FaPlus, FaUsers } from 'react-icons/fa';

export const HomeWelcome = () => {
    const { data: profile, isLoading: isLoadingProfile }: any = useGetProfile();
    const enabled = !isLoadingProfile && !!profile?.id;
    const { data: ownedRobots, isLoading: isLoadingOwnedRobots }: any = useGetOwnedRobots(profile?.id, enabled);

    return (
        <div className="flex flex-col gap-4 rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-white">Welcome back!</h2>
                    <p className="mt-2 text-slate-300">Here&apos;s what&apos;s happening with your robots today.</p>
                </div>
                <div className="text-right">
                    <div className="text-sm text-slate-400">Total Robots</div>
                    <div className="text-3xl font-bold text-white">{ownedRobots?.length || 0}</div>
                </div>
            </div>

            {/* Quick Actions */}
            <HomeQuickLinks />
        </div>
    );
};

export const HomeQuickLinks = () => {
    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Link
                href="/app/robots"
                className="flex items-center space-x-3 rounded-lg bg-orange-500/10 p-4 transition-all hover:bg-orange-500/20 hover:shadow-lg hover:shadow-orange-500/10"
            >
                <div className="rounded-lg bg-orange-500/20 p-2">
                    <FaPlus className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                    <div className="font-medium text-white">Add Robot</div>
                    <div className="text-sm text-slate-400">Register a new robot</div>
                </div>
            </Link>
            <Link
                href="/app/data"
                className="flex items-center space-x-3 rounded-lg bg-gradient-to-r from-blue-500/10 to-blue-600/10 p-4 transition-all duration-300 hover:from-blue-500/20 hover:to-blue-600/20 hover:shadow-lg hover:shadow-blue-500/10"
            >
                <div className="rounded-lg bg-blue-500/20 p-2">
                    <FaUsers className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                    <div className="font-medium text-white">Create Data</div>
                    <div className="text-sm text-slate-400">Record robot data</div>
                </div>
            </Link>
            <Link
                href="/app/training"
                className="flex items-center space-x-3 rounded-lg bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 p-4 transition-all duration-300 hover:from-yellow-500/20 hover:to-yellow-600/20 hover:shadow-lg hover:shadow-yellow-500/10"
            >
                <div className="rounded-lg bg-yellow-500/20 p-2">
                    <FaBrain className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                    <div className="font-medium text-white">Train AI</div>
                    <div className="text-sm text-slate-400">Train your AI</div>
                </div>
            </Link>
            {/* <Link
                href="#rankings"
                className="flex items-center space-x-3 rounded-lg bg-gradient-to-r from-purple-500/10 to-purple-600/10 p-4 transition-all duration-300 hover:from-purple-500/20 hover:to-purple-600/20 hover:shadow-lg hover:shadow-purple-500/10"
                onClick={(e) => {
                    e.preventDefault();
                    document.getElementById('rankings')?.scrollIntoView({
                        behavior: 'smooth',
                    });
                }}
            >
                <div className="rounded-lg bg-purple-500/20 p-2">
                    <FaTrophy className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                    <div className="font-medium text-white">View Rankings</div>
                    <div className="text-sm text-slate-400">See performance stats</div>
                </div>
            </Link> */}
        </div>
    );
};
