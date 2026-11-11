ALTER TABLE "stickers" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_revision_check" CHECK ("stickers"."revision" >= 0);