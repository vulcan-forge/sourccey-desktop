'use client';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { HiHome } from 'react-icons/hi';
import { FaMicrochip, FaQuestion, FaRobot } from 'react-icons/fa';
import Link from 'next/link';

export const SideNavbar = () => {
    const pathname = usePathname();
    const router = useRouter();

    const mainNavItems = [
        {
            href: '/desktop',
            label: 'Home',
            icon: HiHome,
            navigationMethod: 'router', // router as links are broken on the sidebar for some reason
        },
        {
            href: '/desktop/robot',
            label: 'Robots',
            icon: FaRobot,
            navigationMethod: 'router',
        },
        {
            href: '/desktop/models',
            label: 'AI Models',
            icon: FaMicrochip,
            navigationMethod: 'router',
        },
    ];
    const bottomNavItems: any = [];
    const normalizePath = (value: string) => value.replace(/\/+$/, '') || '/';
    const normalizedPathname = normalizePath(pathname);

    const isActive = (href: string) => {
        const normalizedHref = normalizePath(href);
        // Home should only match exactly; other tabs match nested paths too.
        if (normalizedHref === '/desktop') {
            return normalizedPathname === normalizedHref;
        }

        return normalizedPathname === normalizedHref || normalizedPathname.startsWith(`${normalizedHref}/`);
    };

    const renderNavItem = (item: any) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        const className = `flex items-center gap-4 px-6 py-4 text-base font-medium transition-all duration-200 ${
            active
                ? 'bg-gradient-to-r from-red-400/50 via-orange-400/50 to-yellow-400/50 text-white shadow-lg'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
        }`;

        if (item.navigationMethod === 'router') {
            return (
                <button
                    key={item.href}
                    type="button"
                    onClick={() => {
                        router.push(item.href);
                    }}
                    className={`${className} w-full cursor-pointer text-left`}
                >
                    <Icon className="h-6 w-6 transition-transform duration-300" />
                    <span className="transition-all duration-200">{item.label}</span>
                </button>
            );
        }

        return (
            <Link key={item.href} href={item.href} className={className}>
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
