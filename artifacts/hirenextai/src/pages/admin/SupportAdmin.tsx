import { useEffect, useState } from "react";

export default function SupportAdmin() {

  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply] = useState("");

  // 🔥 LOAD ALL TICKETS
  const loadTickets = async () => {
    const res = await fetch("/api/support/tickets"); // 0 = admin (we'll fix later)
    const data = await res.json();
    setTickets(data);
  };

  useEffect(() => {
    loadTickets();
  }, []);

  // 🔥 OPEN TICKET
  const openTicket = async (ticket: any) => {
    setSelectedTicket(ticket);

    const res = await fetch(`/api/support/messages/${ticket.id}`);
    const data = await res.json();
    setMessages(data);
  };

  // 🔥 SEND REPLY
  const sendReply = async () => {
    if (!reply) return;

    await fetch("/api/support/message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ticket_id: selectedTicket.id,
        message: reply,
        sender: "admin",
      }),
    });

    setReply("");

    openTicket(selectedTicket);
    loadTickets();
  };

  // 🔥 CLOSE TICKET
  const closeTicket = async () => {
    await fetch("/api/support/close", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ticket_id: selectedTicket.id,
      }),
    });

    loadTickets();
    setSelectedTicket(null);
  };

  return (
    <div className="p-6 text-white">

      <h1 className="text-3xl font-bold mb-6">
        Support Admin Panel
      </h1>

      <div className="grid grid-cols-3 gap-6">

        {/* LEFT: TICKETS */}
        <div className="col-span-1 glass-card p-4 space-y-3">

          {tickets.map((t) => (
            <div
              key={t.id}
              onClick={() => openTicket(t)}
              className="p-3 bg-white/5 rounded cursor-pointer flex justify-between"
            >
              <span>#{t.id}</span>

              <span className={
                t.status === "open"
                  ? "text-green-400"
                  : t.status === "answered"
                  ? "text-yellow-400"
                  : "text-red-400"
              }>
                ●
              </span>
            </div>
          ))}

        </div>

        {/* RIGHT: CHAT */}
        <div className="col-span-2 glass-card p-4">

          {!selectedTicket ? (
            <p>Select a ticket</p>
          ) : (
            <div>

              <h2 className="mb-2">
                Ticket #{selectedTicket.id}
              </h2>

              <span className="text-sm text-white/60">
                Status: {selectedTicket.status}
              </span>

              {/* CHAT */}
              <div className="my-4 max-h-64 overflow-y-auto space-y-2">

                {messages.map((m: any) => (
                  <div
                    key={m.id}
                    className={`p-2 rounded ${
                      m.sender === "admin"
                        ? "bg-green-500/20 text-right"
                        : "bg-white/10"
                    }`}
                  >
                    {m.message}
                  </div>
                ))}

              </div>

              {/* REPLY */}
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                className="w-full p-2 bg-white/5 border rounded"
                placeholder="Reply..."
              />

              <div className="flex justify-between mt-3">

                <button
                  onClick={closeTicket}
                  className="text-red-400"
                >
                  Close Ticket
                </button>

                <button
                  onClick={sendReply}
                  className="bg-purple-600 px-4 py-1 rounded"
                >
                  Send Reply
                </button>

              </div>

            </div>
          )}

        </div>

      </div>

    </div>
  );
}
