-- A child's change history, read by the record it is about rather than by
-- scanning every audit entry the school has.
CREATE INDEX `audit_logs_entity_entityId_idx` ON `audit_logs`(`entity`, `entityId`);
