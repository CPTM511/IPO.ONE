-- Capacity rows are transient controls, not audit or domain truth. Older code
-- cannot interpret this kind; a future re-up rebuilds its floor from retained
-- Credit Intent projections before the next successful mutation.
DELETE FROM abuse_capacity_buckets
 WHERE kind = 'credit_intents';

ALTER TABLE abuse_capacity_buckets
  DROP CONSTRAINT abuse_capacity_buckets_kind_check,
  ADD CONSTRAINT abuse_capacity_buckets_kind_check CHECK (kind IN (
    'concurrency_actor', 'concurrency_tenant', 'concurrency_service', 'queue',
    'agent_subjects', 'mandates',
    'open_obligations', 'providers', 'credentials', 'access_grants'
  ));
