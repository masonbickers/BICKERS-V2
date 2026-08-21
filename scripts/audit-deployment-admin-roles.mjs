import { adminListDocuments } from "../src/app/api/_firebaseAdminRest.js";
import { auditDeploymentAdminRoles } from "../src/app/config/deploymentAdminAudit.js";
import { requireValidDeploymentConfig } from "../src/app/config/deploymentConfigCore.js";

try {
  const config = requireValidDeploymentConfig(process.env);
  const users = await adminListDocuments("users");
  const result = auditDeploymentAdminRoles(users, config);
  if (result.mismatches.length) {
    console.error("Deployment administrator audit failed:");
    result.mismatches.forEach((row) => {
      console.error(`- ${row.email}: expected ${row.expectedRole}; ${row.status} (${row.actualRole})`);
    });
    process.exitCode = 1;
  } else {
    console.log(`Deployment administrator audit passed (${result.checked} configured addresses checked).`);
  }
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}
