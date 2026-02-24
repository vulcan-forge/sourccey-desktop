'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useLerobotUpdateStatus } from '@/hooks/System/lerobot-update.hook';

export const DesktopTopNavbar = () => {
    const { data: lerobotStatus } = useLerobotUpdateStatus();
    const needsUpdate = lerobotStatus ? !lerobotStatus.upToDate : false;

    return (
        <nav className="relative z-80 flex h-16 flex-col border-b border-slate-700 bg-slate-800 backdrop-blur-md">
            <div className="flex h-full items-center justify-between px-8">
                <div className="flex h-full w-full items-center">
                    <Link href="/desktop/" className="flex w-128 items-center gap-2 text-2xl font-bold">
                        <Image
                            src="/assets/logo/SourcceyLogo.png"
                            alt="Sourccey Logo"
                            width={48}
                            height={48}
                            priority
                            className="drop-shadow-logo"
                        />
                        <span className="inline-block bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 bg-clip-text pb-1 text-3xl leading-tight text-transparent">
                            Vulcan Studio
                        </span>
                    </Link>

                    <div className="grow" />

                    {needsUpdate && (
                        <Link
                            href="/desktop/setup"
                            title="Update available for lerobot-vulcan. Open setup to reset modules."
                            className="inline-flex items-center justify-center rounded-lg border border-amber-400/70 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:border-amber-300 hover:text-amber-100"
                        >
                            Update Required
                        </Link>
                    )}
                </div>
            </div>
        </nav>
    );
};
