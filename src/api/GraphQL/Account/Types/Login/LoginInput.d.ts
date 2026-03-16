export interface LoginInput {
    email: string;
    password?: string;
    provider: number;
    providerId?: string;
    recaptcha?: string;
}
