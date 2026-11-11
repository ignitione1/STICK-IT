ALTER TABLE "departments" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "failed_login_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "login_blocked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_failed_login_count_check" CHECK ("employees"."failed_login_count" >= 0);