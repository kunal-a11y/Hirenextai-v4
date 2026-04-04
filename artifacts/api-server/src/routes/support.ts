import { Router } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, supportTicketsTable, supportTicketMessagesTable, usersTable } from "@workspace/db";
import { authenticate, isAdmin, type AuthRequest } from "../middlewares/authenticate.js";
import { sendSupportReplyEmail } from "../services/emailService.js";

const router = Router();

const VALID_CATEGORIES = new Set(["bug", "payment", "account", "general"]);
const VALID_STATUSES = new Set(["open", "in_progress", "resolved"]);

router.get("/tickets", authenticate, async (req: AuthRequest, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const conditions: any[] = [eq(supportTicketsTable.userId, req.userId!)];
  if (status && VALID_STATUSES.has(status)) conditions.push(eq(supportTicketsTable.status, status));
  if (category && VALID_CATEGORIES.has(category)) conditions.push(eq(supportTicketsTable.category, category));
  const where = conditions.length > 1 ? and(...conditions) : conditions[0];

  const tickets = await db
    .select({
      id: supportTicketsTable.id,
      subject: supportTicketsTable.subject,
      message: supportTicketsTable.message,
      status: supportTicketsTable.status,
      createdAt: supportTicketsTable.createdAt,
      category: supportTicketsTable.category,
    })
    .from(supportTicketsTable)
    .where(where)
    .orderBy(desc(supportTicketsTable.createdAt));

  res.json(tickets);
});

router.post("/tickets", authenticate, async (req: AuthRequest, res) => {
  const { subject, message, category = "general" } = req.body ?? {};
  if (!subject || !message) {
    res.status(400).json({ error: "Subject and message are required." });
    return;
  }
  const normalizedCategory = String(category).toLowerCase();
  if (!VALID_CATEGORIES.has(normalizedCategory)) {
    res.status(400).json({ error: "Invalid category. Use bug, payment, account, or general." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  const created = await db.insert(supportTicketsTable).values({
    userId: user.id,
    name: user.name,
    email: user.email,
    subject: subject.trim(),
    category: normalizedCategory,
    message: String(message).trim(),
    status: "open",
  });

  const ticketId = Number(created[0].insertId);
  await db.insert(supportTicketMessagesTable).values({
    ticketId,
    sender: "user",
    message: String(message).trim(),
  });

  res.status(201).json({ success: true, ticketId });
});

router.get("/tickets/:id/messages", authenticate, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid ticket ID." });
    return;
  }

  const [ticket] = await db
    .select({ id: supportTicketsTable.id, userId: supportTicketsTable.userId })
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.id, id))
    .limit(1);
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found." });
    return;
  }
  if (ticket.userId !== req.userId && req.userRole !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const messages = await db
    .select()
    .from(supportTicketMessagesTable)
    .where(eq(supportTicketMessagesTable.ticketId, id))
    .orderBy(supportTicketMessagesTable.createdAt);

  res.json(messages);
});

router.post("/tickets/:id/messages", authenticate, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { message, sender = "user", attachmentUrl } = req.body ?? {};
  if (Number.isNaN(id) || !message || !String(message).trim()) {
    res.status(400).json({ error: "Valid ticket ID and message are required." });
    return;
  }
  const [ticket] = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.id, id))
    .limit(1);
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found." });
    return;
  }
  if (ticket.userId !== req.userId && req.userRole !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const safeSender = req.userRole === "admin" ? "admin" : String(sender);
  await db.insert(supportTicketMessagesTable).values({
    ticketId: id,
    sender: safeSender,
    message: String(message).trim(),
    attachmentUrl: attachmentUrl ? String(attachmentUrl) : null,
  });

  await db.update(supportTicketsTable).set({
    status: safeSender === "admin" ? "in_progress" : "open",
    adminReply: safeSender === "admin" ? String(message).trim() : ticket.adminReply,
  }).where(eq(supportTicketsTable.id, id));

  if (safeSender === "admin") {
    await sendSupportReplyEmail(ticket.email, ticket.name, ticket.subject || "Support Ticket", String(message).trim());
  }

  res.json({ success: true });
});

router.patch("/tickets/:id/status", authenticate, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status ?? "");
  if (Number.isNaN(id) || !VALID_STATUSES.has(status)) {
    res.status(400).json({ error: "Invalid ticket ID or status." });
    return;
  }
  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id)).limit(1);
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found." });
    return;
  }
  if (ticket.userId !== req.userId && req.userRole !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.update(supportTicketsTable).set({ status }).where(eq(supportTicketsTable.id, id));
  res.json({ success: true });
});

router.get("/metrics/monthly", authenticate, isAdmin, async (_req: AuthRequest, res) => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const rows = await db.select({
    month: sql<string>`DATE_FORMAT(${supportTicketsTable.createdAt}, '%b')`,
    count: sql<number>`count(*)`,
  })
    .from(supportTicketsTable)
    .where(gte(supportTicketsTable.createdAt, sixMonthsAgo))
    .groupBy(sql`DATE_FORMAT(${supportTicketsTable.createdAt}, '%Y-%m-01')`)
    .orderBy(sql`DATE_FORMAT(${supportTicketsTable.createdAt}, '%Y-%m-01')`);

  res.json(rows);
});

export default router;
