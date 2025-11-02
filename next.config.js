/** @type {import('next').NextConfig} */
const nextConfig = {
    // Static export (Next 15 does this inside `next build`)
    output: 'export',
  
    images: {
      unoptimized: true,
      remotePatterns: [
        { protocol: 'https', hostname: '**' },
      ],
    },
  };
  
  module.exports = nextConfig;
  