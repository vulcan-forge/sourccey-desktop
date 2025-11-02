// Neutral base for all toasts
const baseToast = {
    borderRadius: '8px',
    padding: '12px 14px',
    background: '#1a1c2d', // your preferred neutral
    color: '#ffffff',
    border: '3px solid #4a5565',
    boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
    cursor: 'pointer',
};

// Info toast
export const toastInfoDefaults = {
    autoClose: 3000,
    closeOnClick: true,
    style: {
        ...baseToast,
        border: '3px solid oklch(70% 0.15 240)',
    },
    progressStyle: { background: 'oklch(70% 0.15 240)' },
};

// Success toast
export const toastSuccessDefaults = {
    autoClose: 3000,
    closeOnClick: true,
    style: {
        ...baseToast,
        border: '3px solid oklch(70% 0.14 150)',
    },
    progressStyle: { background: 'oklch(70% 0.14 150)' },
};

// Error toast
export const toastErrorDefaults = {
    autoClose: 3000,
    closeOnClick: true,
    style: {
        ...baseToast,
        border: '3px solid oklch(60% 0.20 25)',
    },
    progressStyle: { background: 'oklch(60% 0.20 25)' },
};

// Warning toast
export const toastWarningDefaults = {
    autoClose: 3000,
    closeOnClick: true,
    style: {
        ...baseToast,
        border: '3px solid oklch(82% 0.19 86)',
    },
    progressStyle: { background: 'oklch(82% 0.19 86)' },
};
