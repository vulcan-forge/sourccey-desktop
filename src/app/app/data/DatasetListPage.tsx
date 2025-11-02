'use client';

import { DatasetOverview } from '@/components/Elements/AI/Datasets/DatasetOverview';
import { Datasets } from '@/components/Elements/AI/Datasets/Datasets';
import { Spinner } from '@/components/Elements/Spinner';
import { setSelectedDatasets, useGetAllDatasets, useGetSelectedDatasets } from '@/hooks/Components/AI/Dataset/dataset.hook';
import { useEffect, useMemo } from 'react';

export const DatasetListPage = () => {
    const pageSize = 30;
    const { data, fetchNextPage, hasNextPage, isLoading, error }: any = useGetAllDatasets(pageSize);

    const allDatasets = useMemo(() => {
        return data?.pages.flatMap((page: any) => page.data) || [];
    }, [data?.pages]);

    const totalCount = data?.pages[0]?.total || 0;
    const currentPage = data?.pages[data.pages.length - 1]?.page || 1;
    const totalPages = data?.pages[0]?.total_pages || 0;

    const { data: selectedDatasets = [], isLoading: isLoadingSelectedDatasets }: any = useGetSelectedDatasets();
    const dataset = selectedDatasets.length > 0 ? selectedDatasets[0] : null;

    useEffect(() => {
        if (!!allDatasets && allDatasets.length > 0 && !isLoading) {
            setSelectedDatasets([allDatasets[0]]);
        }
    }, [allDatasets, isLoading]);

    return (
        <>
            {isLoading ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-6">
                    <Spinner color="blue" />
                </div>
            ) : (
                <div className="flex flex-col gap-6 p-6">
                    <DatasetOverview dataset={dataset} isLoading={isLoadingSelectedDatasets} />
                    <Datasets
                        datasets={allDatasets}
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
