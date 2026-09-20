/** @type {import('next').NextConfig} */
const nextConfig = {
    // Static export (Next 15 does this inside `next build`)
    output: 'export',
    // Next 16.3's CLI-based type check can lose the captured `tsc --showConfig`
    // output on Linux. The installed TypeScript package includes the compiler
    // API, so keep type checking in-process for deterministic desktop builds.
    experimental: {
      useTypeScriptCli: false,
    },
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
  
