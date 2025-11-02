import { DatasetDetailsPanel } from '@/components/Elements/AI/Datasets/DatasetDetailsPanel';
import { Datasets } from '@/components/Elements/AI/Datasets/Datasets';
import { useGetDatasets } from '@/hooks/Components/AI/Dataset/dataset.hook';

export const DatasetContainer = ({ ownedRobot }: { ownedRobot: any }) => {
    const nickName = ownedRobot?.nickname || '';
    const pageSize = 30;
    const { data, fetchNextPage, hasNextPage, isLoading, error }: any = useGetDatasets(nickName, pageSize);

    const datasets = data?.pages.flatMap((page: any) => page.data) || [];
    const totalCount = data?.pages[0]?.total || 0;
    const currentPage = data?.pages[data.pages.length - 1]?.page || 1;
    const totalPages = data?.pages[0]?.total_pages || 0;

    if (!ownedRobot) return <></>;
    return (
        <>
            <div className="flex flex-col p-6">
                <DatasetDetailsPanel />
                <Datasets
                    datasets={datasets}
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
