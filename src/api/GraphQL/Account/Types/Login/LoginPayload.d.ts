import { SourceyError } from '@/types/SourceyError';

export interface LoginPayload {
    account?: any;
    created: boolean;
    error?: SourceyError;
}
