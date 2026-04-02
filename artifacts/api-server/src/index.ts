import app from "./app";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

app.post("/support-tickets", async (req, res) => {
  const { subject, message, user_id } = req.body;

  try {
    const result = await db.query(
      "INSERT INTO support_tickets (user_id, subject, status) VALUES (?, ?, 'active')",
      [user_id, subject]
    );

    const ticketId = result.insertId;

    await db.query(
      "INSERT INTO support_messages (ticket_id, sender, message) VALUES (?, 'user', ?)",
      [ticketId, message]
    );

    res.send({ success: true });
  } catch (err) {
    console.log(err);
    res.status(500).send("Error");
  }
});

app.get("/support-tickets/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const tickets = await db.query(
      "SELECT * FROM support_tickets WHERE user_id = ?",
      [userId]
    );

    for (let t of tickets) {
      const messages = await db.query(
        "SELECT * FROM support_messages WHERE ticket_id = ?",
        [t.id]
      );
      t.messages = messages;
    }

    res.send(tickets);
  } catch (err) {
    res.status(500).send("Error");
  }
});
app.post("/support-message", async (req, res) => {
  const { ticket_id, message } = req.body;

  try {
    await db.query(
      "INSERT INTO support_messages (ticket_id, sender, message) VALUES (?, 'user', ?)",
      [ticket_id, message]
    );

    res.send({ success: true });
  } catch (err) {
    res.status(500).send("Error");
  }
});

// import supportRoutes from "./routes/support";

// app.use("/api/support", supportRoutes);
