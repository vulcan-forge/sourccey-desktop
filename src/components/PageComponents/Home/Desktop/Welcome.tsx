import { useGetOwnedRobots } from '@/hooks/Models/OwnedRobot/owned-robot.hook';
import { useGetCalibrationModifiedAt } from '@/hooks/Control/config.hook';
import { useSelectedModel } from '@/hooks/Model/selected-model.hook';
import { useSelectedRobot } from '@/hooks/Robot/selected-robot.hook';
import { FaBrain, FaRobot, FaTools } from 'react-icons/fa';

export const HomeWelcome = () => {
    const { data: ownedRobots, isLoading: isLoadingOwnedRobots }: any = useGetOwnedRobots(true);

    return (
        <div className="flex flex-col gap-4 rounded-xl border-2 border-slate-700 bg-slate-800 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-white">Welcome back!</h2>
                    <p className="mt-2 text-slate-300">Here&apos;s what&apos;s happening with your robots today.</p>
                </div>
                <div className="text-right">
                    <div className="text-sm text-slate-400">Total Robots</div>
                    <div className="text-3xl font-bold text-white">
                        {isLoadingOwnedRobots ? '...' : ownedRobots?.length || 0}
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <HomeQuickLinks />
        </div>
    );
};

export const HomeQuickLinks = () => {
    const { data: selectedRobot } = useSelectedRobot();
    const { data: selectedModel } = useSelectedModel();

    const nickname = selectedRobot?.nickname || '';
    const robotType = selectedRobot?.robotType || '';
    const followerType = robotType ? `${robotType}_follower` : '';
    const leftArmNickname = nickname ? `${nickname}_left` : '';
    const rightArmNickname = nickname ? `${nickname}_right` : '';

    const { data: baseCalibrationModifiedAt } = useGetCalibrationModifiedAt(robotType, nickname, !!robotType && !!nickname);
    const { data: leftCalibrationModifiedAt } = useGetCalibrationModifiedAt(
        followerType,
        leftArmNickname,
        !!followerType && !!leftArmNickname
    );
    const { data: rightCalibrationModifiedAt } = useGetCalibrationModifiedAt(
        followerType,
        rightArmNickname,
        !!followerType && !!rightArmNickname
    );

    const modifiedCandidates = [baseCalibrationModifiedAt, leftCalibrationModifiedAt, rightCalibrationModifiedAt].filter(
        (value): value is number => typeof value === 'number'
    );
    const latestCalibrationModifiedAt = modifiedCandidates.length > 0 ? Math.max(...modifiedCandidates) : null;

    const calibrationDateText = latestCalibrationModifiedAt
        ? new Date(latestCalibrationModifiedAt).toLocaleString()
        : selectedRobot
          ? 'No calibration file yet'
          : 'Select a robot first';

    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-center space-x-3 rounded-lg bg-orange-500/10 p-4">
                <div className="rounded-lg bg-orange-500/20 p-2">
                    <FaRobot className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                    <div className="font-medium text-white">Selected Robot Type</div>
                    <div className="text-sm text-slate-400">{selectedRobot?.robotType || 'None selected'}</div>
                </div>
            </div>

            <div className="flex items-center space-x-3 rounded-lg bg-gradient-to-r from-blue-500/10 to-blue-600/10 p-4">
                <div className="rounded-lg bg-blue-500/20 p-2">
                    <FaBrain className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                    <div className="font-medium text-white">Selected AI Model</div>
                    <div className="text-sm text-slate-400">{selectedModel?.name || 'None selected'}</div>
                </div>
            </div>

            <div className="flex items-center space-x-3 rounded-lg bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 p-4">
                <div className="rounded-lg bg-yellow-500/20 p-2">
                    <FaTools className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                    <div className="font-medium text-white">Calibration Modified</div>
                    <div className="text-sm text-slate-400">{calibrationDateText}</div>
                </div>
            </div>
        </div>
    );
};
