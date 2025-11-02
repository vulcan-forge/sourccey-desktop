'use client';

import { DatasetListPage } from '@/app/app/data/DatasetListPage';
import { useDatasetQueryRouter } from '@/hooks/Router/Dataset/dataset.query';
import { DatasetDetailPage } from '@/app/app/data/DatasetDetailPage';

export default function DataPage() {
    const { nickname, dataset }: any = useDatasetQueryRouter();
    return nickname && dataset ? <DatasetDetailPage nickname={nickname} dataset={dataset} /> : <DatasetListPage />;
}
