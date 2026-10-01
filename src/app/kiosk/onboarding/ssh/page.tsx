'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { SshCredentialsForm } from '@/components/Elements/Settings/SshCredentialsForm';
import { safeNavigate } from '@/utils/navigation';

export default function KioskSshOnboardingPage() {
    const router = useRouter();
    return (
        <main className="min-h-full overflow-y-auto bg-linear-to-br from-slate-800 via-slate-700 to-slate-800 px-6 py-10">
            <div className="mx-auto max-w-2xl rounded-3xl border border-slate-600/70 bg-slate-900/90 p-8 shadow-2xl">
                <Image src="/assets/logo/SourcceyLogo.png" alt="Sourccey Logo" width={52} height={52} />
                <p className="mt-7 text-xs font-semibold tracking-[0.2em] text-amber-300 uppercase">Kiosk onboarding</p>
                <h1 className="mt-2 text-3xl font-semibold text-white">Set up SSH access</h1>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                    Use these credentials to log in to this kiosk over SSH. The default username is <strong>sourccey</strong> and the default password is <strong>vulcan</strong>.
                </p>
                <div className="mt-7 rounded-2xl border border-slate-700 bg-slate-800/70 p-6">
                    <SshCredentialsForm onboarding onSaved={() => safeNavigate(router, '/kiosk/setup')} />
                </div>
            </div>
        </main>
    );
}
