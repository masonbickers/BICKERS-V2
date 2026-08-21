// next.config.mjs
import { publicDeploymentConfig, requireValidDeploymentConfig } from "./src/app/config/deploymentConfigCore.js";

const deploymentConfig = publicDeploymentConfig(requireValidDeploymentConfig(process.env));

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_DEPLOYMENT_CONFIG: JSON.stringify(deploymentConfig),
  },
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
    ],
  },
};

export default nextConfig; //  ESM export
