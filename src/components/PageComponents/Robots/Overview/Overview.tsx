import { FaRobot, FaGamepad } from 'react-icons/fa';
import { setContent } from '@/hooks/Components/OwnedRobots/owned-robots.hook';

export const Overview = ({ ownedRobot }: { ownedRobot: any }) => {
    if (!ownedRobot) return <></>;

    return (
        <div className="flex h-full w-full flex-col gap-6 overflow-y-auto p-3 sm:p-6">
            <div className="rounded-2xl border-2 border-slate-700 bg-slate-900/60 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.35)]">
                <div className="mb-3 text-xs font-semibold tracking-[0.3em] text-slate-500 uppercase">Overview</div>
                <h1 className="text-2xl font-semibold text-white sm:text-3xl">{ownedRobot?.robot?.name ?? 'Robot Overview'}</h1>
                <p className="mt-2 text-sm text-slate-300">
                    Choose how you want to operate your robot: direct manual control or AI-driven behavior.
                </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <button
                    type="button"
                    onClick={() => setContent('teleoperate')}
                    className="group cursor-pointer rounded-2xl border-2 border-slate-700/70 bg-slate-900/60 p-6 text-left shadow-[0_18px_40px_rgba(15,23,42,0.25)] transition hover:border-amber-400/40 hover:bg-slate-900/80"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-300">
                            <FaGamepad className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">Teleoperate</h2>
                            <p className="text-xs text-slate-400">Manual robot control</p>
                        </div>
                    </div>
                    <p className="mt-4 text-sm text-slate-300">
                        Drive the robot in real time using on-screen controls or connected input devices. Ideal for precise tasks,
                        testing, and live demonstrations.
                    </p>
                </button>

                <button
                    type="button"
                    onClick={() => setContent('ai')}
                    className="group cursor-pointer rounded-2xl border-2 border-slate-700/70 bg-slate-900/60 p-6 text-left shadow-[0_18px_40px_rgba(15,23,42,0.25)] transition hover:border-emerald-400/40 hover:bg-slate-900/80"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-300">
                            <FaRobot className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">AI Models</h2>
                            <p className="text-xs text-slate-400">Autonomous control</p>
                        </div>
                    </div>
                    <p className="mt-4 text-sm text-slate-300">
                        Run AI models to control the robot automatically. Use trained policies for repeatable behaviors and hands-free
                        operation.
                    </p>
                </button>
            </div>
        </div>
    );
};
