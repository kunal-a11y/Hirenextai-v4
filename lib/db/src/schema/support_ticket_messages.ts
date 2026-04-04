import { sql } from "drizzle-orm";
import { mysqlTable, int, text, datetime, index } from "drizzle-orm/mysql-core";
import { supportTicketsTable } from "./support_tickets";

export const supportTicketMessagesTable = mysqlTable(
  "support_ticket_messages",
  {
    id: int("id").autoincrement().primaryKey(),
    ticketId: int("ticket_id")
      .notNull()
      .references(() => supportTicketsTable.id, { onDelete: "cascade" }),
    sender: text("sender").notNull().default("user"),
    message: text("message").notNull(),
    attachmentUrl: text("attachment_url"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("support_ticket_messages_ticket_idx").on(t.ticketId),
    index("support_ticket_messages_created_idx").on(t.createdAt),
  ]
);
