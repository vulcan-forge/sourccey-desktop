'use client';

import type { CommandLog, CommandLogFilters } from '@/types/Models/command-log';
import { addCommandLog, getCommandLog } from '@/api/Local/Log/command-logs';
import { useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { useGetCommandLogs } from '@/hooks/Components/Log/command-log.hook';
import { CommandLogs } from '@/components/Elements/Log/CommandLogs';

export default function HistoryPage() {
    const pageSize = 30;
    const [filters, setFilters] = useState<CommandLogFilters>({
        status: '',
        robot_id: '',
        command: '',
    });

    const { data, fetchNextPage, hasNextPage, isLoading, error, refetch } = useGetCommandLogs(
        pageSize,
        {}, // Empty filters to get all logs
        true // enabled
    );
    console.log('data', data);

    const commands = data?.pages.flatMap((page: any) => page.data) || [];
    const totalCount = data?.pages[0]?.total || 0;
    const currentPage = data?.pages[data.pages.length - 1]?.page || 1;
    const totalPages = data?.pages[0]?.total_pages || 0;

    return (
        <div className="p-6">
            <CommandLogs
                commands={commands}
                isLoading={isLoading}
                fetchNextPage={fetchNextPage}
                hasNextPage={hasNextPage}
                totalCount={totalCount}
                currentPage={currentPage}
                totalPages={totalPages}
                error={error}
                filters={filters}
                setFilters={setFilters}
                sortBy={''}
                setSortBy={function (field: string): void {
                    throw new Error('Function not implemented.');
                }}
                sortOrder={'asc'}
                setSortOrder={function (order: 'asc' | 'desc'): void {
                    throw new Error('Function not implemented.');
                }}
            />
        </div>
    );
}
