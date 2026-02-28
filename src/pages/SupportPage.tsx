import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Headphones, Plus, Send, ArrowLeft, Clock, CheckCircle, MessageSquare, Paperclip, Image as ImageIcon, X, HelpCircle, Mail } from "lucide-react";
import { toast } from "sonner";

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
  answered: { label: "Respondido", icon: MessageSquare, color: "text-primary bg-primary/10 border-primary/20" },
  closed: { label: "Fechado", icon: CheckCircle, color: "text-green-400 bg-green-500/10 border-green-500/20" },
};

const isImage = (url: string): boolean => {
  if (!url) return false;
  if (/\.(jpg|jpeg|png|gif|webp|avif|svg|bmp)/i.test(url)) return true;
  if (url.includes("/ticket-attachments/")) return true;
  return false;
};

const FAQ_ITEMS = [
  { q: "Como adicionar à minha lista?", a: "Na página do filme/série, clique no botão '+' ou 'Minha Lista'." },
  { q: "O vídeo não carrega, o que fazer?", a: "Tente trocar o servidor de reprodução ou limpar o cache do navegador." },
  { q: "Como importar lista de um amigo?", a: "Vá em Minha Lista > Importar e cole o código de compartilhamento." },
  { q: "Como mudar meu perfil/avatar?", a: "Acesse a tela de perfis e clique no ícone de edição." },
];

