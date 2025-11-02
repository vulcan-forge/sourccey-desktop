'use client';

import { AIModelOverview } from '@/components/Elements/AI/AIModels/AIModelOverview';
import { AIModels } from '@/components/Elements/AI/AIModels/AIModels';
import { Spinner } from '@/components/Elements/Spinner';
import { setSelectedAIModel, useGetAllAIModels, useGetSelectedAIModel } from '@/hooks/Components/AI/AIModels/ai-model.hook';
import { useEffect, useMemo } from 'react';

export const AIModelsListPage = () => {
    const pageSize = 30;
    const { data, fetchNextPage, hasNextPage, isLoading, error }: any = useGetAllAIModels(pageSize);

    const allModels = useMemo(() => {
        return data?.pages.flatMap((page: any) => page.data) || [];
    }, [data?.pages]);

    const totalCount = data?.pages[0]?.total || 0;
    const currentPage = data?.pages[data.pages.length - 1]?.page || 1;
    const totalPages = data?.pages[0]?.total_pages || 0;

    const { data: selectedModel, isLoading: isLoadingSelectedModel }: any = useGetSelectedAIModel();

    useEffect(() => {
        if (!!allModels && allModels.length > 0 && !isLoading) {
            setSelectedAIModel(allModels[0]);
        }
    }, [allModels, isLoading]);

    return (
        <>
            {isLoading ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
                    <Spinner color="green" />
                </div>
            ) : (
                <div className="flex flex-col gap-6 p-6">
                    <AIModelOverview model={selectedModel} isLoading={isLoadingSelectedModel} />
                    <AIModels
                        models={allModels}
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
            )}
        </>
    );
};
