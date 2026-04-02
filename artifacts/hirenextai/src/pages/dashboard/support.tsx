import { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer
} from "recharts";
import jsPDF from "jspdf";
import { useGetProfile } from "@workspace/api-client-react";

export default function Support() {

  const { data: profile } = useGetProfile();

  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [chatMessage, setChatMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // 🔥 AUTO-FILL USER (WITH FALLBACK)
  useEffect(() => {
    if (profile) {
      console.log("PROFILE:", profile);

      setForm((prev) => ({
        ...prev,
        name: profile?.name || profile?.full_name || "",
        email: profile?.email || "",
      }));

      loadTickets(profile.id);

    } else {
      // fallback (localStorage)
      const user = JSON.parse(localStorage.getItem("user") || "{}");

      if (user?.id) {
        setForm((prev) => ({
          ...prev,
          name: user.name || "",
          email: user.email || "",
        }));

        loadTickets(user.id);
      }
    }
  }, [profile]);

  // 🔥 LOAD TICKETS
  const loadTickets = async (userId:number) => {
    try {
      const res = await fetch(`/api/support/tickets/${userId}`);
      const data = await res.json();
      setTickets(data);
    } catch (err) {
      console.error("Load tickets error", err);
    }
  };

  // 🔥 GRAPH DATA FROM REAL TICKETS
  const chartData = tickets.reduce((acc:any, t:any) => {
    const date = new Date(t.created_at).toLocaleDateString();

    const found = acc.find((d:any) => d.date === date);

    if (found) {
      found.tickets += 1;
    } else {
      acc.push({ date, tickets: 1 });
    }

    return acc;
  }, []);

  // 🔥 OPEN TICKET
  const openTicket = async (ticket:any) => {
    setSelectedTicket(ticket);

    const res = await fetch(`/api/support/messages/${ticket.id}`);
    const data = await res.json();
    setMessages(data);
  };

  // 🔥 CREATE TICKET
  const handleSubmit = async (e:any) => {
    e.preventDefault();

    const userId = profile?.id || JSON.parse(localStorage.getItem("user") || "{}")?.id;

    if (!userId) {
      alert("User not loaded yet");
      return;
    }

    try {
      const res = await fetch("/api/support/ticket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          user_id: userId,
          subject: form.subject,
          message: form.message
        })
      });

      const data = await res.json();
      console.log("TICKET:", data);

      loadTickets(userId);

      setForm((prev)=>({
        ...prev,
        subject: "",
        message: ""
      }));

    } catch (err) {
      console.error(err);
      alert("Failed to submit ticket");
    }
  };

  // 🔥 SEND MESSAGE
  const sendMessage = async () => {
    if (!chatMessage) return;

    await fetch("/api/support/message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ticket_id: selectedTicket.id,
        message: chatMessage,
        sender: "user"
      })
    });

    setChatMessage("");
    openTicket(selectedTicket);
  };

  // 🔥 CLOSE TICKET
  const closeTicket = async () => {
    await fetch("/api/support/close", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ticket_id: selectedTicket.id
      })
    });

    setSelectedTicket(null);
    loadTickets(profile?.id);
  };

  // 📄 DOWNLOAD PDF
  const downloadPDF = () => {
    const doc = new jsPDF();

    doc.text(`Ticket #${selectedTicket.id}`, 10, 10);

    messages.forEach((m, i) => {
      doc.text(`${m.sender}: ${m.message}`, 10, 20 + i * 10);
    });

    doc.save(`ticket-${selectedTicket.id}.pdf`);
  };

  return (
    <div className="p-6 text-white">

      {/* HEADER */}
      <div className="text-center mb-10 relative">
        <div className="absolute inset-0 blur-3xl opacity-20 bg-purple-600 rounded-full"></div>

        <h1 className="text-4xl font-bold relative z-10">
          Support Center
        </h1>

        <p className="text-white/60 mt-2 relative z-10">
          Raise a ticket and chat with our team
        </p>
      </div>

      {/* TOP */}
      <div className="grid lg:grid-cols-2 gap-8">

        {/* LEFT */}
        <div className="glass-card p-6">

          {!selectedTicket ? (

            <form onSubmit={handleSubmit} className="space-y-4">

              <input value={form.name || "Loading..."} disabled className="w-full p-3 bg-white/5 border rounded"/>
              <input value={form.email || "Loading..."} disabled className="w-full p-3 bg-white/5 border rounded"/>

              <input
                placeholder="Subject"
                required
                value={form.subject}
                onChange={(e)=>setForm({...form, subject:e.target.value})}
                className="w-full p-3 bg-white/5 border rounded"
              />

              <textarea
                placeholder="Message"
                required
                value={form.message}
                onChange={(e)=>setForm({...form, message:e.target.value})}
                className="w-full p-3 bg-white/5 border rounded"
              />

              <label className="cursor-pointer text-sm">
                ➕ Attach file
                <input type="file" hidden onChange={(e)=>setFile(e.target.files?.[0]||null)} />
              </label>

              {file && <p className="text-green-400 text-xs">{file.name}</p>}

              <button className="bg-purple-600 w-full py-2 rounded">
                Submit Ticket
              </button>

            </form>

          ) : (

            <div>

              <h2>Ticket #{selectedTicket.id}</h2>

              <span className="text-green-400 text-sm">
                ● {selectedTicket.status}
              </span>

              <div className="space-y-2 my-4 max-h-60 overflow-y-auto">

                {messages.map((m:any)=>(
                  <div
                    key={m.id}
                    className={`p-2 rounded ${
                      m.sender==="user"
                        ? "bg-purple-500/20 text-right"
                        : "bg-white/10"
                    }`}
                  >
                    {m.message}
                  </div>
                ))}

              </div>

              <textarea
                value={chatMessage}
                onChange={(e)=>setChatMessage(e.target.value)}
                className="w-full p-2 bg-white/5 border rounded"
              />

              <div className="flex justify-between mt-2">

                <label className="cursor-pointer text-sm">
                  ➕ Attach
                  <input type="file" hidden />
                </label>

                <button onClick={sendMessage} className="bg-purple-600 px-4 py-1 rounded">
                  Send
                </button>

              </div>

              <div className="flex justify-between mt-4">

                <button onClick={closeTicket} className="text-red-400 text-sm">
                  Close Ticket
                </button>

                <button onClick={downloadPDF} className="text-purple-400 text-sm">
                  Download PDF
                </button>

              </div>

            </div>

          )}

        </div>

        {/* RIGHT GRAPH */}
        <div className="glass-card p-6">

          <h3 className="mb-4">Ticket Activity</h3>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="date" stroke="#aaa"/>
                <YAxis stroke="#aaa"/>
                <Tooltip/>
                <Line type="monotone" dataKey="tickets" stroke="#a855f7" strokeWidth={3}/>
              </LineChart>
            </ResponsiveContainer>
          </div>

        </div>

      </div>

      {/* TICKETS */}
      <div className="mt-16">

        <h2>Your Tickets</h2>

        <div className="space-y-3 mt-4">

          {tickets.map((t)=>(
            <div
              key={t.id}
              onClick={()=>openTicket(t)}
              className="glass-card p-4 flex justify-between cursor-pointer"
            >
              <span>#{t.id} — {t.subject}</span>

              <span className={
                t.status==="open"
                  ? "text-green-400"
                  : t.status==="answered"
                  ? "text-yellow-400"
                  : "text-red-400"
              }>
                ● {t.status}
              </span>

            </div>
          ))}

        </div>

      </div>

    </div>
  );
}
