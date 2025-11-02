import { DEFAULT_AIMODEL_BACK_BUTTON_URL, setAIModelBackButton, useGetAIModelBackButton } from '@/hooks/Components/Back/back-button.hook';
import Link from 'next/link';
import { FaArrowLeft, FaBrain, FaPlay, FaChartBar } from 'react-icons/fa';

export const AIModelNavbar = ({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (tab: string) => void }) => {
    let { data: backButtonURL }: any = useGetAIModelBackButton();
    if (!backButtonURL) {
        backButtonURL = DEFAULT_AIMODEL_BACK_BUTTON_URL;
    }

    return (
        <div className="bg-slate-825 border-b border-slate-700">
            <div className="mx-auto flex max-w-7xl items-center px-6 py-3">
                <Link
                    href={backButtonURL}
                    onClick={() => setAIModelBackButton(DEFAULT_AIMODEL_BACK_BUTTON_URL)}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-700/50 px-3 py-2 text-sm font-medium text-slate-300 transition-all duration-200 hover:bg-slate-700/75 hover:text-white hover:shadow-md"
                >
                    <FaArrowLeft className="h-3.5 w-3.5" />
                    Back
                </Link>

                <div className="mx-6 h-8 w-px bg-slate-600/50" />

                <div className="flex space-x-8">
                    {[
                        { id: 'overview', label: 'Overview', icon: FaBrain },
                        { id: 'evaluate', label: 'Evaluate', icon: FaPlay },
                    ].map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex cursor-pointer items-center gap-2 border-b-2 px-1 py-4 font-medium transition-all duration-200 ${
                                    activeTab === tab.id
                                        ? 'border-blue-500 text-blue-400'
                                        : 'border-transparent text-slate-400 hover:border-slate-600 hover:text-slate-300'
                                }`}
                            >
                                <Icon className="text-sm" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
