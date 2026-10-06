CREATE INDEX `crew_messages_sequence` ON `crew_messages` (`crew_id`);--> statement-breakpoint
CREATE INDEX `direct_messages_pair_sequence` ON `direct_messages` (`sender_id`,`recipient_id`);--> statement-breakpoint
CREATE INDEX `direct_messages_sent_sequence` ON `direct_messages` (`sender_id`);--> statement-breakpoint
CREATE INDEX `direct_messages_received_sequence` ON `direct_messages` (`recipient_id`);--> statement-breakpoint
CREATE INDEX `direct_messages_unread` ON `direct_messages` (`recipient_id`,`read_at`);