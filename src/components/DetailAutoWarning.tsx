import { useState, useEffect } from "react";
import { Info, X, Flag } from "lucide-react";

const WARNINGS = [
  {
    id: "site_new",
    title: "🆕 Site em construção",
    message: "A LyneFlix está adicionando conteúdos diariamente. Se este título não carregar, pode reportar — nossa equipe resolve rápido!",
    intervalHours: 48,
  },
  {
    id: "report_help",
    title: "🛠️ Ajude a melhorar",
    message: "Episódio cortado, player lento ou não carrega? Use o botão 'Reportar' abaixo para nossa equipe corrigir com prioridade.",
    intervalHours: 72,
  },
];

const STORAGE_KEY = "lyneflix_detail_warning_";

const DetailAutoWarning = () => {
  const [visible, setVisible] = useState<typeof WARNINGS[0] | null>(null);

  useEffect(() => {
    // Find the first warning that hasn't been dismissed recently
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
    <div className="mx-3 sm:mx-6 lg:mx-12 mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="relative flex items-start gap-3 px-4 py-3 rounded-xl bg-primary/10 border border-primary/20">
        <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-semibold text-foreground">{visible.title}</p>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 leading-relaxed">{visible.message}</p>
        </div>
        <button
          onClick={dismiss}
          className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

export default DetailAutoWarning;
