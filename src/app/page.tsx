'use client';

import React, { useEffect, type ReactElement } from 'react';
import { Spinner } from '@/components/Elements/Spinner';
import Image from 'next/image';
import { checkForUpdates } from '@/utils/updater/updater';
import { usePathname, useRouter } from 'next/navigation';
import { useAppMode } from '@/hooks/Components/useAppMode.hook';

const HomePage = (): ReactElement => {
    const router = useRouter();
    const pathname = usePathname();
    const { isKioskMode, isLoading: isAppModeLoading } = useAppMode();
    // Check for updates FIRST before anything else
    useEffect(() => {
        const checkUpdates = async () => {
            try {
                await checkForUpdates();
            } catch (error) {
                console.error('Error checking for updates:', error);
            }
        };

        checkUpdates();
    }, []);

    // Navigate based on app mode (client-side)
    useEffect(() => {
        if (isAppModeLoading) return;
        if (pathname.startsWith('/kiosk') || pathname.startsWith('/desktop')) return;

        const targetPath = isKioskMode ? '/kiosk' : '/desktop';
        if (pathname !== targetPath) {
            router.replace(targetPath);
        }
    }, [isAppModeLoading, isKioskMode, pathname, router]);

    return (
        <>
            <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900">
                <div className="container mx-auto flex min-h-screen flex-col items-center justify-center px-4">
                    <div className="relative w-160 shadow-2xl">
                        <div className="absolute -top-16 -right-16 h-32 w-32 rounded-full bg-red-500/20 blur-2xl"></div>
                        <div className="absolute -bottom-16 -left-16 h-32 w-32 rounded-full bg-orange-500/20 blur-2xl"></div>

                        <div className="relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border-2 border-slate-700/50 bg-slate-800 p-8 backdrop-blur-md">
                            <div className="flex items-center justify-center gap-8">
                                <Image
                                    src="/assets/logo/SourcceyLogo.png"
                                    alt="Sourccey Logo"
                                    width={96}
                                    height={96}
                                    className="drop-shadow-logo"
                                    priority
                                />
                                <div className="flex flex-col gap-4">
                                    <h1 className="text-center text-4xl font-bold">
                                        <span className="bg-linear-to-r from-red-400 via-orange-400 to-yellow-400 bg-clip-text text-transparent">
                                            Welcome to Sourccey!
                                        </span>
                                    </h1>
                                    <p className="text-md text-center font-semibold text-slate-300">
                                        Loading your journey with intelligent robots!
                                    </p>
                                </div>
                            </div>
                            <div className="flex justify-center">
                                <Spinner color="yellow" width="w-6" height="h-6" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default HomePage;
