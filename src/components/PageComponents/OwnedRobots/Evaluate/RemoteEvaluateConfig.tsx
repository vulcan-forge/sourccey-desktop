import { setRemoteEvaluateConfig, useGetRemoteEvaluateConfig } from '@/hooks/Components/OwnedRobots/remote-config.hook';
import { FaBrain } from 'react-icons/fa';

export const RemoteEvaluateConfig = ({ ownedRobot }: { ownedRobot: any }) => {
    const nickname = ownedRobot?.nickname ?? '';
    const { data: config }: any = useGetRemoteEvaluateConfig(nickname as string);

    const handleConfigChange = (field: keyof RemoteEvaluateDatasetConfig, value: string | number) => {
        setRemoteEvaluateConfig(nickname as string, { ...config, [field]: value });
    };

    return (
        <div className="rounded-lg border-2 border-slate-700 bg-slate-800 p-4 backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-2">
                <FaBrain className="h-4 w-4 text-slate-400" />
                <h2 className="text-lg font-semibold text-white">Evaluation Configuration</h2>
            </div>

            <div className="grid grid-cols-3 gap-4">
                {/* Dataset */}

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
                        value={config?.task ?? 'Wave your hand'}
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
                        onChange={(e) => handleConfigChange('num_episodes', parseInt(e.target.value) || 1)}
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
                        max="300"
                        value={config?.reset_time_s ?? 1}
                        onChange={(e) => handleConfigChange('reset_time_s', parseInt(e.target.value) || 1)}
                        className="border-slate-625 bg-slate-725 w-full rounded border px-2 py-1 text-sm text-white placeholder-slate-400 transition-all duration-200 focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                        placeholder="1"
                    />
                </div>

                {/* Policy Path - Additional field for evaluation */}
                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Model Name</label>
                    <input
                        type="text"
                        value={config?.model_name ?? ''}
                        onChange={(e) => handleConfigChange('model_name', e.target.value)}
                        className="border-slate-625 bg-slate-725 w-full rounded border px-2 py-1 text-sm text-white placeholder-slate-400 transition-all duration-200 focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                        placeholder="model_name"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-xs font-medium text-slate-300">Model Steps</label>
                    <input
                        type="number"
                        value={config?.model_steps ?? 10000}
                        onChange={(e) => handleConfigChange('model_steps', parseInt(e.target.value) || 10000)}
                        className="border-slate-625 bg-slate-725 w-full rounded border px-2 py-1 text-sm text-white placeholder-slate-400 transition-all duration-200 focus:ring-1 focus:ring-yellow-500 focus:outline-none"
                        placeholder="10000"
                    />
                </div>
            </div>
        </div>
    );
};

export interface RemoteEvaluateConfig {
    nickname: string;
    remote_ip: string;
    model_name: string;
    model_repo_id?: string;
    model_path?: string;
    model_steps: number;
    dataset: RemoteEvaluateDatasetConfig;
}

export interface RemoteEvaluateDatasetConfig {
    dataset: string;
    num_episodes: number;
    episode_time_s: number;
    reset_time_s: number;
    task: string;
    fps: number;
    model_name: string;
    model_steps: number;
}
