'use client';

import { useRouter } from 'next/navigation';
import { safeNavigate } from '@/utils/navigation';

// We need this link button because <Link> for some reason doesn't work in tauri production builds
export const LinkButton = ({
    href,
    className,
    children,
    tooltip,
}: {
    href: string;
    className?: string;
    children: React.ReactNode;
    tooltip?: string;
}) => {
    const router = useRouter();
    return (
        <button type="button" onClick={() => safeNavigate(router, href)} className={className} title={tooltip}>
            {children}
        </button>
    );
};
