import { getBatteryLevelStep } from '@/hooks/System/system-info.hook';
import { FaBatteryEmpty, FaBatteryFull, FaBatteryHalf, FaBatteryQuarter, FaBatteryThreeQuarters } from 'react-icons/fa';

export const BatteryLevelIcon = ({ percent, className }: { percent: number; className?: string }) => {
    const level = getBatteryLevelStep(percent);
    if (level === 100) return <FaBatteryFull className={className} />;
    if (level === 75) return <FaBatteryThreeQuarters className={className} />;
    if (level === 50) return <FaBatteryHalf className={className} />;
    if (level === 25) return <FaBatteryQuarter className={className} />;
    return <FaBatteryEmpty className={className} />;
};
