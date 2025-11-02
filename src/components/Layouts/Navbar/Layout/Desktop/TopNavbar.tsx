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

            {/* <Link
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

                    <div className="ml-auto flex items-center gap-4">
                        {isLoading && <Spinner />}

                        {/* Only show sync button if not in kiosk mode */}
                        <button
                            onClick={(e) => handleSync(e)}
                            disabled={isSyncing}
                            //className="flex w-36 cursor-pointer items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 py-1.5 font-semibold text-white transition-all duration-300 hover:from-blue-600 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                            className="flex w-36 cursor-pointer items-center justify-center gap-2 rounded-lg bg-linear-to-r from-red-400 via-orange-400 to-yellow-400 px-4 py-1.5 font-semibold text-white transition-all duration-300 hover:from-red-500 hover:via-orange-500 hover:to-yellow-500"
                            title="Click to sync, Shift+Click to check local database"
                        >
                            {isSyncing ? <Spinner /> : <FaSync className="h-4 w-4" />}
                            {isSyncing ? 'Syncing...' : 'Sync'}
                        </button>

                        {/* Only show login/register button if not in kiosk mode and not logged in */}
                        {/* {!isLoggedIn && !isLoading && (
                            <Link
                                href="/dashboard/login"
                                className="rounded-lg bg-linear-to-r from-red-400 via-orange-400 to-yellow-400 px-4 py-1.5 font-semibold text-white transition-all duration-300 hover:from-red-500 hover:via-orange-500 hover:to-yellow-500"
                            >
                                Login / Register
                            </Link>
                        )} */}

                        {isLoggedIn && (
                            <div className="relative flex items-center gap-2">
                                <button
                                    id="profile-button"
                                    onClick={() => setShowProfileMenu(!showProfileMenu)}
                                    className="flex cursor-pointer items-center gap-2 rounded-full focus:ring-2 focus:ring-yellow-500/20 focus:outline-none"
                                >
                                    <Image
                                        src={profile.image}
                                        alt={profile.name}
                                        width={32}
                                        height={32}
                                        className="h-9 w-9 rounded-full object-cover ring-2 ring-slate-700/50"
                                    />
                                </button>

                                {/* Profile Dropdown Menu */}
                                {showProfileMenu && (
                                    <div
                                        id="profile-menu"
                                        className="absolute top-12 right-0 w-48 rounded-lg border border-slate-700/50 bg-slate-800 shadow-[0_0_35px_rgba(0,0,0,0.3)] backdrop-blur-sm"
                                    >
                                        <div className="border-b border-slate-700/50 px-4 py-3">
                                            <p className="text-sm font-medium text-white">{profile.name}</p>
                                            <p className="text-xs text-slate-400">{profile.email}</p>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                await signOut({
                                                    callbackUrl: '/',
                                                    redirect: false,
                                                });
                                                router.push('/');
                                                setIsSigningOut(true);
                                            }}
                                            className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white"
                                        >
                                            <FaSignOutAlt className="h-4 w-4" />
                                            Sign Out
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
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

                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-2 font-semibold text-white transition-all duration-300 hover:from-blue-600 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isSyncing ? <Spinner color="white" width="16" height="16" /> : <FaSync className="h-4 w-4" />}
                        {isSyncing ? 'Syncing...' : 'Sync'}
                    </button>
                </div>
            </div>
        </nav>
    );
};
