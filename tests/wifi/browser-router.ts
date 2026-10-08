export const usePathname = () => window.location.pathname;
export const useRouter = () => ({ push: (_href: string) => {} });
export const useSearchParams = () => new URLSearchParams(window.location.search);
