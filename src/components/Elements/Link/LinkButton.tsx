import { useRouter } from 'next/navigation';

// We need this link button because <Link> for some reason doesn't work in tauri production builds
export const LinkButton = ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => {
    const router = useRouter();
    return (
        <button type="button" onClick={() => router.push(href)} className={className}>
            {children}
        </button>
    );
};
