'use client';

import React, { useEffect, type ReactElement } from 'react';
import { AppBootScreen } from '@/components/Elements/AppBootScreen';
import { useRouter } from 'next/navigation';
import { useAppMode } from '@/hooks/Components/useAppMode.hook';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { safeNavigate } from '@/utils/navigation';
import { CURRENT_ONBOARDING_VERSION, getPrivacyPreferences } from '@/hooks/System/privacy-preferences.hook';

const HomePage = (): ReactElement => {
    const router = useRouter();
    const { isKioskMode, isLoading: isLoadingAppMode } = useAppMode();

    type SetupStatus = {
        installed: boolean;
    };

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
            const checkStartupStatus = async () => {
                try {
                    if (isTauri()) {
                        const privacyPreferences = await getPrivacyPreferences();
                        if (
                            !privacyPreferences.onboardingCompleted ||
                            privacyPreferences.onboardingVersion < CURRENT_ONBOARDING_VERSION
                        ) {
                            safeNavigate(router, '/desktop/onboarding/');
                            return;
                        }

                        const [setupStatus, desktopUpdate, lerobotUpdate] = await Promise.all([
                            invoke<SetupStatus>('setup_check'),
                            invoke<DesktopUpdateStatus>('desktop_update_check'),
                            invoke<LerobotUpdateStatus>('check_lerobot_update'),
                        ]);
                        const updateAvailable =
                            desktopUpdate.updateAvailable || lerobotUpdate.state === 'update_available';
                        const needsSetupOrUpdate = !setupStatus.installed || updateAvailable;

                        console.log(
                            !setupStatus.installed
                                ? 'Desktop mode: runtime setup required'
                                : updateAvailable
                                  ? 'Desktop mode: update available'
                                  : 'Desktop mode: app and runtime are up to date'
                        );
                        safeNavigate(router, needsSetupOrUpdate ? '/desktop/setup' : '/desktop/');
                    } else {
                        safeNavigate(router, '/desktop/');
                    }
                } catch (error) {
                    console.error('Failed to check startup status:', error);
                    safeNavigate(router, '/desktop/');
                }
            };

            void checkStartupStatus();
        }
    }, [router, isKioskMode, isLoadingAppMode]);

    return <AppBootScreen message="Checking your workspace..." />;
};

export default HomePage;
