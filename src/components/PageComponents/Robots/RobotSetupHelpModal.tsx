'use client';

import { GeneralModal } from '@/components/Elements/Modals/GeneralModal';
import { FaCheckCircle, FaCompass, FaGamepad, FaNetworkWired } from 'react-icons/fa';

type RobotSetupHelpModalProps = {
    isOpen: boolean;
    onClose: () => void;
};

const STEPS = [
    {
        title: 'Discover or add the robot',
        description: 'Use Discover to look for Sourccey robots on your LAN, or add one manually with its local IP address.',
        icon: FaCompass,
    },
    {
        title: 'Review the robot config',
        description: 'Open Manage Robot and confirm the host plus left and right arm ports. You only need to set this up once.',
        icon: FaNetworkWired,
    },
    {
        title: 'Run calibration',
        description: 'Use the calibration section before teleoperation so movement stays accurate and safe for the operator.',
        icon: FaCheckCircle,
    },
    {
        title: 'Start teleoperation',
        description: 'Once the checklist is green, open Teleoperate and start controlling the robot from this desktop.',
        icon: FaGamepad,
    },
];

export const RobotSetupHelpModal = ({ isOpen, onClose }: RobotSetupHelpModalProps) => (
    <GeneralModal isOpen={isOpen} onClose={onClose} title="How Desktop Robot Setup Works" size="md">
        <div className="max-h-[70vh] overflow-y-auto pr-2">
            <div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4 text-sm text-slate-300">
                Desktop robot setup is LAN-only right now. Cloud pairing still lives on the kiosk, so this desktop connects directly to
                robots already on your local network.
            </div>

            <div className="mt-4 grid gap-3">
                {STEPS.map(({ title, description, icon: Icon }, index) => (
                    <div key={title} className="flex gap-4 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-200">
                            <Icon className="h-4 w-4" />
                        </div>
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Step {index + 1}</div>
                            <div className="mt-1 text-base font-semibold text-white">{title}</div>
                            <p className="mt-1 text-sm text-slate-300">{description}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-50">
                If Discover does not find the robot, you can still add it manually with the robot&apos;s LAN IP address.
            </div>
        </div>
    </GeneralModal>
);
