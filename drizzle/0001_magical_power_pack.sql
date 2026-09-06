CREATE INDEX `idx_collections_agent_date` ON `collections` (`agent_id`,`collected_at`);--> statement-breakpoint
CREATE INDEX `idx_collections_loan_id` ON `collections` (`loan_id`);--> statement-breakpoint
CREATE INDEX `idx_loans_customer_id` ON `loans` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_loans_next_due_date` ON `loans` (`next_due_date`);--> statement-breakpoint
PRAGMA optimize;
