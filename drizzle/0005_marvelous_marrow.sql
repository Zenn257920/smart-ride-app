CREATE TABLE "payment_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"account_number" text NOT NULL,
	"account_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_settings_provider_unique" UNIQUE("provider")
);
--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD COLUMN "transaction_id" text;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD COLUMN "proof_image_base64" text;