import { setRemoteRecordConfig, useGetRemoteRecordConfig } from '@/hooks/Components/OwnedRobots/remote-config.hook';
import { FaVideo } from 'react-icons/fa';

export const RemoteRecordConfig = ({ ownedRobot }: { ownedRobot: any }) => {
    const nickname = ownedRobot?.nickname ?? '';
    const { data: config }: any = useGetRemoteRecordConfig(nickname as string);

    const handleConfigChange = (field: keyof RemoteRecordDatasetConfig, value: string | number) => {
        setRemoteRecordConfig(nickname as string, { ...config, [field]: value });
    };

    return (
        <div className="rounded-lg border-2 border-slate-700 bg-slate-800 p-4 backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-2">
                <FaVideo className="h-4 w-4 text-slate-400" />
                <h2 className="text-lg font-semibold text-white">Recording Configuration</h2>
            </div>

            <div className="grid grid-cols-3 gap-4">
                {/* Dataset Name */}
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

                {/* Task */}
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Task</label>
                    <input
                        type="text"
                        value={config?.task ?? 'Grab the towel and fold it'}
                        onChange={(e) => handleConfigChange('task', e.target.value)}
                        className="border-slate-625 bg-slate-725 w-full rounded border px-2 py-1 text-sm text-white placeholder-slate-400 transition-all duration-200 focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                        placeholder="Task description"
                    />
                </div>

                <div></div>

                {/* Number of Episodes */}
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Episodes</label>
                    <input
                        type="number"
                        min="1"
                        value={config?.num_episodes ?? 10}
                        onChange={(e) => handleConfigChange('num_episodes', parseInt(e.target.value) || 10)}
                        className="border-slate-625 bg-slate-725 w-full rounded border px-2 py-1 text-sm text-white placeholder-slate-400 transition-all duration-200 focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                        placeholder="10"
                    />
                </div>

                {/* Episode Time */}
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Episode Time (s)</label>
                    <input
                        type="number"
                        min="1"
                        max="300"
                        value={config?.episode_time_s ?? 30}
                        onChange={(e) => handleConfigChange('episode_time_s', parseInt(e.target.value) || 30)}
                        className="border-slate-625 bg-slate-725 w-full rounded border px-2 py-1 text-sm text-white placeholder-slate-400 transition-all duration-200 focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                        placeholder="30"
                    />
                </div>

                {/* Reset Time */}
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Reset Time (s)</label>
                    <input
                        type="number"
                        min="1"
                        max="60"
                        value={config?.reset_time_s ?? 1}
                        onChange={(e) => handleConfigChange('reset_time_s', parseInt(e.target.value) || 1)}
                        className="border-slate-625 bg-slate-725 w-full rounded border px-2 py-1 text-sm text-white placeholder-slate-400 transition-all duration-200 focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                        placeholder="1"
                    />
                </div>
            </div>
        </div>
    );
};

export interface RemoteRecordConfig {
    nickname: string;
    remote_ip: string;
    left_arm_port: string;
    right_arm_port: string;
    keyboard: string;
    dataset: RemoteRecordDatasetConfig;
}

export interface RemoteRecordDatasetConfig {
    dataset: string;
    num_episodes: number;
    episode_time_s: number;
    reset_time_s: number;
    task: string;
    fps: number;
}
