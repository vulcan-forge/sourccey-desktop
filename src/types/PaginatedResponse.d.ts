export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
    has_next: boolean;
    has_previous: boolean;
}

export interface PaginationParameters {
    page?: number;
    page_size?: number;
}
