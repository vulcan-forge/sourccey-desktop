import Link from 'next/link';
import Image from 'next/image';

export default function HomePage() {
    return (
        <div className="min-h-screen bg-slate-900/30">
            <div className="container mx-auto flex flex-col gap-10 px-8 py-10">
                <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-10 shadow-2xl">
                    <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
                        <div className="max-w-2xl">
                            <div className="mb-4 flex items-center gap-4">
                                <Image
                                    src="/assets/logo/SourcceyLogo.png"
                                    alt="Sourccey Logo"
                                    width={64}
                                    height={64}
                                    className="drop-shadow-logo"
                                />
                                <div>
                                    <h1 className="text-4xl font-semibold text-white sm:text-5xl">Welcome back!</h1>
                                </div>
                            </div>
                            <p className="text-base text-slate-200">Everything you need to manage your Sourccey, in one place.</p>
                            <div className="mt-6 flex flex-wrap items-center gap-3">
                                <Link
                                    href="https://sourccey.com/store"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-red-400/70 via-orange-400/70 to-yellow-400/70 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:from-red-500/70 hover:via-orange-500/70 hover:to-yellow-500/70"
                                >
                                    Go to Robots
                                </Link>
                                <Link
                                    href="https://discord.gg/sourccey"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center justify-center rounded-lg border-2 border-slate-600 bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:border-slate-400"
                                >
                                    Visit the Store
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                    <div className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-6 shadow-xl">
                        <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">Get Started</div>
                        <p className="mt-3 text-sm text-slate-300">
                            Head to the Robots page to discover and pair devices on your network, or open Settings to manage credentials and
                            access point configuration.
                        </p>
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <Link
                                href="/app/robots"
                                className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg transition-colors hover:bg-slate-100"
                            >
                                Go to Robots
                            </Link>
                            <Link
                                href="/app/settings"
                                className="inline-flex items-center justify-center rounded-lg border-2 border-slate-600 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-colors hover:border-slate-400"
                            >
                                Open Settings
                            </Link>
                        </div>
                    </div>

                    <Link
                        href="https://discord.gg/sourccey"
                        target="_blank"
                        rel="noreferrer"
                        className="group flex flex-col justify-between rounded-[28px] border-2 border-slate-700 bg-slate-900 p-6 text-left shadow-xl"
                    >
                        <div>
                            <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">Learning Lab</div>
                            <h2 className="mt-3 text-2xl font-semibold text-white">Train your own AI model</h2>
                            <p className="mt-2 text-sm text-slate-300">
                                Join the Sourccey Discord to get hands-on guidance and community support for training.
                            </p>
                        </div>
                        <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-emerald-300">
                            Join the Discord
                            <span>?</span>
                        </div>
                    </Link>
                </div>
            </div>
        </div>
    );
}
