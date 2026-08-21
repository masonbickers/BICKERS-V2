import { requireValidDeploymentConfig } from "../src/app/config/deploymentConfigCore.js";

try {
  const config = requireValidDeploymentConfig(process.env);
  console.log(`Deployment configuration valid (${config.profile}:${config.companyId}).`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
