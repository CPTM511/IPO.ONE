import Ajv2020 from "ajv/dist/2020.js";
import { DomainError } from "../../domain/src/index.js";
import manifestSchema from "../../../schemas/v2/agent-handoff-manifest.schema.json" with { type: "json" };

export const AGENT_HANDOFF_MANIFEST_SCHEMA_VERSION = "agent_handoff_manifest.v1";

function dateTime(value) {
  return (
    typeof value === "string" &&
    /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) &&
    Number.isFinite(new Date(value).getTime())
  );
}

const ajv = new Ajv2020({
  allErrors: false,
  allowUnionTypes: true,
  coerceTypes: false,
  removeAdditional: false,
  strict: true,
  strictRequired: false,
  useDefaults: false,
  validateFormats: true
});
ajv.addFormat("date-time", { type: "string", validate: dateTime });
const validateManifest = ajv.compile(manifestSchema);

export function isAgentHandoffManifest(value) {
  return validateManifest(value) === true;
}

export function assertAgentHandoffManifest(value) {
  if (!isAgentHandoffManifest(value)) {
    throw new DomainError(
      "invalid_agent_handoff_manifest",
      "Agent handoff manifest does not satisfy its versioned contract"
    );
  }
}
