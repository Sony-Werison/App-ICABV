CREATE TABLE `church_access` (
	`user_id` text PRIMARY KEY NOT NULL,
	`church_owner` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`ministry` text DEFAULT '' NOT NULL,
	`member_id` text,
	`active` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `access_church` ON `church_access` (`church_owner`);--> statement-breakpoint
CREATE UNIQUE INDEX `access_church_email` ON `church_access` (`church_owner`,`email`);--> statement-breakpoint
CREATE TABLE `church_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`church_owner` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`ministry` text DEFAULT '' NOT NULL,
	`member_id` text,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`revoked_at` text,
	`accepted_at` text,
	`accepted_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_hash` ON `church_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitation_church` ON `church_invitations` (`church_owner`);