/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // 30 days
    minimumCacheTTL: 60 * 60 * 24 * 30,
},
}

module.exports = nextConfig
