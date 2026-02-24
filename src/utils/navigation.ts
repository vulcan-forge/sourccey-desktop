type RouterLike = {
    push: (href: string) => void;
};

const isExternalHref = (href: string) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href) || /^[a-z][a-z0-9+.-]*:/i.test(href);

export const normalizeInternalHref = (href: string) => {
    if (!href.startsWith('/')) return href;
    const match = href.match(/^([^?#]*)(.*)$/);
    const path: any = match ? match[1] : href;
    const suffix = match ? match[2] : '';
    if (path === '/' || path.endsWith('/')) return href;
    return `${path}/${suffix}`;
};

export const safeNavigate = (router: RouterLike, href: string) => {
    if (!href) return;

    if (href.startsWith('#')) {
        if (typeof window !== 'undefined') {
            window.location.hash = href;
        }
        return;
    }

    if (isExternalHref(href)) {
        if (typeof window !== 'undefined') {
            window.location.assign(href);
        }
        return;
    }

    const target = normalizeInternalHref(href);

    if (typeof window === 'undefined') {
        router.push(target);
        return;
    }

    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current === target) {
        return;
    }

    router.push(target);

    window.setTimeout(() => {
        const now = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (now !== target) {
            window.location.assign(target);
        }
    }, 200);
};
