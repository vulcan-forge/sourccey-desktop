/** @type {import('next').NextConfig} */
const nextConfig = {
    // Static export (Next 15 does this inside `next build`)
    output: 'export',
    // Export nested routes as folders with index.html for file/protocol hosts (Tauri release).
    trailingSlash: true,
  
    images: {
      unoptimized: true,
      remotePatterns: [
        { protocol: 'https', hostname: '**' },
      ],
    },
  };
  
  module.exports = nextConfig;
  
