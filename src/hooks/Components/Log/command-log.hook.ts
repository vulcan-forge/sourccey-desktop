import { getCommandLogsPaginated } from '@/api/Local/Log/command-logs';
import type { CommandLog, CommandLogFilters } from '@/types/Models/command-log';
import type { PaginatedResponse, PaginationParameters } from '@/types/PaginatedResponse';
import { useInfiniteQuery } from '@tanstack/react-query';

export const BASE_COMMAND_LOG_KEY = 'command-logs';

export const useGetCommandLogs = (pageSize: number = 30, filters: CommandLogFilters = {}, enabled = true) =>
    useInfiniteQuery({
        queryKey: [BASE_COMMAND_LOG_KEY, 'infinite', pageSize, filters],
        queryFn: async ({ pageParam }) => {
            if (!enabled) return null;

            const page = pageParam || 1;

            const pagination: PaginationParameters = {
                page,
                page_size: pageSize,
            };

            return await getCommandLogsPaginated(filters, pagination);
        },
        initialPageParam: 1,
        getNextPageParam: (lastPage: PaginatedResponse<CommandLog> | null) => {
            if (!lastPage || !lastPage.has_next) {
                return undefined;
            }
            return lastPage.page + 1;
        },
        refetchOnWindowFocus: false,
        enabled,
    });
