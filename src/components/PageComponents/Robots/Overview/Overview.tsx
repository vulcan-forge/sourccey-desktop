import Image from 'next/image';
import Link from 'next/link';
import { FaBolt, FaBrain, FaDatabase, FaRobot, FaTrash, FaTrophy } from 'react-icons/fa';
import { useState } from 'react';
import { useGetAIModelCount } from '@/hooks/Components/AI/AIModels/ai-model.hook';
import { useGetDatasetCount } from '@/hooks/Components/AI/Dataset/dataset.hook';
import { Spinner } from '@/components/Elements/Spinner';
import { useGetControlledRobot } from '@/hooks/Control/control.hook';
import clsx from 'clsx';
import { deleteOwnedRobot } from '@/api/Local/Robot/owned_robot';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { toast } from 'react-toastify';
import { useRouter } from 'next/navigation';

export const Overview = ({ ownedRobot }: { ownedRobot: any }) => {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'ai-models' | 'datasets'>('ai-models');
    const [isDeleting, setIsDeleting] = useState(false);

    const nickname = ownedRobot?.nickname || '';
    const robot = ownedRobot?.robot || {};
    const batteryLevel = 0;

    const { data: controlledRobot }: any = useGetControlledRobot(nickname);
    const isControlling = !!controlledRobot?.ownedRobot;

    const handleDeleteRobot = async () => {
        try {
            setIsDeleting(true);
            await deleteOwnedRobot(ownedRobot.id);
            setIsDeleting(false);

            toast.success('Robot deleted successfully', { ...toastSuccessDefaults });
            router.push('/app/owned-robots');
        } catch (error) {
            setIsDeleting(false);

            console.error(error);
            toast.error('Failed to delete robot', { ...toastErrorDefaults });
        }
    };

    if (!ownedRobot) return <></>;
    return (
        <div className="flex h-full w-full flex-col space-y-4 overflow-y-auto p-3 sm:space-y-6 sm:p-6">
            <div className="flex flex-col gap-4 rounded-xl border-2 border-slate-700 bg-slate-800 p-4 backdrop-blur-sm lg:flex-row lg:gap-6 lg:p-6">
                <div className="flex-shrink-0">
                    <div
                        className={clsx(
                            'mx-auto aspect-square w-32 overflow-hidden rounded-lg lg:h-40 lg:w-40',
                            robot.image ? 'border border-slate-600 bg-slate-700' : 'border border-orange-500/30 bg-slate-700'
                        )}
                    >
                        {robot.image ? (
                            <Image
                                src={robot.image}
                                alt={robot.name}
                                width={256}
                                height={256}
                                priority={true}
                                className="h-full w-full rounded-lg object-contain"
                            />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-500/20 to-orange-600/20">
                                <FaRobot className="h-5 w-5 text-orange-500 sm:h-6 sm:w-6 lg:h-8 lg:w-8" />
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex min-w-0 flex-col space-y-4">
                    <div className="flex flex-row gap-3">
                        <div className="flex flex-col items-start gap-2">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                                <h1 className="text-xl font-bold text-white sm:text-3xl">{robot.name}</h1>
                                {ownedRobot.nickname && (
                                    <span className="rounded-lg bg-slate-700 px-3 py-1 text-sm text-slate-300">{ownedRobot.nickname}</span>
                                )}
                            </div>
                            <p className="text-sm text-slate-400 sm:text-lg">{robot.long_name}</p>
                        </div>

                        <div className="grow" />

                        <div className="flex flex-col gap-2">
                            {robot.github_url && (
                                <Link
                                    href={robot.github_url}
                                    target="_blank"
                                    className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-600 bg-slate-700 px-3 text-xs font-medium text-slate-300 transition-colors duration-100 hover:bg-slate-600 hover:text-white sm:px-4 sm:text-sm"
                                >
                                    <span className="hidden sm:inline">View on GitHub</span>
                                    <span className="sm:hidden">GitHub</span>
                                </Link>
                            )}
                        </div>
                    </div>

                    <p className="text-sm text-slate-300 sm:text-base">{robot.description}</p>

                    <div className="flex gap-6">
                        <div className="grow" />

                        <div className="flex flex-row gap-2">
                            <div className="flex items-center gap-2 rounded-lg bg-slate-700 px-2 py-2 sm:px-3">
                                <div className={`h-2 w-2 rounded-full ${isControlling ? 'bg-green-400' : 'bg-red-400'}`} />
                                <span className="text-xs text-slate-300 sm:text-sm">{isControlling ? 'Running' : 'Not Running'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Danger Zone */}
            <div className="rounded-xl border-2 border-red-500/30 bg-red-950/20 backdrop-blur-sm">
                <div className="p-4">
                    <div className="mb-3">
                        <h3 className="text-lg font-semibold text-red-400">Danger Zone</h3>
                        <p className="text-sm text-red-300/80">Once you delete a robot, there is no going back. Please be certain.</p>
                    </div>
                    <button
                        onClick={handleDeleteRobot}
                        className="flex cursor-pointer items-center gap-2 rounded-lg bg-red-500/40 px-4 py-2.5 font-medium text-red-200 transition-all duration-200 hover:bg-red-500/60 hover:text-red-300 hover:shadow-md"
                    >
                        {isDeleting ? (
                            <Spinner />
                        ) : (
                            <>
                                <FaTrash className="text-sm" /> Delete Robot
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
