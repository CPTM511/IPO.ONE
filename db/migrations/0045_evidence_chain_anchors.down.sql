DROP POLICY IF EXISTS tenant_isolation_evidence_chain_anchor_observations
  ON evidence_chain_anchor_observations;
DROP POLICY IF EXISTS tenant_isolation_evidence_chain_anchors
  ON evidence_chain_anchors;

DROP TRIGGER IF EXISTS tenant_context_guard_evidence_chain_anchor_observations
  ON evidence_chain_anchor_observations;
DROP TRIGGER IF EXISTS tenant_context_guard_evidence_chain_anchors
  ON evidence_chain_anchors;
DROP TRIGGER IF EXISTS evidence_chain_anchor_observations_immutable
  ON evidence_chain_anchor_observations;
DROP TRIGGER IF EXISTS evidence_chain_anchor_delete_guard
  ON evidence_chain_anchors;
DROP TRIGGER IF EXISTS evidence_chain_anchor_transition_guard
  ON evidence_chain_anchors;

DROP FUNCTION IF EXISTS protect_evidence_chain_anchor_transition();

DROP TABLE IF EXISTS evidence_chain_anchor_observations;
DROP TABLE IF EXISTS evidence_chain_anchors;
