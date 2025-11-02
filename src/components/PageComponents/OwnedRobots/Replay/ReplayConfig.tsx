import { setReplayConfig, useGetReplayConfig } from '@/hooks/Components/OwnedRobots/config.hook';
import { FaPlay } from 'react-icons/fa';
import type { CameraConfig } from '../Teleop/TeleopAction';

export const ReplayConfig = ({ ownedRobot }: { ownedRobot: any }) => {
    const nickname = ownedRobot?.nickname ?? '';
    const { data: config }: any = useGetReplayConfig(nickname as string);

    const handleConfigChange = (field: keyof ReplayDatasetConfig, value: string | number) => {
        setReplayConfig(nickname as string, { ...config, [field]: value });
    };

    return (
        <div className="rounded-lg border-2 border-slate-700 bg-slate-800 p-4 backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-2">
                <FaPlay className="h-4 w-4 text-slate-400" />
                <h2 className="text-lg font-semibold text-white">Replay Configuration</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Dataset</label>
                    <input
                        type="text"
                        value={config?.dataset ?? 'dataset'}
                        onChange={(e) => handleConfigChange('dataset', e.target.value)}
                        className="border-slate-625 bg-slate-725 w-full rounded border px-2 py-1 text-sm text-white placeholder-slate-400 transition-all duration-200 focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                        placeholder="dataset"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Episode</label>
                    <input
                        type="number"
                        min="0"
                        value={config?.episode_number ?? 1}
                        onChange={(e) => handleConfigChange('episode_number', parseInt(e.target.value) || 1)}
                        className="border-slate-625 bg-slate-725 w-full rounded border px-2 py-1 text-sm text-white placeholder-slate-400 transition-all duration-200 focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                        placeholder="1"
                    />
                </div>
            </div>
        </div>
    );
};

export interface ReplayConfig {
    nickname: string;
    robot_port: string;
    camera_config: CameraConfig;
    dataset: ReplayDatasetConfig;
}

export interface ReplayDatasetConfig {
    dataset: string;
    episode_number: number;
}
