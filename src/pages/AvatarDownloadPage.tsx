import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

import avatar1 from "@/assets/avatars/avatar-1.png";
import avatar2 from "@/assets/avatars/avatar-2.png";
import avatar3 from "@/assets/avatars/avatar-3.png";
import avatar4 from "@/assets/avatars/avatar-4.png";
import avatar5 from "@/assets/avatars/avatar-5.png";
import avatar6 from "@/assets/avatars/avatar-6.png";
import avatar7 from "@/assets/avatars/avatar-7.png";
import avatar8 from "@/assets/avatars/avatar-8.png";
import anime1 from "@/assets/avatars/anime-1.png";
import anime2 from "@/assets/avatars/anime-2.png";
import anime3 from "@/assets/avatars/anime-3.png";
import anime4 from "@/assets/avatars/anime-4.png";
import anime5 from "@/assets/avatars/anime-5.png";
import anime6 from "@/assets/avatars/anime-6.png";
import anime7 from "@/assets/avatars/anime-7.png";
import anime8 from "@/assets/avatars/anime-8.png";

const CLASSICS = [
  { src: avatar1, name: "avatar_1.png" },
  { src: avatar2, name: "avatar_2.png" },
  { src: avatar3, name: "avatar_3.png" },
  { src: avatar4, name: "avatar_4.png" },
  { src: avatar5, name: "avatar_5.png" },
  { src: avatar6, name: "avatar_6.png" },
  { src: avatar7, name: "avatar_7.png" },
  { src: avatar8, name: "avatar_8.png" },
];

const ANIMES = [
  { src: anime1, name: "anime_1.png" },
  { src: anime2, name: "anime_2.png" },
  { src: anime3, name: "anime_3.png" },
  { src: anime4, name: "anime_4.png" },
  { src: anime5, name: "anime_5.png" },
  { src: anime6, name: "anime_6.png" },
  { src: anime7, name: "anime_7.png" },
  { src: anime8, name: "anime_8.png" },
];

const fetchBlob = async (url: string) => {
  const res = await fetch(url);
  return res.blob();
};

const AvatarDownloadPage = () => {
  const [downloading, setDownloading] = useState(false);

  const downloadZip = async () => {
    setDownloading(true);
    try {
      const zip = new JSZip();
      const classicosFolder = zip.folder("classicos");
      const animesFolder = zip.folder("animes");

      const all = [
        ...CLASSICS.map((a) => ({ ...a, folder: classicosFolder })),
        ...ANIMES.map((a) => ({ ...a, folder: animesFolder })),
      ];

      await Promise.all(
        all.map(async ({ src, name, folder }) => {
          const blob = await fetchBlob(src);
          folder!.file(name, blob);
        })
      );

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "avatares-lyneflix.zip");
    } catch (e) {
      console.error(e);
    }
    setDownloading(false);
  };

  return (
    <div className="min-h-screen bg-background p-6 sm:p-10">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-2">Avatares</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Baixe o ZIP com todas as imagens organizadas em pastas (classicos/ e animes/).
        </p>

        <button
          onClick={downloadZip}
          disabled={downloading}
          className="flex items-center gap-2 mb-10 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {downloading ? "Gerando ZIP..." : "Baixar ZIP (16 avatares)"}
        </button>

        <h2 className="text-sm font-semibold text-muted-foreground mb-3">📁 classicos/</h2>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 mb-8">
          {CLASSICS.map((av) => (
            <div key={av.name} className="rounded-xl overflow-hidden border border-white/10">
              <img src={av.src} alt={av.name} className="w-full aspect-square object-cover" />
              <p className="text-[10px] text-muted-foreground text-center py-1 truncate px-1">{av.name}</p>
            </div>
          ))}
        </div>

        <h2 className="text-sm font-semibold text-muted-foreground mb-3">📁 animes/</h2>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
          {ANIMES.map((av) => (
            <div key={av.name} className="rounded-xl overflow-hidden border border-white/10">
              <img src={av.src} alt={av.name} className="w-full aspect-square object-cover" />
              <p className="text-[10px] text-muted-foreground text-center py-1 truncate px-1">{av.name}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AvatarDownloadPage;
