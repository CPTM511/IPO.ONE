import Ajv2020 from "ajv/dist/2020.js";
import { DomainError, hashId } from "../../domain/src/index.js";
import receiptSchema from "../../../schemas/v2/sandbox-obligation-portability-receipt.schema.json" with { type: "json" };

export const SANDBOX_OBLIGATION_PORTABILITY_RECEIPT_SCHEMA_VERSION =
  "sandbox_obligation_portability_receipt.v1";

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
const validateReceipt = ajv.compile(receiptSchema);

export function isSandboxObligationPortabilityReceipt(value) {
  if (validateReceipt(value) !== true) return false;
  const canonicalPaymentRef = hashId("canonical_payment", {
    obligationId: value.obligationId,
    paymentId: value.paymentId,
    assetId: value.assetId,
    amountMinor: value.amountMinor
  });
  if (
    value.canonicalPaymentRef !== canonicalPaymentRef ||
    value.profiles.some((profile) => profile.canonicalPaymentRef !== canonicalPaymentRef)
  ) return false;
  const kernelInvariantHash = hashId("chain_kernel_invariant", {
    obligationId: value.obligationId,
    paymentId: value.paymentId,
    assetId: value.assetId,
    amountMinor: value.amountMinor,
    canonicalPaymentRef
  });
  if (value.kernelInvariantHash !== kernelInvariantHash) return false;
  const { receiptHash, ...core } = value;
  return receiptHash === hashId("sandbox_obligation_portability_receipt", core);
}

export function assertSandboxObligationPortabilityReceipt(value) {
  if (!isSandboxObligationPortabilityReceipt(value)) {
    throw new DomainError(
      "invalid_sandbox_obligation_portability_receipt",
      "Sandbox Obligation portability receipt does not satisfy its versioned contract"
    );
  }
}
