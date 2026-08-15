DROP TRIGGER IF EXISTS evidence_envelope_chain_anchor_required
  ON evidence_envelopes;

DROP FUNCTION IF EXISTS require_evidence_chain_anchor();
