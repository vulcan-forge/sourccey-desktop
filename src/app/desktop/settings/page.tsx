import Link from 'next/link';

export default function DesktopSettingsPage() {
    return (
        <div className="min-h-screen bg-slate-900/30">
            <div className="container mx-auto flex flex-col gap-8 px-8 py-10">
                <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-10 shadow-2xl">
                    <div className="flex flex-col gap-3">
                        <h1 className="text-3xl font-semibold text-white">Settings</h1>
                        <p className="text-sm text-slate-300">Access diagnostics and local resources for the Sourccey desktop app.</p>
                    </div>
                </div>

                <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-6 shadow-xl">
                    <div className="flex flex-col gap-4">
                        <div>
                            <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">Logs</div>
                            <p className="mt-2 text-sm text-slate-300">View runtime and frontend logs in a dedicated logs viewer.</p>
                        </div>
                        <div>
                            <Link
                                href="/desktop/settings/logs"
                                className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-300"
                            >
                                Open Logs Viewer
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
