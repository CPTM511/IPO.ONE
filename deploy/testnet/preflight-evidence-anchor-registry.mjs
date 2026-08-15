import {
  preflightEvidenceAnchorRegistryDeploy,
  readEvidenceAnchorDeployInput
} from "./run-evidence-anchor-registry-deploy.mjs";

const result = await preflightEvidenceAnchorRegistryDeploy(
  readEvidenceAnchorDeployInput()
);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
