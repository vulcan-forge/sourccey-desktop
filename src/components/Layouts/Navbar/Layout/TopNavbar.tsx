import { useAppMode } from '@/hooks/Components/useAppMode.hook';
import { DesktopTopNavbar } from '@/components/Layouts/Navbar/Layout/Desktop/TopNavbar';
import { KioskTopNavbar } from '@/components/Layouts/Navbar/Layout/Kiosk/TopNavbar';

export const TopNavbar = ({ profile, isLoading }: { profile: any; isLoading: boolean }) => {
    const { isKioskMode } = useAppMode();
    if (isKioskMode) {
        return <KioskTopNavbar />;
    } else {
        return <DesktopTopNavbar profile={profile} isLoading={isLoading} />;
    }
};
