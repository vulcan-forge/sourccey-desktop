export interface LoginInput {
    email: string;
    password?: string;
    provider: number;
    providerId?: string;
    providerAccessToken?: string;
    providerIdToken?: string;
    recaptcha?: string;
}
