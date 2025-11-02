import { TrainingAction } from '@/components/PageComponents/OwnedRobots/Training/TrainingAction';
import { TrainingLogs } from '@/components/PageComponents/OwnedRobots/Training/TrainingLogs';

export const TrainingContainer = ({ repoDir }: { repoDir?: string | null }) => {
    return (
        <div className="bg-slate-850 flex w-full flex-col gap-8 p-6">
            <TrainingAction repoDir={repoDir} />
            <TrainingLogs />
        </div>
    );
};
