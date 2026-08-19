import { getPublicDeploymentConfig } from "@/app/config/deploymentConfig";
import { deploymentManifest } from "@/app/config/deploymentConfigCore";

export const dynamic = "force-dynamic";

export function GET() {
  const deployment = getPublicDeploymentConfig();
  return Response.json(deploymentManifest(deployment));
}
