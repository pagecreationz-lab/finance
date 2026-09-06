CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`loan_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`proof_file_key` text,
	`remarks` text,
	`collected_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `due_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`loan_id` text NOT NULL,
	`original_due_date` text NOT NULL,
	`revised_due_date` text NOT NULL,
	`remarks` text NOT NULL,
	`approved_by` text
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`principal` integer NOT NULL,
	`balance` integer NOT NULL,
	`interest_type` text NOT NULL,
	`interest_rate` real NOT NULL,
	`repayment_frequency` text NOT NULL,
	`given_date` text NOT NULL,
	`next_due_date` text NOT NULL,
	`security_type` text NOT NULL,
	`security_file_key` text,
	`remarks` text,
	`status` text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `topups` (
	`id` text PRIMARY KEY NOT NULL,
	`loan_id` text NOT NULL,
	`amount` integer NOT NULL,
	`interest_type` text NOT NULL,
	`security_file_key` text,
	`remarks` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`role` text NOT NULL,
	`assigned_agent_id` text,
	`created_at` integer NOT NULL
);
