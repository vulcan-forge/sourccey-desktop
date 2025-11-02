import { DEFAULT_DATASET_BACK_BUTTON_URL, setDataBackButton, useGetDataBackButton } from '@/hooks/Components/Back/back-button.hook';
import { setEpisodeSidebar } from '@/hooks/Components/Data/episode.hook';
import Link from 'next/link';
import { FaArrowLeft, FaChartBar, FaDatabase, FaPlus, FaVideo } from 'react-icons/fa';

export const DatasetNavbar = ({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (tab: string) => void }) => {
    let { data: backButtonURL }: any = useGetDataBackButton();
    if (!backButtonURL) {
        backButtonURL = DEFAULT_DATASET_BACK_BUTTON_URL;
    }

    return (
        <div className="bg-slate-825 border-b border-slate-700">
            <div className="mx-auto flex max-w-7xl items-center px-4">
                <Link
                    href={backButtonURL}
                    onClick={() => setDataBackButton(DEFAULT_DATASET_BACK_BUTTON_URL)}
                    className="hover:bg-slate-650 inline-flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition-all duration-200"
                >
                    <FaArrowLeft className="h-3.5 w-3.5" />
                    Back
                </Link>

                <div className="bg-slate-650 mx-4 h-8 w-px" />

                <div className="flex space-x-8">
                    {[
                        { id: 'overview', label: 'Overview', icon: FaChartBar },
                        // { id: 'data', label: 'Data Analysis', icon: FaDatabase },
                        // { id: 'videos', label: 'Video Analysis', icon: FaVideo },
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

                <div className="grow" />

                <button
                    onClick={() => setEpisodeSidebar(true)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition-all duration-200 hover:bg-slate-600 hover:text-white"
                >
                    <FaPlus className="h-3.5 w-3.5" />
                    Select Episode
                </button>
            </div>
        </div>
    );
};
