import { useState } from "react";
import { X, Flag, Send, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ReportModalProps {
  tmdbId: number;
  contentType: "movie" | "tv";
  title: string;
  onClose: () => void;
}

const ReportModal = ({ tmdbId, contentType, title, onClose }: ReportModalProps) => {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const getVisitorId = (): string => {
    let vid = localStorage.getItem("_cf_vid");
    if (!vid) {
      vid = crypto.randomUUID();
      localStorage.setItem("_cf_vid", vid);
    }
    return vid;
  };

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const { error } = await supabase.from("content_reports" as any).insert({
        tmdb_id: tmdbId,
        content_type: contentType === "tv" ? "series" : "movie",
        title,
        message: message.trim(),
        visitor_id: getVisitorId(),
        page_url: window.location.href,
      });
      if (error) throw error;
      setSent(true);
    } catch {
      toast.error("Erro ao enviar relatório. Tente novamente.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-card/95 backdrop-blur-xl border border-white/10 rounded-2xl p-6 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-5 h-5" />
        </button>

        {sent ? (
          <div className="text-center py-6">
            <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
            <h3 className="font-display text-xl font-bold mb-2">Relatório Enviado!</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Obrigado por nos ajudar a melhorar. Nossa equipe irá analisar o problema.
            </p>
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">
              Fechar
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center">
                <Flag className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold">Reportar Problema</h3>
                <p className="text-muted-foreground text-xs">{title}</p>
              </div>
            </div>

            <p className="text-muted-foreground text-sm mb-4">
              Descreva o problema encontrado (vídeo não carrega, áudio errado, legenda faltando, etc.)
            </p>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Descreva o problema aqui..."
              rows={4}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />

            <button
              onClick={handleSubmit}
              disabled={!message.trim() || sending}
              className="w-full mt-4 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {sending ? (
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {sending ? "Enviando..." : "Enviar Relatório"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ReportModal;
