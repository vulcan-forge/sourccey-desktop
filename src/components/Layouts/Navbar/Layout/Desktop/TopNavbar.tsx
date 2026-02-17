import { Spinner } from '@/components/Elements/Spinner';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { HiMenuAlt2, HiX } from 'react-icons/hi';
import { FaSignOutAlt, FaSync, FaRobot } from 'react-icons/fa';
import { signOut } from 'next-auth/react';
import { toast } from 'react-toastify';
import { syncRobotsWithNotifications } from '@/api/Local/Sync/sync_robots';

export const DesktopTopNavbar = ({ profile, isLoading }: { profile: any; isLoading: boolean }) => {
    const pathname = usePathname();
    const router = useRouter();

    const [isSigningOut, setIsSigningOut] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const isLoggedIn = false;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest('#profile-menu') && !target.closest('#profile-button')) {
                setShowProfileMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [profile]);

    const isRobotPage = pathname.includes('/app/robots');
    const isStorePage = pathname.includes('/app/store');

    const handleSync = async (event?: React.MouseEvent) => {
        // If Shift+Click, show debug info about local database
        if (event?.shiftKey) {
            console.info('🔍 Debug mode: Checking local database contents...');
            // Debug info removed - no longer needed
            toast.info('Debug mode: Local database check removed');
            return;
        }

        setIsSyncing(true);

        try {
            // Sync robots
            const robotsResult = await syncRobotsWithNotifications({
                robotsPerPage: 30,
                maxPages: 10,
                onlyUpdatedSinceLastSync: true,
            });

            if (!robotsResult.success) {
                console.error('Robots sync failed:', robotsResult.error);
            }

            // Store sync removed - no longer needed
        } catch (error) {
            console.error('Unexpected error during sync:', error);
            toast.error('An unexpected error occurred during sync.');
        } finally {
            setIsSyncing(false);
        }
    };

    const NavLinks = () => (
        <>
            {/*
            <Link
                href="/app/robots"
                className={`text-md flex h-16 items-center px-4 font-bold transition-colors duration-200 ${
                    isRobotPage
                        ? 'bg-gradient-to-r from-red-400/50 via-orange-400/50 to-yellow-400/50 text-white'
                        : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                }`}
                onClick={() => setIsMenuOpen(false)}
            >
                <FaRobot className="mr-2 h-5 w-5" />
                Robots
            </Link>

            <Link
                href="/app/store"
                className={`text-md flex h-16 items-center px-4 font-bold transition-colors duration-200 ${
                    isStorePage
                        ? 'bg-gradient-to-r from-red-400/50 via-orange-400/50 to-yellow-400/50 text-white'
                        : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                }`}
                onClick={() => setIsMenuOpen(false)}
            >
                <FaShoppingCart className="mr-2 h-5 w-5" />
                Store
            </Link> */}
        </>
    );

    if (isSigningOut) {
        return (
            <div className="flex h-screen min-h-screen items-center justify-center bg-slate-800">
                <Spinner />
            </div>
        );
    }

    return (
        <nav className="relative z-80 flex h-16 flex-col border-b border-slate-700 bg-slate-800 backdrop-blur-md">
            <div className="flex h-full items-center justify-between px-8">
                <div className="flex h-full w-full items-center">
                    <Link href="/app" className="flex w-56 items-center gap-2 text-2xl font-bold">
                        <Image
                            src="/assets/logo/SourcceyLogo.png"
                            alt="Sourccey Logo"
                            width={48}
                            height={48}
                            priority
                            className="drop-shadow-logo"
                        />
                        <span className="inline-block bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 bg-clip-text pb-1 text-3xl leading-tight text-transparent">
                            Sourccey
                        </span>
                    </Link>

                    {/* Hide nav links in kiosk mode */}
                    <div className="hidden space-x-6 md:flex">
                        <NavLinks />
                    </div>

                    <div className="grow" />
                </div>

                {/* Mobile Menu Button */}
                <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg transition-all md:hidden ${
                        isMenuOpen
                            ? 'bg-gradient-to-r from-orange-500 to-yellow-500 text-white'
                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70 hover:text-white'
                    }`}
                >
                    {isMenuOpen ? <HiX className="h-6 w-6" /> : <HiMenuAlt2 className="h-6 w-6" />}
                </button>
            </div>

            {/* Mobile Menu */}
            <div
                className={`absolute top-full right-0 left-0 z-90 border-b border-slate-700/50 bg-slate-800 transition-all duration-300 ease-in-out md:hidden ${
                    isMenuOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-4 opacity-0'
                }`}
            >
                <div className="flex flex-col space-y-2 p-4">
                    <NavLinks />
                </div>
            </div>
        </nav>
    );
};
