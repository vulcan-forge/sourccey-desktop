/** @type {import('next').NextConfig} */
const nextConfig = {
    // Static export (Next 15 does this inside `next build`)
    output: 'export',

    webpack: (config, { dev }) => {
        if (dev) {
            config.watchOptions = {
                ...(config.watchOptions || {}),
                // Keep file watchers away from very large non-frontend folders.
                ignored: [
                    '**/downloaded_model_example/**',
                    '**/src-tauri/target/**',
                    '**/modules/lerobot-vulcan/.venv/**',
                    '**/modules/lerobot-vulcan/.cache/**',
                ],
            };
        }

        return config;
    },

    images: {
        unoptimized: true,
        remotePatterns: [{ protocol: 'https', hostname: '**' }],
    },
};

module.exports = nextConfig;
