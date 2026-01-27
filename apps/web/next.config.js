/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@ai-trader/shared'],
  
  // Environment variables accessible in browser
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000',
  },

  // Production optimizations
  output: 'standalone',
  compress: true,
  poweredByHeader: false,

  // Image optimization
  images: {
    unoptimized: true, // Disable if using external CDN
  },

  // Strict mode for better development experience
  reactStrictMode: true,

  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
