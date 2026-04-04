import { Router } from "express";
import {
  db, usersTable, sessionsTable, jobsTable, applicationsTable, supportTicketsTable,
  creditTransactionsTable, adminNotificationsTable,
} from "@workspace/db";
import { sql, desc, eq, gte, and } from "drizzle-orm";
import { authenticate, isAdmin, AuthRequest } from "../middlewares/authenticate.js";
import { sendAdminBroadcastEmail } from "../services/emailService.js";

const router = Router();
router.use(authenticate, isAdmin);

const PLAN_LIMITS: Record<string, number> = {
  free: 20,
  pro: 200,
  premium: -1,
};

function currentMonthYear() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Stats ───────────────────────────────────────────────────────────────────
router.get("/stats", async (_req: AuthRequest, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const [
    totalUsersResult,
    activeUsersResult,
    bannedUsersResult,
    totalJobsResult,
    totalApplicationsResult,
    totalTicketsResult,
    openTicketsResult,
    creditsUsedTodayResult,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(usersTable),
    db.select({ count: sql<number>`count(distinct ${sessionsTable.userId})` })
      .from(sessionsTable)
      .where(gte(sessionsTable.createdAt, sevenDaysAgo)),
    db.select({ count: sql<number>`count(*)` })
      .from(usersTable)
      .where(eq(usersTable.banned, true)),
    db.select({ count: sql<number>`count(*)` }).from(jobsTable),
    db.select({ count: sql<number>`count(*)` }).from(applicationsTable),
    db.select({ count: sql<number>`count(*)` }).from(supportTicketsTable),
    db.select({ count: sql<number>`count(*)` })
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.status, "open")),
    db.select({ total: sql<number>`coalesce(sum(${creditTransactionsTable.creditsUsed}),0)` })
      .from(creditTransactionsTable)
      .where(gte(creditTransactionsTable.createdAt, todayStart)),
  ]);

  res.json({
    totalUsers: Number(totalUsersResult[0]?.count ?? 0),
    activeUsers: Number(activeUsersResult[0]?.count ?? 0),
    bannedUsers: Number(bannedUsersResult[0]?.count ?? 0),
    totalJobs: Number(totalJobsResult[0]?.count ?? 0),
    totalApplications: Number(totalApplicationsResult[0]?.count ?? 0),
    totalTickets: Number(totalTicketsResult[0]?.count ?? 0),
    openTickets: Number(openTicketsResult[0]?.count ?? 0),
    creditsUsedToday: Number(creditsUsedTodayResult[0]?.total ?? 0),
  });
});

// ─── Growth (monthly series for charts) ──────────────────────────────────────
router.get("/growth", async (_req: AuthRequest, res) => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [userRows, appRows] = await Promise.all([
    db.select({
      month: sql<string>`DATE_FORMAT(${usersTable.createdAt}, '%b')`,
      count: sql<number>`count(*)`,
    })
      .from(usersTable)
      .where(gte(usersTable.createdAt, sixMonthsAgo))
      .groupBy(sql`DATE_FORMAT(${usersTable.createdAt}, '%Y-%m-01')`)
      .orderBy(sql`DATE_FORMAT(${usersTable.createdAt}, '%Y-%m-01')`),
    db.select({
      month: sql<string>`DATE_FORMAT(${applicationsTable.appliedAt}, '%b')`,
      count: sql<number>`count(*)`,
    })
      .from(applicationsTable)
      .where(gte(applicationsTable.appliedAt, sixMonthsAgo))
      .groupBy(sql`DATE_FORMAT(${applicationsTable.appliedAt}, '%Y-%m-01')`)
      .orderBy(sql`DATE_FORMAT(${applicationsTable.appliedAt}, '%Y-%m-01')`),
  ]);

  res.json({ users: userRows, applications: appRows });
});

// ─── Users list ───────────────────────────────────────────────────────────────
router.get("/users", async (_req: AuthRequest, res) => {
  const monthYear = currentMonthYear();

  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      subscriptionPlan: usersTable.subscriptionPlan,
      role: usersTable.role,
      banned: usersTable.banned,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt));

  const creditRows = await db
    .select({
      userId: creditTransactionsTable.userId,
      used: sql<number>`coalesce(sum(${creditTransactionsTable.creditsUsed}),0)`,
    })
    .from(creditTransactionsTable)
    .where(eq(creditTransactionsTable.monthYear, monthYear))
    .groupBy(creditTransactionsTable.userId);

  const usageMap = new Map(creditRows.map(r => [r.userId, Number(r.used)]));

  const result = users.map(u => {
    const limit = PLAN_LIMITS[u.subscriptionPlan] ?? 20;
    const used = usageMap.get(u.id) ?? 0;
    const creditsLeft = limit === -1 ? -1 : Math.max(0, limit - used);
    return { ...u, creditsUsed: used, creditsLeft, monthlyLimit: limit };
  });

  res.json(result);
});

// ─── Give / reset credits ─────────────────────────────────────────────────────
router.patch("/user/:id/credits", async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const { amount, action } = req.body ?? {};

  if (action === "reset") {
    const monthYear = currentMonthYear();
    await db
      .delete(creditTransactionsTable)
      .where(
        and(
          eq(creditTransactionsTable.userId, id),
          eq(creditTransactionsTable.monthYear, monthYear)
        )
      );
    res.json({ success: true, message: "Credits reset for current month." });
    return;
  }

  const credits = Number(amount);
  if (isNaN(credits) || credits <= 0) {
    res.status(400).json({ error: "amount must be a positive number" });
    return;
  }

  const monthYear = currentMonthYear();
  await db.insert(creditTransactionsTable).values({
    userId: id,
    creditsUsed: -credits,
    featureUsed: "admin_grant",
    monthYear,
  });

  res.json({ success: true, message: `Granted ${credits} credits.` });
});

