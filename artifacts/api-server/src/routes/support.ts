/*   

   import express from "express";
// import db from "../db"; // your mysql connection

const router = express.Router();
const DISABLED = true;

// 🔥 CREATE TICKET
router.post("/ticket", async (req, res) => {
  try {
    const { user_id, subject, message } = req.body;

    const [result]: any = await db.query(
      "INSERT INTO support_tickets (user_id, subject) VALUES (?, ?)",
      [user_id, subject]
    );

    const ticketId = result.insertId;

    await db.query(
      "INSERT INTO support_messages (ticket_id, sender, message) VALUES (?, 'user', ?)",
      [ticketId, message]
    );

    res.json({ ticket_id: ticketId });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 🔥 GET USER TICKETS
router.get("/tickets/:userId", async (req, res) => {
  const { userId } = req.params;

  const [tickets] = await db.query(
    "SELECT * FROM support_tickets WHERE user_id = ? ORDER BY id DESC",
    [userId]
  );

  res.json(tickets);
});


// 🔥 GET MESSAGES
router.get("/messages/:ticketId", async (req, res) => {
  const { ticketId } = req.params;

  const [messages] = await db.query(
    "SELECT * FROM support_messages WHERE ticket_id = ?",
    [ticketId]
  );

  res.json(messages);
});


// 🔥 SEND MESSAGE (USER / ADMIN)
router.post("/message", async (req, res) => {
  const { ticket_id, message, sender } = req.body;

  await db.query(
    "INSERT INTO support_messages (ticket_id, sender, message) VALUES (?, ?, ?)",
    [ticket_id, sender, message]
  );

  // 🔄 UPDATE STATUS
  if (sender === "admin") {
    await db.query(
      "UPDATE support_tickets SET status='answered' WHERE id=?",
      [ticket_id]
    );
  } else {
    await db.query(
      "UPDATE support_tickets SET status='open' WHERE id=?",
      [ticket_id]
    );
  }

  res.json({ success: true });
});


// 🔥 CLOSE TICKET
router.post("/close", async (req, res) => {
  const { ticket_id } = req.body;

  await db.query(
    "UPDATE support_tickets SET status='closed' WHERE id=?",
    [ticket_id]
  );

  res.json({ success: true });
});

export default router;

// ADMIN GET ALL TICKETS
router.get("/admin/tickets", async (req, res) => {
  const [tickets] = await db.query(
    "SELECT * FROM support_tickets ORDER BY id DESC"
  );

  res.json(tickets);
});


*/
