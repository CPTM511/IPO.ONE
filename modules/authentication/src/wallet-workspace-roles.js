import { authenticationError } from "./security-utils.js";

export const ORDINARY_WALLET_ROLES = Object.freeze(["human_borrower", "principal_controller"]);
export const INVITED_WALLET_ROLES = Object.freeze(["capital_partner_operator", "risk_operator"]);
export const WALLET_ROLE_LABELS = Object.freeze({
  human_borrower: "Human Borrower",
  principal_controller: "Principal Controller",
  capital_partner_operator: "Capital Partner",
  risk_operator: "Risk Operations"
});
export const SELECTABLE_HUMAN_ROLES = new Set(Object.keys(WALLET_ROLE_LABELS));

export function allowedWalletRoles(value = ORDINARY_WALLET_ROLES) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4 ||
      new Set(value).size !== value.length || value.some(role => !SELECTABLE_HUMAN_ROLES.has(role))) {
    throw authenticationError("invalid_authentication_configuration", "wallet workspace roles are invalid");
  }
  return Object.freeze([...value]);
}
