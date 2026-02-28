import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Headphones, X, Send, CheckCircle, Clock, MessageSquare, XCircle, Paperclip, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

interface Ticket {
  id: string;
  user_id: string;
  user_email: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface TicketMessage {
  id: string;
  sender_type: string;
  message: string;
  attachment_url: string | null;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  open: { label: "Aberto", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  answered: { label: "Respondido", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  closed: { label: "Fechado", color: "text-green-400 bg-green-500/10 border-green-500/20" },
};

const TicketsPage = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "answered" | "closed" | "all">("open");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [userDisplayNames, setUserDisplayNames] = useState<Record<string, string>>({});
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchTickets = async () => {
    setLoading(true);
    let query = supabase
      .from("support_tickets")
      .select("*")
      .order("updated_at", { ascending: false });

    if (filter !== "all") query = query.eq("status", filter);

    const { data } = await query.limit(200);
    const ticketList = (data as any as Ticket[]) || [];
    setTickets(ticketList);
    setLoading(false);

    // Fetch display names for all unique user_ids
    const userIds = [...new Set(ticketList.map((t) => t.user_id))];
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .in("user_id", userIds);
      if (profiles) {
        const map: Record<string, string> = {};
        profiles.forEach((p: any) => {
          map[p.user_id] = p.display_name || p.email?.split("@")[0] || "Usuário";
        });
        setUserDisplayNames(map);
      }
    }
  };

  const fetchMessages = async (ticketId: string) => {
    const { data } = await supabase
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setMessages((data as any as TicketMessage[]) || []);
  };

  useEffect(() => { fetchTickets(); }, [filter]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("admin-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => fetchTickets())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages" }, (payload) => {
        const msg = payload.new as any;
        if (selected && msg.ticket_id === selected.id) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg as TicketMessage];
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [filter, selected]);

  // Auto scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const openTicket = async (ticket: Ticket) => {
    setSelected(ticket);
    await fetchMessages(ticket.id);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.size > 5 * 1024 * 1024) return;
    setAttachFile(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setAttachPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setAttachPreview(null);
    }
  };

  const clearAttach = () => {
    setAttachFile(null);
    setAttachPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `admin/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("ticket-attachments").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) {
        console.error("[Upload]", error);
        toast.error("Falha ao enviar arquivo");
        return null;
      }
      const { data } = supabase.storage.from("ticket-attachments").getPublicUrl(path);
      return data.publicUrl;
    } catch (err) {
      console.error("[Upload]", err);
      toast.error("Falha ao enviar arquivo");
      return null;
    }
  };

  const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp|avif|svg|bmp)/i.test(url) || url.includes("/ticket-attachments/") && /image/i.test(url);

  const sendReply = async () => {
    if ((!replyText.trim() && !attachFile) || !selected) return;
    setSending(true);

    let attachUrl: string | null = null;
    if (attachFile) {
      attachUrl = await uploadFile(attachFile);
      if (!attachUrl) {
        setSending(false);
        return; // upload failed
      }
    }

    await supabase.from("ticket_messages").insert({
      ticket_id: selected.id,
      sender_type: "admin",
      message: replyText.trim() || "📎 Anexo",
      ...(attachUrl ? { attachment_url: attachUrl } : {}),
    } as any);
    await supabase.from("support_tickets").update({ status: "answered" } as any).eq("id", selected.id);
    setReplyText("");
    clearAttach();
    await fetchMessages(selected.id);
    toast.success("Resposta enviada!");
    setSending(false);
  };

  const closeTicket = async (ticket: Ticket) => {
    await supabase.from("support_tickets").update({ status: "closed" } as any).eq("id", ticket.id);
    toast.success(`Ticket "${ticket.subject}" fechado!`);
    setSelected(null);
    fetchTickets();
  };

  const reopenTicket = async (ticket: Ticket) => {
    await supabase.from("support_tickets").update({ status: "open" } as any).eq("id", ticket.id);
    toast.success("Ticket reaberto!");
    fetchTickets();
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("pt-BR") + " " + date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const openCount = tickets.filter((t) => t.status === "open").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Tickets de Suporte</h1>
          <p className="text-muted-foreground text-sm">Tickets abertos pelos usuários</p>
        </div>
        {openCount > 0 && (
          <span className="px-3 py-1.5 rounded-xl bg-primary/20 text-primary text-sm font-semibold border border-primary/30">
            {openCount} aberto{openCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(["open", "answered", "closed", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === f
                ? "bg-primary/15 text-primary border border-primary/20"
                : "bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10"
            }`}
          >
            {f === "open" ? "Abertos" : f === "answered" ? "Respondidos" : f === "closed" ? "Fechados" : "Todos"}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Headphones className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum ticket encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => {
            const st = STATUS_MAP[t.status] || STATUS_MAP.open;
            const displayName = userDisplayNames[t.user_id] || t.user_email?.split("@")[0];
            return (
              <button
                key={t.id}
                onClick={() => openTicket(t)}
                className="w-full text-left p-4 rounded-xl bg-card/50 border border-white/10 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.status === "open" ? "bg-amber-500" : t.status === "answered" ? "bg-blue-500" : "bg-green-500"}`} />
                      <span className="font-semibold text-sm truncate">{t.subject}</span>
                    </div>
                    <p className="text-muted-foreground text-xs">{displayName} • {t.user_email}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${st.color}`}>
                      {st.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap hidden sm:block">{formatDate(t.created_at)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-card border border-white/10 rounded-2xl flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-lg font-bold truncate">{selected.subject}</h3>
                <p className="text-xs text-muted-foreground">
                  {userDisplayNames[selected.user_id] || selected.user_email?.split("@")[0]} • {selected.user_email} • {formatDate(selected.created_at)}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground flex-shrink-0 ml-3">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-[200px]">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender_type === "admin" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.sender_type === "admin"
                      ? "bg-primary/15 border border-primary/20"
                      : "bg-white/5 border border-white/10"
                  }`}>
                    <p className="text-xs font-semibold mb-1 text-muted-foreground">
                      {msg.sender_type === "admin" ? "⚡ Support" : (userDisplayNames[selected.user_id] || "Usuário")}
                    </p>
                    {msg.attachment_url && isImage(msg.attachment_url) && (
                      <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="block mb-2">
                        <img src={msg.attachment_url} alt="Anexo" className="max-w-full max-h-48 rounded-xl object-cover" loading="lazy" />
                      </a>
                    )}
                    {msg.attachment_url && !isImage(msg.attachment_url) && (
                      <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline mb-2">
                        <Paperclip className="w-3 h-3" /> Abrir anexo
                      </a>
                    )}
                    {msg.message && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message}</p>}
                    <p className="text-[10px] text-muted-foreground/50 mt-1">{formatDate(msg.created_at)}</p>
                  </div>
                </div>
              ))}
              {messages.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">Nenhuma mensagem ainda</p>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-white/10 space-y-3">
              {selected.status !== "closed" && (
                <>
                  {attachFile && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                      {attachPreview ? (
                        <img src={attachPreview} alt="Preview" className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <Paperclip className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className="text-xs text-muted-foreground truncate flex-1">{attachFile.name}</span>
                      <button onClick={clearAttach} className="text-muted-foreground hover:text-foreground">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*,.pdf,.doc,.docx" className="hidden" />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors flex-shrink-0"
                    >
                      <ImageIcon className="w-4 h-4" />
                    </button>
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Responder ao ticket..."
                      className="flex-1 h-10 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendReply()}
                    />
                    <button
                      onClick={sendReply}
                      disabled={(!replyText.trim() && !attachFile) || sending}
                      className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 flex-shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
              <div className="flex gap-2">
                {selected.status !== "closed" ? (
                  <button
                    onClick={() => closeTicket(selected)}
                    className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-semibold hover:bg-green-500/30"
                  >
                    <XCircle className="w-4 h-4" />
                    Fechar Ticket
                  </button>
                ) : (
                  <button
                    onClick={() => reopenTicket(selected)}
                    className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 text-sm font-semibold hover:bg-amber-500/30"
                  >
                    <Clock className="w-4 h-4" />
                    Reabrir
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketsPage;
