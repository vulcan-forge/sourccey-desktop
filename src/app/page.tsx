'use client';

import React, { useEffect, type ReactElement } from 'react';
import { Spinner } from '@/components/Elements/Spinner';
import Image from 'next/image';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { checkForUpdates } from '@/utils/updater/updater';

const HomePage = (): ReactElement => {
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

    // Force navigation based on Tauri app mode (hard reload)
    useEffect(() => {
        let cancelled = false;

        const resolveTargetPath = async () => {
            if (typeof window === 'undefined') return;

            const currentPath = window.location.pathname;
            if (currentPath.startsWith('/kiosk') || currentPath.startsWith('/desktop')) {
                return;
            }

            try {
                const timeoutMs = 1500;
                const isKiosk = isTauri()
                    ? await Promise.race<boolean>([
                          invoke<boolean>('get_app_mode'),
                          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
                      ])
                    : false;

                if (cancelled) return;

                const targetPath = isKiosk ? '/kiosk' : '/desktop';
                if (window.location.pathname !== targetPath) {
                    window.location.replace(targetPath);
                }
            } catch (error) {
                console.error('Failed to resolve app mode:', error);
                if (!cancelled && window.location.pathname !== '/desktop') {
                    window.location.replace('/desktop');
                }
            }
        };

        resolveTargetPath();

        return () => {
            cancelled = true;
        };
    }, []);

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
