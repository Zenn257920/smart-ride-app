ALTER TABLE "rides" ADD COLUMN "trip_status" text DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "driver_lat" double precision;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "driver_lng" double precision;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "driver_location_at" timestamp;