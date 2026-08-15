-- CHAIN-001F: make Evidence-to-anchor coverage a database invariant without
-- changing the already-applied 0045 migration.

CREATE FUNCTION require_evidence_chain_anchor()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM evidence_chain_anchors
     WHERE tenant_id = NEW.tenant_id
       AND evidence_event_id = NEW.id
       AND evidence_hash = NEW.evidence_hash
  ) THEN
    RAISE EXCEPTION
      'Durable Evidence requires an exact chain anchor requirement';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- The application inserts the Evidence Envelope first and its anchor
-- requirement second in one transaction. Deferring this check to commit keeps
-- that atomic write order while making it impossible for any future runtime
-- path to persist an unanchored Evidence Envelope.
CREATE CONSTRAINT TRIGGER evidence_envelope_chain_anchor_required
AFTER INSERT ON evidence_envelopes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_evidence_chain_anchor();
