export interface LoginInput {
    email: string;
    password?: string | null;

    // Name Data
    name: string;
    image?: string | null;

    // Provider Data
    provider: int;
    providerId?: string | null;
}
