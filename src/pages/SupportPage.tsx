import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Headphones, Plus, Send, ArrowLeft, Clock, CheckCircle, MessageSquare, Paperclip, Image as ImageIcon, X } from "lucide-react";

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
  attachment_url: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  open: { label: "Aberto", icon: Clock, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  answered: { label: "Respondido", icon: MessageSquare, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  closed: { label: "Fechado", icon: CheckCircle, color: "text-green-400 bg-green-500/10 border-green-500/20" },
};

const SupportPage = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [creating, setCreating] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) {
        navigate("/conta");
        return;
      }
      setSession(s);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) {
        navigate("/conta");
        return;
      }
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  // Load active profile name
  useEffect(() => {
    try {
      const raw = localStorage.getItem("lyneflix_active_profile");
      if (raw) {
        const p = JSON.parse(raw);
        if (p.name) setProfileName(p.name);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (session) fetchTickets();
  }, [session]);

  // Realtime
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel("user-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => fetchTickets())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages" }, (payload) => {
        const msg = payload.new as any;
        if (selectedTicket && msg.ticket_id === selectedTicket.id) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg as TicketMessage];
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, selectedTicket]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchTickets = async () => {
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
      .order("updated_at", { ascending: false });
    setTickets((data as any as Ticket[]) || []);
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
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${session.user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("ticket-attachments").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) {
        console.error("[Upload]", error);
        return null;
      }
      const { data } = supabase.storage.from("ticket-attachments").getPublicUrl(path);
      return data.publicUrl;
    } catch (err) {
      console.error("[Upload]", err);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return; // 5MB max
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

  const createTicket = async () => {
    if (!newSubject.trim() || !newMessage.trim() || !session) return;
    setSending(true);
    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .insert({ user_id: session.user.id, user_email: session.user.email, subject: newSubject.trim(), status: "open" } as any)
      .select()
      .single();

    if (ticket && !error) {
      let attachUrl: string | null = null;
      if (attachFile) {
        attachUrl = await uploadFile(attachFile);
        // If upload failed, still create ticket but without attachment
      }

      await supabase.from("ticket_messages").insert({
        ticket_id: (ticket as any).id,
        sender_type: "user",
        message: newMessage.trim(),
        ...(attachUrl ? { attachment_url: attachUrl } : {}),
      } as any);
      setCreating(false);
      setNewSubject("");
      setNewMessage("");
      clearAttach();
      await fetchTickets();
    }
    setSending(false);
  };

  const sendReply = async () => {
    if ((!replyText.trim() && !attachFile) || !selectedTicket || !session) return;
    setSending(true);

    let attachUrl: string | null = null;
    if (attachFile) {
      attachUrl = await uploadFile(attachFile);
      if (!attachUrl) {
        setSending(false);
        return; // upload failed, don't send
      }
    }

    await supabase.from("ticket_messages").insert({
      ticket_id: selectedTicket.id,
      sender_type: "user",
      message: replyText.trim() || "📎 Anexo",
      ...(attachUrl ? { attachment_url: attachUrl } : {}),
    } as any);
    await supabase.from("support_tickets").update({ status: "open" } as any).eq("id", selectedTicket.id);
    setReplyText("");
    clearAttach();
    await fetchMessages(selectedTicket.id);
    setSending(false);
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp|avif|svg|bmp)/i.test(url) || url.includes("/ticket-attachments/") && /image/i.test(url);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
                <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 ${
                  msg.sender_type === "user"
                    ? "bg-primary/15 border border-primary/20"
                    : "bg-card border border-white/10"
                }`}>
                  <p className="text-xs font-semibold mb-1 text-muted-foreground">
                    {msg.sender_type === "user" ? (profileName || "Você") : "⚡ Support"}
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
            <div ref={messagesEndRef} />
          </div>

          {/* Reply input */}
          {selectedTicket.status !== "closed" && (
            <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-xl border-t border-white/10 p-4 z-[60] pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-4 mb-16 md:mb-0">
              {attachFile && (
                <div className="max-w-2xl mx-auto mb-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
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
              <div className="max-w-2xl mx-auto flex gap-2">
                <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*,.pdf,.doc,.docx" className="hidden" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="h-11 w-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors flex-shrink-0"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendReply()}
                />
                <button
                  onClick={sendReply}
                  disabled={(!replyText.trim() && !attachFile) || sending || uploading}
                  className="h-11 w-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 flex-shrink-0"
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
          <h1 className="font-display text-2xl font-bold">Lyneflix - Support</h1>
          <p className="text-sm text-muted-foreground">
            {profileName ? `Olá, ${profileName}! ` : ""}Precisa de ajuda? Abra um ticket e nossa equipe irá te responder.
          </p>
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
            {/* File attach on create */}
            <div>
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*,.pdf,.doc,.docx" className="hidden" />
              {attachFile ? (
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
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Paperclip className="w-3.5 h-3.5" /> Anexar arquivo (opcional)
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setCreating(false); setNewSubject(""); setNewMessage(""); clearAttach(); }} className="flex-1 h-10 rounded-xl border border-white/10 text-sm hover:bg-white/5">
                Cancelar
              </button>
              <button
                onClick={createTicket}
                disabled={!newSubject.trim() || !newMessage.trim() || sending || uploading}
                className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
              >
                {sending || uploading ? "Enviando..." : "Enviar Ticket"}
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
                          <span className="w-2 h-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
                        )}
                        <span className="font-semibold text-sm truncate">{t.subject}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(t.created_at)}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border flex items-center gap-1 flex-shrink-0 ${st.color}`}>
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