// ─── Ban user ─────────────────────────────────────────────────────────────────
router.patch("/user/:id/ban", async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "User not found." }); return; }

  await db.update(usersTable).set({ banned: true, updatedAt: new Date() }).where(eq(usersTable.id, id));
  res.json({ success: true });
});

// ─── Activate user ────────────────────────────────────────────────────────────
router.patch("/user/:id/activate", async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "User not found." }); return; }

  await db.update(usersTable).set({ banned: false, updatedAt: new Date() }).where(eq(usersTable.id, id));
  res.json({ success: true });
});

// ─── Change role ──────────────────────────────────────────────────────────────
router.patch("/user/:id/role", async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const { role } = req.body ?? {};
  const allowed = ["job_seeker", "recruiter"];
  if (!allowed.includes(role)) {
    res.status(400).json({ error: `role must be one of: ${allowed.join(", ")}` });
    return;
  }

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "User not found." }); return; }

  await db.update(usersTable).set({ role, updatedAt: new Date() }).where(eq(usersTable.id, id));
  res.json({ success: true });
});

// ─── Delete user ──────────────────────────────────────────────────────────────
router.delete("/user/:id", async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "User not found." }); return; }

  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.json({ success: true });
});

// ─── Tickets ──────────────────────────────────────────────────────────────────
router.get("/tickets", async (req: AuthRequest, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";

  const conditions: any[] = [];
  if (status && ["open", "in_progress", "resolved"].includes(status)) conditions.push(eq(supportTicketsTable.status, status));
  if (category && ["bug", "payment", "account", "general"].includes(category)) conditions.push(eq(supportTicketsTable.category, category));
  const where = conditions.length > 1 ? and(...conditions) : conditions[0];

  let tickets = await db
    .select({
      id: supportTicketsTable.id,
      name: supportTicketsTable.name,
      email: supportTicketsTable.email,
      subject: supportTicketsTable.subject,
      category: supportTicketsTable.category,
      message: supportTicketsTable.message,
      status: supportTicketsTable.status,
      adminReply: supportTicketsTable.adminReply,
      createdAt: supportTicketsTable.createdAt,
      userId: supportTicketsTable.userId,
    })
    .from(supportTicketsTable)
    .where(where)
    .orderBy(desc(supportTicketsTable.createdAt));

  if (query) {
    const needle = query.toLowerCase();
    tickets = tickets.filter((t: any) =>
      t.subject.toLowerCase().includes(needle)
      || t.name.toLowerCase().includes(needle)
      || t.email.toLowerCase().includes(needle)
      || t.category.toLowerCase().includes(needle)
    );
  }

  res.json(tickets);
});

router.patch("/ticket/:id/reply", async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  const { reply } = req.body ?? {};
  if (!reply || typeof reply !== "string" || !reply.trim()) {
    res.status(400).json({ error: "Reply text is required." });
    return;
  }

  const [existing] = await db.select({ id: supportTicketsTable.id })
    .from(supportTicketsTable).where(eq(supportTicketsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Ticket not found." }); return; }

  await db.update(supportTicketsTable)
    .set({ adminReply: reply.trim(), status: "resolved" })
    .where(eq(supportTicketsTable.id, id));

  const [updated] = await db.select().from(supportTicketsTable)
    .where(eq(supportTicketsTable.id, id)).limit(1);

  res.json({ success: true, ticket: updated });
});

router.patch("/ticket/:id/status", async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const status = String(req.body?.status ?? "");
  if (isNaN(id) || !["open", "in_progress", "resolved"].includes(status)) {
    res.status(400).json({ error: "Invalid ticket ID or status." });
    return;
  }
  await db.update(supportTicketsTable).set({ status }).where(eq(supportTicketsTable.id, id));
  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id)).limit(1);
  res.json({ success: true, ticket });
});

router.post("/notifications/send", async (req: AuthRequest, res) => {
  const { title, message, audience = "all", channels = ["in_app"] } = req.body ?? {};
  if (!title || !message) {
    res.status(400).json({ error: "Title and message are required." });
    return;
  }
  const validAudience = ["all", "job_seeker", "recruiter"];
  if (!validAudience.includes(audience)) {
    res.status(400).json({ error: "Invalid audience." });
    return;
  }

  const baseUsersQuery = db.select({ id: usersTable.id, email: usersTable.email, name: usersTable.name, role: usersTable.role })
    .from(usersTable);
  const users = audience === "all"
    ? await baseUsersQuery
    : await baseUsersQuery.where(eq(usersTable.role, audience));

  if (users.length === 0) {
    res.json({ success: true, sent: 0 });
    return;
  }

  await db.insert(adminNotificationsTable).values(
    users.map((u) => ({
      userId: u.id,
      title: String(title).trim(),
      message: String(message).trim(),
      channel: channels.includes("email") ? "email+in_app" : "in_app",
      audience,
    }))
  );

  if (channels.includes("email")) {
    await Promise.all(users.map((u) => sendAdminBroadcastEmail(u.email, u.name, String(title).trim(), String(message).trim())));
  }

  res.json({ success: true, sent: users.length });
});

router.get("/notifications", async (_req: AuthRequest, res) => {
  const rows = await db.select().from(adminNotificationsTable).orderBy(desc(adminNotificationsTable.createdAt));
  res.json(rows);
});

export default router;
