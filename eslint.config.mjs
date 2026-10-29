import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
    ...nextVitals,
    {
        ignores: ['modules/**', 'src-tauri/**', '**/target/**', 'tools/**', 'downloads/**', 'logs/**', 'coverage/**'],
    },
];

export default config;
