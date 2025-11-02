'use client';

import React, { useEffect, useState, type ReactElement } from 'react';
import { Spinner } from '@/components/Elements/Spinner';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useSyncDefaultRobots } from '@/hooks/Models/Robot/robot.hook';
import { useGetOrCreateProfile } from '@/hooks/Models/Profile/profile.hook';
import { useAppMode } from '@/hooks/Components/useAppMode.hook';
import { checkForUpdates } from '@/utils/updater/updater';

const HomePage = (): ReactElement => {
    const router = useRouter();
    const { mutate: syncDefaultRobots, data: syncTime, isPending: isLoadingSyncDefaultRobots } = useSyncDefaultRobots();
    const { data: profile, isLoading: isLoadingProfile }: any = useGetOrCreateProfile();
    const { isKioskMode, isLoading: isLoadingAppMode } = useAppMode();
    const [syncTriggered, setSyncTriggered] = useState(false);
    const [showLoading, setShowLoading] = useState(false);
    const [updateCheckComplete, setUpdateCheckComplete] = useState(false);

    // Check for updates FIRST before anything else
    useEffect(() => {
        const checkUpdates = async () => {
            try {
                await checkForUpdates();
            } catch (error) {
                console.error('Error checking for updates:', error);
            } finally {
                setUpdateCheckComplete(true);
            }
        };

        checkUpdates();
    }, []);

    // Delay showing loading screen to prevent flash on fast loads
    useEffect(() => {
        const timer = setTimeout(() => {
            setShowLoading(true);
        }, 1000);

        return () => clearTimeout(timer);
    }, []);

    // Trigger sync when component mounts
    useEffect(() => {
        if (!syncTriggered) {
            syncDefaultRobots();
            setSyncTriggered(true);
        }
    }, [syncDefaultRobots, syncTriggered]);

    // In kiosk mode, skip authentication and go directly to app once sync is done
    useEffect(() => {
        if (!updateCheckComplete) {
            return;
        }

        if (isLoadingAppMode) {
            return;
        }

        if (isKioskMode) {
            // In kiosk mode, only wait for sync to complete
            if (!syncTime || isLoadingSyncDefaultRobots) {
                return;
            }
            console.log('Kiosk mode: pushing to /app');
            router.push('/app');
        } else {
            // In desktop mode, wait for both sync and profile
            if (!syncTime || isLoadingSyncDefaultRobots) {
                return;
            }

            if (!profile || isLoadingProfile) {
                return;
            }

            console.log('Desktop mode: pushing to /app');
            router.push('/app');
        }
    }, [router, syncTime, isLoadingSyncDefaultRobots, profile, isLoadingProfile, isKioskMode, isLoadingAppMode, updateCheckComplete]);

    // Don't show loading screen until update check is complete and 1 second has passed
    if (!updateCheckComplete || !showLoading) {
        return (
            <>
                <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900"></div>
            </>
        );
    }

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
                                    <p className="text-mdtext-center font-semibold text-slate-300">
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
