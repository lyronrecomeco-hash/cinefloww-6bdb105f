import { Download, Loader2, Play, FileCode, Package } from "lucide-react";
import { useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

// Raw imports of all player source files
import playerPageSrc from "@/pages/PlayerPage.tsx?raw";
import embedPlayerSrc from "@/pages/EmbedPlayer.tsx?raw";
import customPlayerSrc from "@/components/CustomPlayer.tsx?raw";
import usePlayerEngineSrc from "@/hooks/usePlayerEngine.ts?raw";
import videoUrlSrc from "@/lib/videoUrl.ts?raw";
import watchProgressSrc from "@/lib/watchProgress.ts?raw";
import slugifySrc from "@/lib/slugify.ts?raw";
import sdkPlayerSrc from "/sdk/player.js?raw";

const FILES = [
  { path: "pages/PlayerPage.tsx", src: playerPageSrc, label: "PlayerPage", desc: "Tela principal do player" },
  { path: "pages/EmbedPlayer.tsx", src: embedPlayerSrc, label: "EmbedPlayer", desc: "Player para embed/iframe" },
  { path: "components/CustomPlayer.tsx", src: customPlayerSrc, label: "CustomPlayer", desc: "Componente player standalone" },
  { path: "hooks/usePlayerEngine.ts", src: usePlayerEngineSrc, label: "usePlayerEngine", desc: "Engine de vídeo (HLS, qualidade, retry)" },
  { path: "lib/videoUrl.ts", src: videoUrlSrc, label: "videoUrl", desc: "URLs de vídeo e proxy" },
  { path: "lib/watchProgress.ts", src: watchProgressSrc, label: "watchProgress", desc: "Progresso de visualização" },
  { path: "lib/slugify.ts", src: slugifySrc, label: "slugify", desc: "Slug/ID helpers" },
  { path: "sdk/player.js", src: sdkPlayerSrc, label: "SDK Player", desc: "SDK JS público (LynePlay)" },
];

const PlayerDownloadPage = () => {
  const [downloading, setDownloading] = useState(false);

  const downloadZip = async () => {
    setDownloading(true);
    try {
      const zip = new JSZip();

      // Add README
      zip.file("README.md", `# LyneFlix Player Module\n\nArquivos do player completo para integração.\n\n## Estrutura\n\n${FILES.map(f => `- \`${f.path}\` — ${f.desc}`).join("\n")}\n\n## Dependências\n\n- react, react-dom\n- react-router-dom\n- hls.js\n- lucide-react\n- @supabase/supabase-js\n\n## Uso\n\nImporte o \`PlayerPage\` ou \`CustomPlayer\` no seu app.\nO \`usePlayerEngine\` gerencia toda a lógica de vídeo.\n`);

      // Add all source files
      for (const file of FILES) {
        zip.file(file.path, file.src);
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "lyneflix-player.zip");
    } catch (e) {
      console.error(e);
    }
    setDownloading(false);
  };

  return (
    <div className="min-h-screen bg-background p-6 sm:p-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <Play className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Player Module</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">
          Baixe o ZIP com todos os arquivos do player para integrar no app Android, web ou qualquer projeto React.
        </p>

        <button
          onClick={downloadZip}
          disabled={downloading}
          className="flex items-center gap-2 mb-10 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {downloading ? "Gerando ZIP..." : `Baixar ZIP (${FILES.length} arquivos)`}
        </button>

        <h2 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
          <Package className="w-4 h-4" /> Arquivos incluídos
        </h2>
        <div className="space-y-2">
          {FILES.map((f) => (
            <div
              key={f.path}
              className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card/50"
            >
              <FileCode className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{f.path}</p>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PlayerDownloadPage;
