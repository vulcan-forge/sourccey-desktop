import Image from 'next/image';
import { Spinner } from '@/components/Elements/Spinner';

export const AppBootScreen = ({ message = 'Starting Vulcan Studio...' }: { message?: string }) => {
    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-900 px-6 text-white">
            <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-slate-700/80 bg-slate-850/95 px-8 py-10 text-center shadow-2xl shadow-black/30">
                <Image
                    src="/assets/logo/SourcceyLogo.png"
                    alt="Sourccey Logo"
                    width={88}
                    height={88}
                    className="drop-shadow-logo"
                    priority
                />
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold text-white">Vulcan Studio</h1>
                    <p className="text-sm text-slate-300">{message}</p>
                </div>
                <Spinner color="yellow" width="w-7" height="h-7" />
            </div>
        </div>
    );
};
