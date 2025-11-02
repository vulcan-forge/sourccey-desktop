import { AIModelDetailsPanel } from '@/components/Elements/AI/AIModels/AIModelDetailsPanel';
import { AIModels } from '@/components/Elements/AI/AIModels/AIModels';
import { useGetAIModels } from '@/hooks/Components/AI/AIModels/ai-model.hook';
import { useEffect, useState, useMemo } from 'react';

export const AIModelsContainer = ({ ownedRobot }: { ownedRobot: any }) => {
    const nickName = ownedRobot?.nickname || '';
    const pageSize = 30;
    const { data, fetchNextPage, hasNextPage, isLoading, error }: any = useGetAIModels(nickName, pageSize);

    const models = useMemo(() => {
        return data?.pages.flatMap((page: any) => page.data) || [];
    }, [data?.pages]);
    const totalCount = data?.pages[0]?.total || 0;
    const currentPage = data?.pages[data.pages.length - 1]?.page || 1;
    const totalPages = data?.pages[0]?.total_pages || 0;

    // State for the selected model
    const [selectedModel, setSelectedModel] = useState<any | null>(null);
    useEffect(() => {
        if (!selectedModel && models.length > 0) {
            setSelectedModel(models[0]);
        }
    }, [models, selectedModel]);

    if (!ownedRobot) return <></>;
    return (
        <>
            <div className="flex flex-col p-6">
                {selectedModel && <AIModelDetailsPanel model={selectedModel} />}
                <AIModels
                    models={models}
                    isLoading={isLoading}
                    fetchNextPage={fetchNextPage}
                    hasNextPage={hasNextPage}
                    totalCount={totalCount}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    nickname={null}
                    error={error}
                />
            </div>
        </>
    );
};
