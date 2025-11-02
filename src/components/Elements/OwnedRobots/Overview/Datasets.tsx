import { DatasetsRaw } from '@/components/Elements/AI/Datasets/Datasets';
import { useGetDatasets } from '@/hooks/Components/AI/Dataset/dataset.hook';

interface DatasetsProps {
    nickname: string;
}

export const DatasetsOverview = ({ nickname }: DatasetsProps) => {
    const pageSize = 30;
    const { data, fetchNextPage, hasNextPage, isLoading, error }: any = useGetDatasets(nickname, pageSize);

    // Flatten all pages into a single array
    const allDatasets = data?.pages.flatMap((page: any) => page.data) || [];

    // Get total count from the first page
    const totalCount = data?.pages[0]?.total || 0;
    const currentPage = data?.pages[data.pages.length - 1]?.page || 1;
    const totalPages = data?.pages[0]?.total_pages || 0;

    return (
        <DatasetsRaw
            datasets={allDatasets}
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
