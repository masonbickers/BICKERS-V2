"use client";

import { createContext, useContext } from "react";
import { publicDeploymentConfig, BICKERS_DEPLOYMENT_DEFAULTS } from "@/app/config/deploymentConfigCore";

const BICKERS_PUBLIC_CONFIG = publicDeploymentConfig(BICKERS_DEPLOYMENT_DEFAULTS);
const DeploymentConfigContext = createContext(BICKERS_PUBLIC_CONFIG);

export function useDeploymentConfig() {
  return useContext(DeploymentConfigContext);
}

export default function DeploymentConfigProvider({ config = BICKERS_PUBLIC_CONFIG, children }) {
  return (
    <DeploymentConfigContext.Provider value={{ ...BICKERS_PUBLIC_CONFIG, ...config }}>
      {children}
    </DeploymentConfigContext.Provider>
  );
}
