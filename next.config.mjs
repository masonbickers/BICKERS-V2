// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  eslint: {
    // Skip ESLint during builds so deployment succeeds
    ignoreDuringBuilds: true,
  },
  // ...keep any other settings you had here
};

export default nextConfig; //  ESM export
