import React, { useState, useEffect } from 'react';
import { GeneralModal } from '../GeneralModal';
import { FaRobot } from 'react-icons/fa';
import { useModalContext } from '@/hooks/Modals/context.hook';
import type { Robot } from '@/types/Models/robot';
import Image from 'next/image';
import { getProfile } from '@/api/Local/Profile/profile';
import { addOwnedRobot } from '@/api/Local/Robot/owned_robot';
import { toast } from 'react-toastify';
import { useGetOwnedRobotByNickname } from '@/hooks/Models/OwnedRobot/owned-robot.hook';
import clsx from 'clsx';
import { Tooltip } from 'react-tooltip';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';

interface AddMyRobotModalProps {}

export const AddMyRobotModal: React.FC<AddMyRobotModalProps> = () => {
    const [nickname, setNickname] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { getModalData, closeModal, useGetModal } = useModalContext();

    const modelId = 'addMyRobot';
    const { data: modalState }: any = useGetModal(modelId);
    const { data: existingRobot } = useGetOwnedRobotByNickname(nickname);

    const robot: Robot | undefined = getModalData('addMyRobot');
    useEffect(() => {
        if (robot && !nickname) {
            const defaultName = robot.robot_type ? `${robot.robot_type}-001` : 'my-robot-001';
            setNickname(defaultName);
        }
    }, [robot, nickname]);

    const onAddRobot = async (nickname: string) => {
        if (existingRobot) {
            toast.error('Robot already exists');
            return;
        }

        const localProfile = await getProfile();
        if (!localProfile || !localProfile.id) {
            console.error('No local profile found');
            return;
        }

        if (!robot || !robot.id) {
            console.error('No robot found');
            return;
        }

        const ownedRobot = await addOwnedRobot(localProfile.id, robot.id, nickname);
        if (ownedRobot) {
            toast.success('Robot added successfully', { ...toastSuccessDefaults });
            closeModal('addMyRobot');
        } else {
            toast.error('Failed to add robot', { ...toastErrorDefaults });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!!existingRobot) {
            return;
        }

        if (!nickname.trim()) {
            return;
        }

        setIsSubmitting(true);
        try {
            await onAddRobot(nickname.trim());
            setNickname('');
            closeModal(modelId);
        } catch (error) {
            console.error('Error adding robot:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (!isSubmitting) {
            setNickname('');
            closeModal(modelId);
        }
    };

    const robotName = robot?.name || 'My Robot';
    const title = robotName ? `Add New ${robotName}` : 'Add new robot';
    const image = robot?.image || null;

    if (!modalState) return null;
    return (
        <>
            <GeneralModal isOpen={true} onClose={handleClose} title={title} size="md">
                <div className="space-y-6">
                    {/* Robot Info */}
                    {robot && (
                        <div className="bg-slate-750 rounded-lg border border-slate-600 p-4">
                            <div className="flex items-center gap-3">
                                <div className="h-12 w-12 overflow-hidden rounded-lg bg-slate-600">
                                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-500/20 to-orange-600/20">
                                        {image ? (
                                            <Image src={image} alt={robot.name ?? 'Robot'} width={64} height={64} />
                                        ) : (
                                            <FaRobot className="h-8 w-8 text-orange-500" />
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold text-white">{robot.name}</h3>
                                    <p className="text-sm text-slate-300">{robot.short_description}</p>
                                </div>
                            </div>
                        </div>
                    )}
                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <div className="mb-2 flex items-center justify-start gap-3">
                                <label htmlFor="nickname" className="block text-sm font-medium text-slate-300">
                                    Robot Nickname
                                </label>
                                {!!existingRobot && <div className="text-2xs text-orange-400">Nickname is already taken</div>}
                            </div>
                            <input
                                type="text"
                                id="nickname"
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                placeholder="Enter robot nickname..."
                                className="bg-slate-750 w-full rounded-lg border border-slate-600 px-4 py-3 text-white placeholder-slate-400 transition-colors duration-200 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/30 focus:outline-none"
                                required
                                disabled={isSubmitting}
                                maxLength={50}
                            />
                            <p className="mt-1 text-xs text-slate-400">{nickname.length}/50 characters</p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={isSubmitting}
                                className="flex-1 cursor-pointer rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-sm font-medium text-slate-300 transition-colors duration-200 hover:bg-slate-600 hover:text-white focus:ring-2 focus:ring-orange-500/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={!nickname.trim() || isSubmitting || !!existingRobot}
                                data-tooltip-id="add-robot-tooltip"
                                data-tooltip-content={
                                    !!existingRobot
                                        ? 'This nickname is already used by another one of your robots, please choose a different one'
                                        : ''
                                }
                                className={clsx(
                                    'flex-1 rounded-lg px-4 py-3 text-sm font-medium text-white transition-all duration-300 focus:outline-none',
                                    !!existingRobot
                                        ? 'bg-gray-500 text-gray-300 opacity-50'
                                        : 'cursor-pointer bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 focus:ring-2 focus:ring-orange-500/20'
                                )}
                            >
                                {isSubmitting ? (
                                    <span className="flex items-center justify-center">
                                        <span className="mr-2 animate-spin">⌛</span>
                                        Adding...
                                    </span>
                                ) : (
                                    'Add Robot'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </GeneralModal>

            {/* Tooltip for Add Robot button - rendered outside modal */}
            <Tooltip
                id="add-robot-tooltip"
                place="top"
                className="custom-tooltip !z-[1000] !max-w-xs !rounded-lg !border-2 !border-slate-600 !bg-slate-700 !px-3 !py-2 !text-sm !break-words !whitespace-pre-wrap !text-slate-100"
                border="2px solid #475569"
                arrowColor="#334155"
                classNameArrow="!shadow-none"
            />
        </>
    );
};
