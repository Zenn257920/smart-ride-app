CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"endpoint" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_user_key_unique" ON "idempotency_keys" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "bookings_ride_id_idx" ON "bookings" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX "bookings_passenger_id_idx" ON "bookings" USING btree ("passenger_id");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_ride_passenger_confirmed_unique" ON "bookings" USING btree ("ride_id","passenger_id") WHERE status = 'confirmed';--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_read_idx" ON "notifications" USING btree ("read");--> statement-breakpoint
CREATE INDEX "request_passengers_request_id_idx" ON "request_passengers" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "request_passengers_passenger_id_idx" ON "request_passengers" USING btree ("passenger_id");--> statement-breakpoint
CREATE INDEX "ride_requests_passenger_id_idx" ON "ride_requests" USING btree ("passenger_id");--> statement-breakpoint
CREATE INDEX "ride_requests_status_idx" ON "ride_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rides_driver_id_idx" ON "rides" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "rides_status_idx" ON "rides" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wallet_transactions_user_id_idx" ON "wallet_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallet_transactions_status_idx" ON "wallet_transactions" USING btree ("status");