CREATE TYPE "public"."employee_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('addressed_sticker', 'sticker_reply');--> statement-breakpoint
CREATE TYPE "public"."paper_style" AS ENUM('yellow', 'mint', 'pink', 'blue', 'cream');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sticker_id" uuid NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" varchar(255) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "attachments_size_check" CHECK ("attachments"."size_bytes" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "attachments_name_check" CHECK (length(btrim("attachments"."original_name")) > 0),
	CONSTRAINT "attachments_mime_check" CHECK (length(btrim("attachments"."mime_type")) > 0),
	CONSTRAINT "attachments_storage_key_check" CHECK (length(btrim("attachments"."storage_key")) > 0)
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"department_id" uuid,
	"is_general" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boards_department_unique" UNIQUE("department_id"),
	CONSTRAINT "boards_scope_check" CHECK (("boards"."department_id" IS NOT NULL AND NOT "boards"."is_general") OR ("boards"."department_id" IS NULL AND "boards"."is_general")),
	CONSTRAINT "boards_name_check" CHECK (length(btrim("boards"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"code" varchar(64) NOT NULL,
	"color" varchar(7) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code"),
	CONSTRAINT "departments_code_check" CHECK ("departments"."code" ~ '^[a-z][a-z0-9_-]*$'),
	CONSTRAINT "departments_name_check" CHECK (length(btrim("departments"."name")) > 0),
	CONSTRAINT "departments_color_check" CHECK ("departments"."color" ~ '^#[0-9A-Fa-f]{6}$'),
	CONSTRAINT "departments_updated_at_check" CHECK ("departments"."updated_at" >= "departments"."created_at")
);
--> statement-breakpoint
CREATE TABLE "employee_departments" (
	"employee_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "employee_departments_employee_id_department_id_pk" PRIMARY KEY("employee_id","department_id")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login" varchar(128) NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"avatar_url" text,
	"role" "employee_role" DEFAULT 'user' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"paper_style" "paper_style" DEFAULT 'yellow' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_login_check" CHECK (length(btrim("employees"."login")) > 0 AND "employees"."login" = btrim("employees"."login")),
	CONSTRAINT "employees_name_check" CHECK (length(btrim("employees"."display_name")) > 0),
	CONSTRAINT "employees_password_hash_check" CHECK (length(btrim("employees"."password_hash")) > 0),
	CONSTRAINT "employees_updated_at_check" CHECK ("employees"."updated_at" >= "employees"."created_at")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"sticker_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_recipient_sticker_type_unique" UNIQUE("recipient_id","sticker_id","type"),
	CONSTRAINT "notifications_read_at_check" CHECK ("notifications"."read_at" IS NULL OR "notifications"."read_at" >= "notifications"."created_at")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "sessions_token_hash_check" CHECK ("sessions"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "sessions_expires_at_check" CHECK ("sessions"."expires_at" > "sessions"."created_at"),
	CONSTRAINT "sessions_revoked_at_check" CHECK ("sessions"."revoked_at" IS NULL OR "sessions"."revoked_at" >= "sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "sticker_department_recipients" (
	"sticker_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	CONSTRAINT "sticker_department_recipients_sticker_id_department_id_pk" PRIMARY KEY("sticker_id","department_id")
);
--> statement-breakpoint
CREATE TABLE "sticker_employee_recipients" (
	"sticker_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	CONSTRAINT "sticker_employee_recipients_sticker_id_employee_id_pk" PRIMARY KEY("sticker_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "stickers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"author_department_id" uuid NOT NULL,
	"parent_id" uuid,
	"thread_root_id" uuid GENERATED ALWAYS AS (coalesce("parent_id", "id")) STORED NOT NULL,
	"reply_order" integer,
	"text" text NOT NULL,
	"x" double precision DEFAULT 0 NOT NULL,
	"y" double precision DEFAULT 0 NOT NULL,
	"rotation" double precision DEFAULT 0 NOT NULL,
	"z_index" bigint DEFAULT 0 NOT NULL,
	"paper_style" "paper_style" NOT NULL,
	"paper_seed" bigint NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"read_by_id" uuid,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"done_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_id" uuid,
	CONSTRAINT "stickers_thread_identity_unique" UNIQUE("id","board_id","thread_root_id"),
	CONSTRAINT "stickers_parent_not_self_check" CHECK ("stickers"."parent_id" IS NULL OR "stickers"."parent_id" <> "stickers"."id"),
	CONSTRAINT "stickers_reply_order_check" CHECK (("stickers"."parent_id" IS NULL AND "stickers"."reply_order" IS NULL) OR ("stickers"."parent_id" IS NOT NULL AND "stickers"."reply_order" IS NOT NULL AND "stickers"."reply_order" >= 0)),
	CONSTRAINT "stickers_position_check" CHECK ("stickers"."x" > '-Infinity'::float8 AND "stickers"."x" < 'Infinity'::float8 AND "stickers"."y" > '-Infinity'::float8 AND "stickers"."y" < 'Infinity'::float8),
	CONSTRAINT "stickers_rotation_check" CHECK ("stickers"."rotation" BETWEEN -180 AND 180),
	CONSTRAINT "stickers_z_index_check" CHECK ("stickers"."z_index" BETWEEN 0 AND 9007199254740991 AND ("stickers"."parent_id" IS NULL OR "stickers"."z_index" = 0)),
	CONSTRAINT "stickers_paper_seed_check" CHECK ("stickers"."paper_seed" BETWEEN 0 AND 4294967295),
	CONSTRAINT "stickers_read_state_check" CHECK (("stickers"."read" AND "stickers"."read_at" IS NOT NULL AND "stickers"."read_by_id" IS NOT NULL) OR (NOT "stickers"."read" AND "stickers"."read_at" IS NULL AND "stickers"."read_by_id" IS NULL)),
	CONSTRAINT "stickers_done_state_check" CHECK (("stickers"."done" AND "stickers"."done_at" IS NOT NULL AND "stickers"."done_by_id" IS NOT NULL) OR (NOT "stickers"."done" AND "stickers"."done_at" IS NULL AND "stickers"."done_by_id" IS NULL)),
	CONSTRAINT "stickers_done_requires_read_check" CHECK (NOT "stickers"."done" OR "stickers"."read"),
	CONSTRAINT "stickers_archive_state_check" CHECK (("stickers"."archived_at" IS NULL AND "stickers"."archived_by_id" IS NULL) OR ("stickers"."archived_at" IS NOT NULL AND "stickers"."archived_by_id" IS NOT NULL)),
	CONSTRAINT "stickers_updated_at_check" CHECK ("stickers"."updated_at" >= "stickers"."created_at")
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_sticker_id_stickers_id_fk" FOREIGN KEY ("sticker_id") REFERENCES "public"."stickers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_departments" ADD CONSTRAINT "employee_departments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_departments" ADD CONSTRAINT "employee_departments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_employees_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sticker_id_stickers_id_fk" FOREIGN KEY ("sticker_id") REFERENCES "public"."stickers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sticker_department_recipients" ADD CONSTRAINT "sticker_department_recipients_sticker_id_stickers_id_fk" FOREIGN KEY ("sticker_id") REFERENCES "public"."stickers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sticker_department_recipients" ADD CONSTRAINT "sticker_department_recipients_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sticker_employee_recipients" ADD CONSTRAINT "sticker_employee_recipients_sticker_id_stickers_id_fk" FOREIGN KEY ("sticker_id") REFERENCES "public"."stickers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sticker_employee_recipients" ADD CONSTRAINT "sticker_employee_recipients_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_author_id_employees_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_author_department_id_departments_id_fk" FOREIGN KEY ("author_department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_read_by_id_employees_id_fk" FOREIGN KEY ("read_by_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_done_by_id_employees_id_fk" FOREIGN KEY ("done_by_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_archived_by_id_employees_id_fk" FOREIGN KEY ("archived_by_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_parent_same_board_root_fk" FOREIGN KEY ("parent_id","board_id","thread_root_id") REFERENCES "public"."stickers"("id","board_id","thread_root_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_sticker_idx" ON "attachments" USING btree ("sticker_id","uploaded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "boards_general_uidx" ON "boards" USING btree ("is_general") WHERE "boards"."is_general";--> statement-breakpoint
CREATE UNIQUE INDEX "employee_departments_primary_uidx" ON "employee_departments" USING btree ("employee_id") WHERE "employee_departments"."is_primary";--> statement-breakpoint
CREATE INDEX "employee_departments_department_idx" ON "employee_departments" USING btree ("department_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_login_ci_uidx" ON "employees" USING btree (lower("login"));--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_idx" ON "notifications" USING btree ("recipient_id","created_at","id");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("recipient_id","created_at") WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "notifications_sticker_idx" ON "notifications" USING btree ("sticker_id");--> statement-breakpoint
CREATE INDEX "sessions_employee_idx" ON "sessions" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sticker_department_recipients_department_idx" ON "sticker_department_recipients" USING btree ("department_id","sticker_id");--> statement-breakpoint
CREATE INDEX "sticker_employee_recipients_employee_idx" ON "sticker_employee_recipients" USING btree ("employee_id","sticker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stickers_reply_order_uidx" ON "stickers" USING btree ("parent_id","reply_order") WHERE "stickers"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "stickers_board_active_roots_idx" ON "stickers" USING btree ("board_id","z_index","id") WHERE "stickers"."parent_id" IS NULL AND "stickers"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "stickers_thread_idx" ON "stickers" USING btree ("thread_root_id","reply_order","id");--> statement-breakpoint
CREATE INDEX "stickers_board_created_idx" ON "stickers" USING btree ("board_id","created_at");--> statement-breakpoint
CREATE INDEX "stickers_author_created_idx" ON "stickers" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "stickers_author_department_created_idx" ON "stickers" USING btree ("author_department_id","created_at");--> statement-breakpoint
CREATE INDEX "stickers_archived_at_idx" ON "stickers" USING btree ("archived_at","id") WHERE "stickers"."archived_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "stickers_created_at_idx" ON "stickers" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "stickers_read_by_idx" ON "stickers" USING btree ("read_by_id") WHERE "stickers"."read_by_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "stickers_done_by_idx" ON "stickers" USING btree ("done_by_id") WHERE "stickers"."done_by_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "stickers_archived_by_idx" ON "stickers" USING btree ("archived_by_id") WHERE "stickers"."archived_by_id" IS NOT NULL;