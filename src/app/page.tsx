'use client';

import React, { useEffect, type ReactElement } from 'react';
import { Spinner } from '@/components/Elements/Spinner';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAppMode } from '@/hooks/Components/useAppMode.hook';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { safeNavigate } from '@/utils/navigation';

const HomePage = (): ReactElement => {
    const router = useRouter();
    const { isKioskMode, isLoading: isLoadingAppMode } = useAppMode();

    type DesktopUpdateStatus = {
        updateAvailable: boolean;
    };

    type LerobotUpdateStatus = {
        state: string;
    };

    // In kiosk mode, skip authentication and go directly to app once sync is done
    useEffect(() => {
        if (isLoadingAppMode) {
            return;
        }

        if (isKioskMode) {
            console.log('Kiosk mode: pushing to /kiosk');
            safeNavigate(router, '/kiosk/');
        } else {
            const checkSetup = async () => {
                try {
                    if (isTauri()) {
                        const [desktopUpdate, lerobotUpdate] = await Promise.all([
                            invoke<DesktopUpdateStatus>('desktop_update_check'),
                            invoke<LerobotUpdateStatus>('check_lerobot_update'),
                        ]);
                        const updateAvailable =
                            desktopUpdate.updateAvailable || lerobotUpdate.state === 'update_available';

                        console.log(
                            updateAvailable
                                ? 'Desktop mode: update available'
                                : 'Desktop mode: app and runtime are up to date'
                        );
                        safeNavigate(router, updateAvailable ? '/desktop/setup' : '/desktop/');
                    } else {
                        safeNavigate(router, '/desktop/');
                    }
                } catch (error) {
                    console.error('Failed to check setup status:', error);
                    safeNavigate(router, '/desktop/');
                }
            };

            void checkSetup();
        }
    }, [router, isKioskMode, isLoadingAppMode]);

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
