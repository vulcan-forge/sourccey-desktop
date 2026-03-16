import type { APIError } from '@/api/Error';

export interface LoginPayload {
    account?: any;
    created: boolean;
    error?: APIError;
}
