DROP TABLE IF EXISTS break_glass_reviews;
DROP TABLE IF EXISTS break_glass_custodian_decisions;
DROP TABLE IF EXISTS break_glass_incidents;
DROP TABLE IF EXISTS approval_executions;
DROP TABLE IF EXISTS approval_decisions;
DROP TABLE IF EXISTS approval_proposals;

DROP FUNCTION IF EXISTS protect_break_glass_incident_transition();
DROP FUNCTION IF EXISTS protect_approval_proposal_transition();

DROP TYPE IF EXISTS break_glass_review_status;
DROP TYPE IF EXISTS break_glass_incident_status;
DROP TYPE IF EXISTS approval_decision_value;
DROP TYPE IF EXISTS approval_proposal_status;
