'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { GeneralModal } from '@/components/Elements/Modals/GeneralModal';
import { Spinner } from '@/components/Elements/Spinner';
import { toastErrorDefaults, toastSuccessDefaults } from '@/utils/toast/toast-utils';
import { getLanRobotValidationErrors, normalizeLanRobotDraft, type LanRobotDraft } from '@/utils/robots/lan-robot';
import { saveLanRobotDraft } from '@/utils/robots/save-lan-robot';

type AddLanRobotModalProps = {
    existingNicknames: string[];
    initialDraft?: Partial<LanRobotDraft> | null;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (ownedRobotId: string) => void;
};

const DEFAULT_DRAFT: LanRobotDraft = {
    nickname: 'sourccey-001',
    host: '',
    leftArmPort: 'COM3',
    rightArmPort: 'COM8',
};

export const AddLanRobotModal = ({ existingNicknames, initialDraft, isOpen, onClose, onSuccess }: AddLanRobotModalProps) => {
    const [draft, setDraft] = useState<LanRobotDraft>(DEFAULT_DRAFT);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setDraft(DEFAULT_DRAFT);
            return;
        }

        setDraft({
            ...DEFAULT_DRAFT,
            ...(initialDraft ?? {}),
        });
    }, [initialDraft, isOpen]);

    const validationErrors = useMemo(() => getLanRobotValidationErrors(draft, existingNicknames), [draft, existingNicknames]);

    const updateDraft = (key: keyof LanRobotDraft, value: string) => {
        setDraft((current) => ({
            ...current,
            [key]: value,
        }));
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const errors = getLanRobotValidationErrors(draft, existingNicknames);
        if (errors.length > 0) {
            toast.error(errors[0], { ...toastErrorDefaults });
            return;
        }

        setIsSubmitting(true);
        const normalized = normalizeLanRobotDraft(draft);

        try {
            const ownedRobotId = await saveLanRobotDraft(normalized);

            toast.success('LAN robot added. You can teleoperate it from this desktop now.', {
                ...toastSuccessDefaults,
            });
            onClose();
            onSuccess(ownedRobotId);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to add LAN robot.';
            toast.error(message, { ...toastErrorDefaults });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <GeneralModal isOpen={isOpen} onClose={() => !isSubmitting && onClose()} title="Add LAN Robot" size="md">
            <div className="rounded-lg border border-slate-700/70 bg-slate-900/60 p-4 text-sm text-slate-300">
                Add a robot directly on this desktop for LAN teleoperation. Cloud pairing stays on the kiosk for now.
            </div>
            {initialDraft?.host ? (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                    Discovery found <span className="font-semibold">{initialDraft.host}</span>. Review the nickname and ports, then save it
                    to this desktop.
                </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm text-slate-200 md:col-span-2">
                        Robot Nickname
                        <input
                            value={draft.nickname}
                            onChange={(event) => updateDraft('nickname', event.target.value)}
                            disabled={isSubmitting}
                            placeholder="sourccey-001"
                            className="rounded-lg border border-slate-600/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30 focus:outline-none"
                        />
                    </label>

                    <label className="flex flex-col gap-1 text-sm text-slate-200 md:col-span-2">
                        Robot Host or LAN IP
                        <input
                            value={draft.host}
                            onChange={(event) => updateDraft('host', event.target.value)}
                            disabled={isSubmitting}
                            placeholder="192.168.1.50"
                            className="rounded-lg border border-slate-600/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30 focus:outline-none"
                        />
                    </label>

                    <label className="flex flex-col gap-1 text-sm text-slate-200">
                        Left Arm Port
                        <input
                            value={draft.leftArmPort}
                            onChange={(event) => updateDraft('leftArmPort', event.target.value)}
                            disabled={isSubmitting}
                            className="rounded-lg border border-slate-600/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30 focus:outline-none"
                        />
                    </label>

                    <label className="flex flex-col gap-1 text-sm text-slate-200">
                        Right Arm Port
                        <input
                            value={draft.rightArmPort}
                            onChange={(event) => updateDraft('rightArmPort', event.target.value)}
                            disabled={isSubmitting}
                            className="rounded-lg border border-slate-600/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30 focus:outline-none"
                        />
                    </label>
                </div>

                <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-3 text-xs text-slate-400">
                    Robot model: <span className="font-semibold text-slate-200">Sourccey</span>
                    <div className="mt-1">You can change ports and advanced teleop settings later from the robot Config page.</div>
                </div>

                {validationErrors.length > 0 && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                        {validationErrors[0]}
                    </div>
                )}

                <div className="flex gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="flex-1 cursor-pointer rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-3 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting || validationErrors.length > 0}
                        className="flex-1 cursor-pointer rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-sm font-semibold text-white transition hover:from-orange-500/90 hover:to-amber-500/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isSubmitting ? (
                            <span className="flex items-center justify-center gap-2">
                                <Spinner color="white" width="w-4" height="h-4" />
                                Adding...
                            </span>
                        ) : (
                            'Add LAN Robot'
                        )}
                    </button>
                </div>
            </form>
        </GeneralModal>
    );
};
