/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Logos and static art rarely change; cache optimized variants for a year
    // so they are not re-optimized on every cold edge request.
    minimumCacheTTL: 31536000,
  },
};

export default nextConfig;
