declare global {
    interface Window {
        grecaptcha?: {
            ready: (callback: () => void) => void;
            execute: (siteKey: string, options: { action: string }) => Promise<string>;
        };
    }
}

let recaptchaLoader: Promise<void> | null = null;

export const getReCaptchaSiteKey = (): string | null => {
    return process.env.NEXT_PUBLIC_GOOGLE_V3_RECAPTCHA_SITE_KEY ?? null;
};

const loadReCaptcha = async (): Promise<void> => {
    if (recaptchaLoader) return recaptchaLoader;

    const siteKey = getReCaptchaSiteKey();
    if (!siteKey || typeof window === 'undefined') return;
    if (window.grecaptcha) return;

    recaptchaLoader = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load reCAPTCHA.'));
        document.head.appendChild(script);
    });

    return recaptchaLoader;
};

export const getReCaptchaToken = async (action: string): Promise<string | null> => {
    const siteKey = getReCaptchaSiteKey();
    if (!siteKey || typeof window === 'undefined') return null;

    try {
        await loadReCaptcha();
        if (!window.grecaptcha) return null;

        return await new Promise<string | null>((resolve) => {
            window.grecaptcha?.ready(async () => {
                try {
                    const token = await window.grecaptcha?.execute(siteKey, { action });
                    resolve(token ?? null);
                } catch {
                    resolve(null);
                }
            });
        });
    } catch {
        return null;
    }
};
