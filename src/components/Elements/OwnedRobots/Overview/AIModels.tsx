import { useGetAIModels } from '@/hooks/Components/AI/AIModels/ai-model.hook';
import { AIModelsRaw } from '@/components/Elements/AI/AIModels/AIModels';

interface AIModelsProps {
    nickname: string;
}

export const AIModelsOverview = ({ nickname }: AIModelsProps) => {
    const pageSize = 30;
    const { data, fetchNextPage, hasNextPage, isLoading, error }: any = useGetAIModels(nickname, pageSize);
    // Flatten all pages into a single array
    const allModels = data?.pages.flatMap((page: any) => page.data) || [];

    // Get total count from the first page
    const totalCount = data?.pages[0]?.total || 0;
    const currentPage = data?.pages[data.pages.length - 1]?.page || 1;
    const totalPages = data?.pages[0]?.total_pages || 0;

    return (
        <AIModelsRaw
            models={allModels}
            isLoading={isLoading}
            fetchNextPage={fetchNextPage}
            hasNextPage={hasNextPage}
            totalCount={totalCount}
            currentPage={currentPage}
            totalPages={totalPages}
            nickname={nickname}
            error={error}
        />
    );
};
