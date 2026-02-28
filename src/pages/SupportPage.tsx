import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Headphones, Plus, Send, ArrowLeft, Clock, CheckCircle, XCircle, MessageSquare } from "lucide-react";
import LoginRequiredModal from "@/components/LoginRequiredModal";

interface Ticket {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface TicketMessage {
  id: string;
  sender_type: string;
  message: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  open: { label: "Aberto", icon: Clock, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  answered: { label: "Respondido", icon: MessageSquare, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  closed: { label: "Fechado", icon: CheckCircle, color: "text-green-400 bg-green-500/10 border-green-500/20" },
};

const SupportPage = () => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [creating, setCreating] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [hasNewFromSupport, setHasNewFromSupport] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) fetchTickets();
  }, [session]);

  // Realtime for ticket updates
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel("user-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => fetchTickets())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages" }, (payload) => {
        const msg = payload.new as any;
        if (msg.sender_type === "admin") {
          setHasNewFromSupport(true);
          if (selectedTicket && msg.ticket_id === selectedTicket.id) {
            setMessages((prev) => [...prev, msg as TicketMessage]);
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, selectedTicket]);

  const fetchTickets = async () => {
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
      .order("updated_at", { ascending: false });
    setTickets((data as any as Ticket[]) || []);
    // Check if any ticket has "answered" status
    const hasAnswered = (data || []).some((t: any) => t.status === "answered");
    setHasNewFromSupport(hasAnswered);
  };

  const fetchMessages = async (ticketId: string) => {
    const { data } = await supabase
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setMessages((data as any as TicketMessage[]) || []);
  };

  const openTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    await fetchMessages(ticket.id);
    // If ticket was "answered", mark back as open since user is reading
  };

  const createTicket = async () => {
    if (!newSubject.trim() || !newMessage.trim() || !session) return;
    setSending(true);
    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .insert({ user_id: session.user.id, user_email: session.user.email, subject: newSubject.trim(), status: "open" } as any)
      .select()
      .single();

    if (ticket && !error) {
      await supabase.from("ticket_messages").insert({
        ticket_id: (ticket as any).id,
        sender_type: "user",
        message: newMessage.trim(),
      } as any);
      setCreating(false);
      setNewSubject("");
      setNewMessage("");
      await fetchTickets();
    }
    setSending(false);
  };

  const sendReply = async () => {
    if (!replyText.trim() || !selectedTicket || !session) return;
    setSending(true);
    await supabase.from("ticket_messages").insert({
      ticket_id: selectedTicket.id,
      sender_type: "user",
      message: replyText.trim(),
    } as any);
    // Update ticket status to open (user replied)
    await supabase.from("support_tickets").update({ status: "open" } as any).eq("id", selectedTicket.id);
    setReplyText("");
    await fetchMessages(selectedTicket.id);
    setSending(false);
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not logged in
  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-sm space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <Headphones className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-bold">Suporte</h1>
          <p className="text-muted-foreground text-sm">Faça login para abrir um ticket de suporte e falar com nossa equipe.</p>
          <button
            onClick={() => setShowLoginModal(true)}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all"
          >
            Entrar / Criar conta
          </button>
        </div>
        {showLoginModal && <LoginRequiredModal onClose={() => setShowLoginModal(false)} />}
      </div>
    );
  }

  // Viewing a ticket
  if (selectedTicket) {
    const status = STATUS_LABELS[selectedTicket.status] || STATUS_LABELS.open;
    const StatusIcon = status.icon;
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto p-4 pt-20 pb-32 space-y-4">
          <button onClick={() => { setSelectedTicket(null); fetchTickets(); }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>

          <div className="flex items-center justify-between">
            <h1 className="font-display text-xl font-bold">{selectedTicket.subject}</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${status.color} flex items-center gap-1.5`}>
              <StatusIcon className="w-3 h-3" />
              {status.label}
            </span>
          </div>

          {/* Messages */}
          <div className="space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender_type === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.sender_type === "user"
                    ? "bg-primary/15 border border-primary/20"
                    : "bg-card border border-white/10"
                }`}>
                  <p className="text-xs font-semibold mb-1 text-muted-foreground">
                    {msg.sender_type === "user" ? "Você" : "⚡ Suporte"}
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-1">{formatDate(msg.created_at)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Reply input */}
          {selectedTicket.status !== "closed" && (
            <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-xl border-t border-white/10 p-4 safe-area-bottom">
              <div className="max-w-2xl mx-auto flex gap-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
                  onKeyDown={(e) => e.key === "Enter" && sendReply()}
                />
                <button
                  onClick={sendReply}
                  disabled={!replyText.trim() || sending}
                  className="h-11 w-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {selectedTicket.status === "closed" && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500/50" />
              Este ticket foi encerrado pelo suporte.
            </div>
          )}
        </div>
      </div>
    );
  }

  // Ticket list
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 pt-20 pb-32 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <Headphones className="w-7 h-7 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-bold">Suporte</h1>
          <p className="text-sm text-muted-foreground">Precisa de ajuda? Abra um ticket e nossa equipe irá te responder.</p>
        </div>

        {/* Create ticket */}
        {creating ? (
          <div className="bg-card/50 border border-white/10 rounded-2xl p-5 space-y-4 animate-in fade-in duration-200">
            <input
              type="text"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder="Assunto do ticket"
              className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
              maxLength={100}
            />
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Descreva seu problema em detalhes..."
              className="w-full h-32 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm resize-none focus:outline-none focus:border-primary/50"
              maxLength={1000}
            />
            <div className="flex gap-2">
              <button onClick={() => { setCreating(false); setNewSubject(""); setNewMessage(""); }} className="flex-1 h-10 rounded-xl border border-white/10 text-sm hover:bg-white/5">
                Cancelar
              </button>
              <button
                onClick={createTicket}
                disabled={!newSubject.trim() || !newMessage.trim() || sending}
                className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
              >
                {sending ? "Enviando..." : "Enviar Ticket"}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-primary/10 border border-primary/20 text-primary font-semibold hover:bg-primary/20 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Abrir novo ticket
          </button>
        )}

        {/* Ticket list */}
        {tickets.length > 0 ? (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Seus tickets</h2>
            {tickets.map((t) => {
              const st = STATUS_LABELS[t.status] || STATUS_LABELS.open;
              const StIcon = st.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => openTicket(t)}
                  className="w-full text-left p-4 rounded-xl bg-card/50 border border-white/10 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {t.status === "answered" && (
                          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        )}
                        <span className="font-semibold text-sm truncate">{t.subject}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(t.created_at)}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border flex items-center gap-1 ${st.color}`}>
                      <StIcon className="w-3 h-3" />
                      {st.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground">
            <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum ticket aberto ainda</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportPage;
