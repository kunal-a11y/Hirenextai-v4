import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { Loader2, MessageSquare, Send } from "lucide-react";

type TicketStatus = "open" | "in_progress" | "resolved";
type TicketCategory = "bug" | "payment" | "account" | "general";

interface Ticket {
  id: number;
  subject: string;
  message: string;
  status: TicketStatus;
  createdAt: string;
  category: TicketCategory;
}

interface TicketMessage {
  id: number;
  sender: "user" | "admin";
  message: string;
  createdAt: string;
}

const API = import.meta.env.VITE_API_URL ?? "/api";
const TEXT = {
  en: {
    title: "Support Center",
    subtitle: "Submit issues, track status, and chat with support.",
    create: "Create Ticket",
    monthly: "Monthly Tickets",
    yourTickets: "Your Tickets",
    conversation: "Conversation",
    submit: "Submit Ticket",
    loading: "Loading tickets...",
    empty: "No tickets yet.",
    selectTicket: "Select a ticket to view thread.",
    reply: "Reply...",
    resolve: "Mark as Resolved",
  },
  hi: {
    title: "सपोर्ट सेंटर",
    subtitle: "समस्या भेजें, स्थिति ट्रैक करें और सपोर्ट से चैट करें।",
    create: "टिकट बनाएं",
    monthly: "मासिक टिकट",
    yourTickets: "आपके टिकट",
    conversation: "वार्तालाप",
    submit: "टिकट सबमिट करें",
    loading: "टिकट लोड हो रहे हैं...",
    empty: "अभी कोई टिकट नहीं है।",
    selectTicket: "थ्रेड देखने के लिए टिकट चुनें।",
    reply: "जवाब लिखें...",
    resolve: "Resolved चिह्नित करें",
  }
} as const;

export default function Support() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [reply, setReply] = useState("");
  const [form, setForm] = useState({ subject: "", message: "", category: "bug" as TicketCategory });
  const lang = (localStorage.getItem("hirenext_lang") === "hi" ? "hi" : "en") as "en" | "hi";
  const t = TEXT[lang];

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const loadTickets = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/support/tickets`, { headers });
      if (!res.ok) throw new Error();
      setTickets(await res.json());
    } catch {
      toast({ title: "Failed to load support tickets", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const openTicket = async (ticket: Ticket) => {
    setSelected(ticket);
    try {
      const res = await fetch(`${API}/support/tickets/${ticket.id}/messages`, { headers });
      if (!res.ok) throw new Error();
      setMessages(await res.json());
    } catch {
      toast({ title: "Failed to load ticket thread", variant: "destructive" });
    }
  };

  useEffect(() => { loadTickets(); }, [token]);

  const monthlyData = useMemo(() => {
    const map = new Map<string, number>();
    tickets.forEach((t) => {
      const key = new Date(t.createdAt).toLocaleDateString("en-US", { month: "short" });
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([month, count]) => ({ month, count }));
  }, [tickets]);

  const submitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/support/tickets`, {
        method: "POST",
        headers,
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Ticket created", description: "Support will respond shortly." });
      setForm({ subject: "", message: "", category: "bug" });
      loadTickets();
    } catch {
      toast({ title: "Could not create ticket", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    try {
      const res = await fetch(`${API}/support/tickets/${selected.id}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify({ sender: "user", message: reply.trim() }),
      });
      if (!res.ok) throw new Error();
      setReply("");
      openTicket(selected);
    } catch {
      toast({ title: "Failed to send message", variant: "destructive" });
    }
  };

  const closeTicket = async () => {
    if (!selected) return;
    try {
      const res = await fetch(`${API}/support/tickets/${selected.id}/status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "resolved" }),
      });
      if (!res.ok) throw new Error();
      setSelected({ ...selected, status: "resolved" });
      loadTickets();
    } catch {
      toast({ title: "Failed to close ticket", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{t.title}</h1>
        <p className="text-sm text-white/50">{t.subtitle}</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="glass-card lg:col-span-1">
          <CardHeader><CardTitle>{t.create}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submitTicket} className="space-y-3">
              <Select value={form.category} onValueChange={(value) => setForm((p) => ({ ...p, category: value as TicketCategory }))}>
                <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="account">Account</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Subject" value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} />
              <Textarea placeholder="Describe your issue" value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))} />
              <Button disabled={submitting} className="w-full">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t.submit}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="glass-card lg:col-span-2">
          <CardHeader><CardTitle>{t.monthly}</CardTitle></CardHeader>
          <CardContent className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <XAxis dataKey="month" stroke="rgba(255,255,255,0.45)" />
                <YAxis stroke="rgba(255,255,255,0.45)" allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#7C3AED" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="glass-card">
          <CardHeader><CardTitle>{t.yourTickets}</CardTitle></CardHeader>
          <CardContent className="space-y-3 max-h-[420px] overflow-y-auto">
            {loading ? <p className="text-white/40 text-sm">{t.loading}</p> : tickets.length === 0 ? <p className="text-white/40 text-sm">{t.empty}</p> : tickets.map((ticket) => (
              <button key={ticket.id} onClick={() => openTicket(ticket)} className="w-full text-left p-3 rounded-xl border border-white/10 hover:bg-white/5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-white truncate">{ticket.subject}</p>
                  <Badge variant="outline" className="capitalize">{ticket.status.replace("_", " ")}</Badge>
                </div>
                <p className="text-xs text-white/50 mt-1 capitalize">{ticket.category} • {new Date(ticket.createdAt).toLocaleDateString()}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader><CardTitle>{selected ? `Ticket #${selected.id}` : t.conversation}</CardTitle></CardHeader>
          <CardContent>
            {!selected ? <p className="text-white/40 text-sm">{t.selectTicket}</p> : (
              <div className="space-y-3">
                <div className="max-h-[280px] overflow-y-auto space-y-2">
                  {messages.map((m) => (
                    <div key={m.id} className={`p-2.5 rounded-lg text-sm ${m.sender === "user" ? "bg-primary/20 text-white ml-8" : "bg-white/10 text-white mr-8"}`}>
                      {m.message}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t.reply} />
                  <Button onClick={sendReply} size="icon"><Send className="w-4 h-4" /></Button>
                </div>
                {selected.status !== "resolved" && (
                  <Button variant="outline" onClick={closeTicket} className="w-full">{t.resolve}</Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
