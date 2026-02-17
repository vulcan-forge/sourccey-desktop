'use client';
import { usePathname } from 'next/navigation';
import { HiHome } from 'react-icons/hi';
import { FaBrain, FaRobot, FaCog, FaTools } from 'react-icons/fa';
import Link from 'next/link';
import { useAppMode } from '@/hooks/Components/useAppMode.hook';

export const SideNavbar = () => {
    const pathname = usePathname();
    const { isKioskMode } = useAppMode();

    const allNavItems = [
        {
            href: '/desktop',
            label: 'Home',
            icon: HiHome,
        },
        {
            href: '/desktop/robots',
            label: 'Robots',
            icon: FaRobot,
        },
        {
            href: '/desktop/models',
            label: 'AI Models',
            icon: FaBrain,
        },
        {
            href: '/desktop/robot-remote',
            label: 'Calibration',
            icon: FaTools,
        },
    ];

    // Filter nav items based on kiosk mode
    const mainNavItems = isKioskMode
        ? allNavItems.filter((item) => item.href === '/app' || item.href === '/app/models' || item.href === '/app/robot-remote')
        : allNavItems;

    const bottomNavItems: any = isKioskMode
        ? [
              {
                  href: '/app/settings-kiosk',
                  label: 'Settings',
                  icon: FaCog,
              },
          ]
        : [];

    const isActive = (href: string) => {
        // Special case for home page
        if (href === '/app') {
            return pathname === '/app';
        }

        // For other pages, check if the current pathname starts with the href
        return pathname.startsWith(href);
    };

    const renderNavItem = (item: any) => {
        const Icon = item.icon;
        const active = isActive(item.href);

        return (
            <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-4 px-6 py-4 text-base font-medium transition-all duration-200 ${
                    active
                        ? 'bg-gradient-to-r from-red-400/50 via-orange-400/50 to-yellow-400/50 text-white shadow-lg'
                        : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                }`}
            >
                <Icon className={`h-6 w-6 transition-transform duration-300`} />
                <span className="transition-all duration-200">{item.label}</span>
            </Link>
        );
    };

    return (
        <>
            <div className="flex h-full w-64 flex-col border-r border-slate-700/50 bg-slate-800 shadow-lg backdrop-blur-sm">
                <nav className="flex h-full w-full flex-col">
                    {/* Main navigation items */}
                    <div className="flex-1">{mainNavItems.map(renderNavItem)}</div>

                    {/* Bottom navigation items */}
                    <div className="mt-auto">{bottomNavItems.map(renderNavItem)}</div>
                </nav>
            </div>
        </>
    );
};
