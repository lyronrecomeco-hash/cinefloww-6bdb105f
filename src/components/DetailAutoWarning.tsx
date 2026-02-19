import { useState, useEffect } from "react";
import { X, ExternalLink } from "lucide-react";
import LyneflixLogo from "@/components/LyneflixLogo";

const WARNINGS = [
  {
    id: "site_new",
    title: "🆕 Site em construção",
    message: "A LyneFlix está adicionando conteúdos diariamente.\n\nSe este título não carregar, pode reportar — nossa equipe resolve rápido!",
    button_text: "Entendi",
    intervalHours: 48,
  },
  {
    id: "report_help",
    title: "🛠️ Ajude a melhorar",
    message: "Episódio cortado, player lento ou não carrega?\n\nUse o botão 'Reportar' abaixo para nossa equipe corrigir com prioridade.",
    button_text: "Ok, entendi",
    intervalHours: 72,
  },
  {
    id: "player_issues",
    title: "⚠️ Player não carregou?",
    message: "Nossa equipe está trabalhando nos conteúdos constantemente.\n\nSe o filme ou série não abrir, pode reportar! Devido à equipe estar atualizando, pode ocorrer de o player não carregar temporariamente.",
    button_text: "Tudo bem",
    intervalHours: 96,
  },
  {
    id: "episode_missing",
    title: "🎬 Episódio com minutos faltando?",
    message: "Percebeu que o episódio está cortado ou com minutos faltando?\n\nReporte para nossa equipe resolver com urgência! Estamos corrigindo todos os conteúdos o mais rápido possível.",
    button_text: "Vou reportar",
    intervalHours: 120,
  },
];

const STORAGE_KEY = "lyneflix_detail_warning_";

const DetailAutoWarning = () => {
  const [visible, setVisible] = useState<typeof WARNINGS[0] | null>(null);

  useEffect(() => {
    for (const w of WARNINGS) {
      const key = STORAGE_KEY + w.id;
      const last = localStorage.getItem(key);
      if (last) {
        const elapsed = Date.now() - parseInt(last, 10);
        if (elapsed < w.intervalHours * 3600000) continue;
      }
      setVisible(w);
      return;
    }
  }, []);

  const dismiss = () => {
    if (visible) {
      localStorage.setItem(STORAGE_KEY + visible.id, Date.now().toString());
    }
    setVisible(null);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} />

      <div className="relative w-full max-w-md glass rounded-2xl border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 space-y-4">
          <h2 className="text-lg font-display font-bold text-foreground pr-8">
            {visible.title}
          </h2>

          <LyneflixLogo size="lg" animate className="py-4" />

          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {visible.message}
          </p>

          <div className="flex gap-3 pt-2">
            <button
              onClick={dismiss}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {visible.button_text}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetailAutoWarning;