const SupportPage = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
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
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replyFileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auth guard
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      if (!s) { navigate("/conta", { replace: true }); return; }
      setSession(s);
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!mounted) return;
      if (!s) { navigate("/conta", { replace: true }); return; }
      setSession(s);
      setAuthChecked(true);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [navigate]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("lyneflix_active_profile");
      if (raw) { const p = JSON.parse(raw); if (p.name) setProfileName(p.name); }
    } catch {}
  }, []);

  const fetchTickets = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("user_id", session.user.id)
      .order("updated_at", { ascending: false });
    setTickets((data as any as Ticket[]) || []);
  }, [session]);

  useEffect(() => { if (session) fetchTickets(); }, [session, fetchTickets]);

  const fetchMessages = useCallback(async (ticketId: string) => {
    const { data } = await supabase
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setMessages((data as any as TicketMessage[]) || []);
  }, []);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`support-rt-${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: `user_id=eq.${session.user.id}` }, (payload) => {
        fetchTickets();
        if (selectedTicket && (payload.new as any)?.id === selectedTicket.id) {
          setSelectedTicket((prev) => prev ? { ...prev, ...(payload.new as any) } : prev);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages" }, (payload) => {
        const msg = payload.new as any;
        if (selectedTicket && msg.ticket_id === selectedTicket.id) {
          setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg as TicketMessage]);
        }
        fetchTickets();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, selectedTicket, fetchTickets]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const openTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    await fetchMessages(ticket.id);
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    if (!session) return null;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${session.user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("ticket-attachments").upload(path, file, { contentType: file.type, upsert: false });
      if (error) { toast.error("Falha ao enviar arquivo"); return null; }
      const { data } = supabase.storage.from("ticket-attachments").getPublicUrl(path);
      return data.publicUrl;
    } catch { toast.error("Erro no upload"); return null; } finally { setUploading(false); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Arquivo máximo: 5MB"); return; }
    setAttachFile(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setAttachPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else { setAttachPreview(null); }
  };

  const clearAttach = () => {
    setAttachFile(null); setAttachPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (replyFileRef.current) replyFileRef.current.value = "";
  };

  const createTicket = async () => {
    if (!newSubject.trim() || !newMessage.trim() || !session) return;
    setSending(true);
    try {
      const { data: ticket, error } = await supabase
        .from("support_tickets")
        .insert({ user_id: session.user.id, user_email: session.user.email, subject: newSubject.trim(), status: "open" } as any)
        .select().single();
      if (error || !ticket) { toast.error("Erro ao criar ticket"); setSending(false); return; }
      let attachUrl: string | null = null;
      if (attachFile) attachUrl = await uploadFile(attachFile);
      await supabase.from("ticket_messages").insert({
        ticket_id: (ticket as any).id, sender_type: "user", message: newMessage.trim(),
        ...(attachUrl ? { attachment_url: attachUrl } : {}),
      } as any);
      setCreating(false); setNewSubject(""); setNewMessage(""); clearAttach();
      toast.success("Ticket criado com sucesso!");
      await fetchTickets();
    } catch { toast.error("Erro inesperado"); }
    setSending(false);
  };

  const sendReply = async () => {
    if ((!replyText.trim() && !attachFile) || !selectedTicket || !session) return;
    setSending(true);
    try {
      let attachUrl: string | null = null;
      if (attachFile) { attachUrl = await uploadFile(attachFile); if (!attachUrl) { setSending(false); return; } }
      const { error } = await supabase.from("ticket_messages").insert({
        ticket_id: selectedTicket.id, sender_type: "user", message: replyText.trim() || "📎 Anexo",
        ...(attachUrl ? { attachment_url: attachUrl } : {}),
      } as any);
      if (error) { toast.error("Erro ao enviar"); setSending(false); return; }
      await supabase.from("support_tickets").update({ status: "open" } as any).eq("id", selectedTicket.id);
      setReplyText(""); clearAttach();
    } catch { toast.error("Erro inesperado"); }
    setSending(false);
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  if (!authChecked) {
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
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 max-w-3xl mx-auto w-full p-4 pt-20 pb-44 sm:pb-32 space-y-4">
          <button onClick={() => { setSelectedTicket(null); fetchTickets(); }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>

          <div className="rounded-xl bg-card/40 border border-white/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <h1 className="font-display text-base sm:text-lg font-bold truncate">{selectedTicket.subject}</h1>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${status.color} flex items-center gap-1 flex-shrink-0`}>
                <StatusIcon className="w-3 h-3" />
                {status.label}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Criado em {formatDate(selectedTicket.created_at)}</p>
          </div>

          <div className="space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender_type === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 ${
                  msg.sender_type === "user"
                    ? "bg-primary/10 border border-primary/15"
                    : "bg-card/50 border border-white/10"
                }`}>
                  <p className="text-[10px] font-semibold mb-1 text-muted-foreground">
                    {msg.sender_type === "user" ? (profileName || "Você") : "Equipe Lyneflix"}
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

          {selectedTicket.status === "closed" && (
            <div className="text-center py-6 text-sm text-muted-foreground rounded-xl bg-green-500/5 border border-green-500/10">
              <CheckCircle className="w-6 h-6 mx-auto mb-2 text-green-500/50" />
              Este ticket foi encerrado.
            </div>
          )}
        </div>

        {selectedTicket.status !== "closed" && (
          <div className="fixed bottom-0 left-0 right-0 z-[60] bg-background/95 backdrop-blur-xl border-t border-white/10">
            <div className="max-w-3xl mx-auto px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] mb-[3.75rem] sm:mb-0">
              {attachFile && (
                <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                  {attachPreview ? <img src={attachPreview} alt="Preview" className="w-10 h-10 rounded-lg object-cover" /> : <Paperclip className="w-4 h-4 text-muted-foreground" />}
                  <span className="text-xs text-muted-foreground truncate flex-1">{attachFile.name}</span>
                  <button onClick={clearAttach} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                </div>
              )}
              <div className="flex gap-2">
                <input type="file" ref={replyFileRef} onChange={handleFileSelect} accept="image/*,.pdf,.doc,.docx" capture="environment" className="hidden" />
                <button onClick={() => replyFileRef.current?.click()} className="h-11 w-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors flex-shrink-0">
                  <ImageIcon className="w-4 h-4" />
                </button>
                <input type="text" value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Digite sua mensagem..."
                  className="flex-1 h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                />
                <button onClick={sendReply} disabled={(!replyText.trim() && !attachFile) || sending || uploading}
                  className="h-11 w-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 flex-shrink-0">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Ticket list
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 pt-20 sm:pt-24 pb-32">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center">
            <Headphones className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold">Suporte</h1>
            <p className="text-xs text-muted-foreground">
              {profileName ? `${profileName} · ` : ""}Abra um ticket e nossa equipe irá te responder.
            </p>
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-6">
          <button onClick={() => setExpandedFaq(expandedFaq !== null ? null : 0)} className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-3">
            <HelpCircle className="w-3.5 h-3.5" />
            Perguntas Frequentes
          </button>
          {expandedFaq !== null && (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
              {FAQ_ITEMS.map((faq, i) => (
                <button
                  key={i}
                  onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                  className="w-full text-left rounded-lg bg-card/30 border border-white/5 p-3 hover:bg-card/50 transition-colors"
                >
                  <p className="text-xs font-semibold">{faq.q}</p>
                  {expandedFaq === i && <p className="text-[11px] text-muted-foreground mt-1.5">{faq.a}</p>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Create ticket */}
        {creating ? (
          <div className="rounded-xl bg-card/30 border border-white/10 p-4 sm:p-5 space-y-3 animate-in fade-in duration-200 mb-6">
            <h3 className="font-display text-sm font-bold flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" /> Novo Ticket
            </h3>
            <input type="text" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Assunto"
              className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50" maxLength={100} autoFocus />
            <textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Descreva seu problema..."
              className="w-full h-28 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm resize-none focus:outline-none focus:border-primary/50" maxLength={1000} />
            <div>
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*,.pdf,.doc,.docx" capture="environment" className="hidden" />
              {attachFile ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                  {attachPreview ? <img src={attachPreview} alt="Preview" className="w-10 h-10 rounded-lg object-cover" /> : <Paperclip className="w-4 h-4 text-muted-foreground" />}
                  <span className="text-xs text-muted-foreground truncate flex-1">{attachFile.name}</span>
                  <button onClick={clearAttach} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <Paperclip className="w-3 h-3" /> Anexar arquivo
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setCreating(false); setNewSubject(""); setNewMessage(""); clearAttach(); }}
                className="flex-1 h-9 rounded-lg border border-white/10 text-xs hover:bg-white/5 transition-colors">Cancelar</button>
              <button onClick={createTicket} disabled={!newSubject.trim() || !newMessage.trim() || sending || uploading}
                className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 transition-colors">
                {sending || uploading ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setCreating(true)}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-primary/10 border border-primary/15 text-primary font-medium text-sm hover:bg-primary/15 transition-colors mb-6">
            <Plus className="w-4 h-4" />
            Abrir novo ticket
          </button>
        )}

        {/* Ticket list */}
        {tickets.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Seus Tickets ({tickets.length})</p>
            {tickets.map((t) => {
              const st = STATUS_LABELS[t.status] || STATUS_LABELS.open;
              const StIcon = st.icon;
              return (
                <button key={t.id} onClick={() => openTicket(t)}
                  className="w-full text-left p-3.5 rounded-xl bg-card/30 border border-white/5 hover:bg-card/50 hover:border-white/10 transition-all group">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {t.status === "answered" && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />}
                        <span className="font-medium text-sm truncate group-hover:text-primary transition-colors">{t.subject}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(t.created_at)}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border flex items-center gap-1 flex-shrink-0 ${st.color}`}>
                      <StIcon className="w-2.5 h-2.5" />
                      {st.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 rounded-xl bg-card/20 border border-white/5">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-muted-foreground/20" />
            <p className="text-sm font-medium">Nenhum ticket</p>
            <p className="text-xs text-muted-foreground mt-1">Abra um ticket para receber ajuda.</p>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default SupportPage;
