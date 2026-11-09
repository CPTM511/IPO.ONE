import terms from "../../../schemas/v2/synthetic-fee-terms.schema.json" with { type: "json" };
import state from "../../../schemas/v2/synthetic-fee-state.schema.json" with { type: "json" };
import entry from "../../../schemas/v2/synthetic-fee-entry.schema.json" with { type: "json" };
import statement from "../../../schemas/v2/synthetic-fee-statement.schema.json" with { type: "json" };
export const SYNTHETIC_FEE_SCHEMAS = Object.freeze([terms, state, entry, statement]);
export function registerSyntheticFeeSchemas(ajv) {
  for (const schema of SYNTHETIC_FEE_SCHEMAS) ajv.addSchema(schema);
}
