'use client';

import Link from 'next/link';
import { SshCredentialsForm } from '@/components/Elements/Settings/SshCredentialsForm';

export default function KioskSshSettingsPage() {
    return (
        <main className="min-h-full bg-slate-900/30 px-8 py-8">
            <div className="mx-auto max-w-2xl">
                <Link href="/kiosk/settings" className="text-sm font-semibold text-amber-300 hover:text-amber-200">← Kiosk Settings</Link>
                <h1 className="mt-5 text-3xl font-bold text-white">SSH Settings</h1>
                <p className="mt-2 text-slate-300">Replace the password for the fixed sourccey SSH account.</p>
                <div className="mt-7 rounded-2xl border border-slate-700 bg-slate-800 p-6">
                    <SshCredentialsForm />
                </div>
            </div>
        </main>
    );
}
