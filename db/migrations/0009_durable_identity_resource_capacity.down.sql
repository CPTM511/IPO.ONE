-- Capacity rows are transient controls, not audit or domain truth. Older code
-- cannot interpret these kinds; a future re-up rebuilds their floor from the
-- retained Subject and Mandate rows before the next successful mutation.
DELETE FROM abuse_capacity_buckets
 WHERE kind IN ('agent_subjects', 'mandates');

ALTER TABLE abuse_capacity_buckets
  DROP CONSTRAINT abuse_capacity_buckets_kind_check,
  ADD CONSTRAINT abuse_capacity_buckets_kind_check CHECK (kind IN (
    'concurrency_actor', 'concurrency_tenant', 'concurrency_service', 'queue',
    'open_obligations', 'providers', 'credentials', 'access_grants'
  ));
