DROP TABLE IF EXISTS abuse_command_charges;
DROP TABLE IF EXISTS abuse_admissions;
DROP TABLE IF EXISTS abuse_capacity_buckets;
DROP TABLE IF EXISTS abuse_rate_buckets;

DROP FUNCTION IF EXISTS protect_abuse_command_charge_transition();
DROP FUNCTION IF EXISTS protect_abuse_admission_transition();
