'use client';
import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function WelcomePage() {
    const [visible, setVisible] = useState(false);
    const router = useRouter();

    useEffect(() => {
        setTimeout(() => setVisible(true), 100); // slight delay for fade-in
    }, []);

    // Handler for any click or touch
    const handleNavigate = () => {
        router.push('/home');
    };

    return (
        <div
            className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 transition-opacity duration-1500"
            style={{ opacity: visible ? 1 : 0 }}
            onClick={handleNavigate}
            onTouchStart={handleNavigate}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleNavigate()}
            aria-label="Go to home"
        >
            <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-slate-700/50 bg-slate-800/80 p-8 shadow-2xl backdrop-blur-md">
                <div className="absolute -top-16 -right-16 h-32 w-32 rounded-full bg-red-500/20 blur-2xl"></div>
                <div className="absolute -bottom-16 -left-16 h-32 w-32 rounded-full bg-orange-500/20 blur-2xl"></div>
                <Image src="/assets/tauri.svg" alt="Sourccey Logo" width={96} height={96} className="mb-2" priority />
                <h1 className="mb-4 text-center text-4xl font-bold">
                    <span className="bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 bg-clip-text text-transparent">
                        Welcome to Sourccey!
                    </span>
                </h1>
                <p className="text-md mb-8 text-center font-semibold text-slate-300">Touch the screen to begin</p>
            </div>
        </div>
    );
}
