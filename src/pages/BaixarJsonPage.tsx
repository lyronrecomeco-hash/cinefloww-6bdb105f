import { Download, Loader2, Film, Tv, Sparkles } from "lucide-react";
import { useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

const FILES = [
  { name: "filmes_catalogo.json", label: "Filmes", icon: Film, count: "20.000" },
  { name: "series_catalogo.json", label: "Séries (com episódios)", icon: Tv, count: "8.000" },
  { name: "animes_catalogo.json", label: "Animes (com episódios)", icon: Sparkles, count: "3.203" },
];

const BaixarJsonPage = () => {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState("");

  const downloadZip = async () => {
    setDownloading(true);
    try {
      const zip = new JSZip();

      for (const file of FILES) {
        setProgress(`Baixando ${file.label}...`);
        const res = await fetch(`/data/${file.name}`);
        const blob = await res.blob();
        zip.file(file.name, blob);
      }

      setProgress("Gerando ZIP...");
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "catalogo-completo.zip");
      setProgress("");
    } catch (e) {
      console.error(e);
      setProgress("Erro ao gerar ZIP");
    }
    setDownloading(false);
  };

  return (
    <div className="min-h-screen bg-background p-6 sm:p-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-2">📦 Catálogo JSON</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Baixe o ZIP com os 3 arquivos JSON do catálogo completo TMDB (32.000 itens).
        </p>

        <div className="grid gap-4 mb-8">
          {FILES.map((f) => (
            <div key={f.name} className="flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-card">
              <f.icon className="w-6 h-6 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{f.label}</p>
                <p className="text-xs text-muted-foreground">{f.count} itens • {f.name}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={downloadZip}
          disabled={downloading}
          className="flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 w-full justify-center"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {downloading ? (progress || "Processando...") : "Baixar ZIP (3 arquivos JSON)"}
        </button>
      </div>
    </div>
  );
};

export default BaixarJsonPage;
