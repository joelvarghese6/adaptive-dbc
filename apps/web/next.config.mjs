/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@adaptive/shared'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
