CREATE TYPE "public"."fastening" AS ENUM('pin', 'clip', 'tape', 'fold');--> statement-breakpoint
ALTER TYPE "public"."paper_style" ADD VALUE 'lavender';--> statement-breakpoint
ALTER TYPE "public"."paper_style" ADD VALUE 'peach';--> statement-breakpoint
ALTER TYPE "public"."paper_style" ADD VALUE 'sea';--> statement-breakpoint
ALTER TYPE "public"."paper_style" ADD VALUE 'sage';--> statement-breakpoint
ALTER TYPE "public"."paper_style" ADD VALUE 'berry';--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "fastening" "fastening" DEFAULT 'pin' NOT NULL;--> statement-breakpoint
ALTER TABLE "stickers" ADD COLUMN "fastening" "fastening" DEFAULT 'pin' NOT NULL;--> statement-breakpoint
UPDATE "employees" SET "fastening" = (CASE "paper_style"::text WHEN 'mint' THEN 'clip' WHEN 'pink' THEN 'tape' WHEN 'cream' THEN 'fold' ELSE 'pin' END)::"fastening";--> statement-breakpoint
UPDATE "stickers" SET "fastening" = (CASE "paper_style"::text WHEN 'mint' THEN 'clip' WHEN 'pink' THEN 'tape' WHEN 'cream' THEN 'fold' ELSE 'pin' END)::"fastening";
