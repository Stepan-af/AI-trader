/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@ai-trader/shared'],
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000',
  },
}

module.exports = nextConfig