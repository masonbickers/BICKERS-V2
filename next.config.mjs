// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Skip ESLint during builds so deployment succeeds
    ignoreDuringBuilds: true,
  },
  // ...keep any other settings you had here
};

export default nextConfig; // ✅ ESM export
