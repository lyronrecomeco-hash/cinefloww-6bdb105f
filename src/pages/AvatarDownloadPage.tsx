import { Download } from "lucide-react";

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

const AVATARS = [
  { src: avatar1, name: "avatar-1.png" },
  { src: avatar2, name: "avatar-2.png" },
  { src: avatar3, name: "avatar-3.png" },
  { src: avatar4, name: "avatar-4.png" },
  { src: avatar5, name: "avatar-5.png" },
  { src: avatar6, name: "avatar-6.png" },
  { src: avatar7, name: "avatar-7.png" },
  { src: avatar8, name: "avatar-8.png" },
  { src: anime1, name: "anime-1.png" },
  { src: anime2, name: "anime-2.png" },
  { src: anime3, name: "anime-3.png" },
  { src: anime4, name: "anime-4.png" },
  { src: anime5, name: "anime-5.png" },
  { src: anime6, name: "anime-6.png" },
  { src: anime7, name: "anime-7.png" },
  { src: anime8, name: "anime-8.png" },
];

const downloadAvatar = (src: string, name: string) => {
  const a = document.createElement("a");
  a.href = src;
  a.download = name;
  a.click();
};

const downloadAll = () => {
  AVATARS.forEach((av, i) => {
    setTimeout(() => downloadAvatar(av.src, av.name), i * 200);
  });
};

const AvatarDownloadPage = () => (
  <div className="min-h-screen bg-background p-6 sm:p-10">
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-2">Avatares</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Clique em cada avatar para baixar individualmente, ou baixe todos de uma vez.
      </p>

      <button
        onClick={downloadAll}
        className="flex items-center gap-2 mb-8 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
      >
        <Download className="w-4 h-4" />
        Baixar todos (16)
      </button>

      <h2 className="text-sm font-semibold text-muted-foreground mb-3">Clássicos</h2>
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 mb-8">
        {AVATARS.slice(0, 8).map((av) => (
          <button
            key={av.name}
            onClick={() => downloadAvatar(av.src, av.name)}
            className="group relative rounded-xl overflow-hidden border border-white/10 hover:border-primary/50 transition-all"
          >
            <img src={av.src} alt={av.name} className="w-full aspect-square object-cover" />
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Download className="w-5 h-5 text-white" />
            </div>
          </button>
        ))}
      </div>

      <h2 className="text-sm font-semibold text-muted-foreground mb-3">🎌 Anime</h2>
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
        {AVATARS.slice(8, 16).map((av) => (
          <button
            key={av.name}
            onClick={() => downloadAvatar(av.src, av.name)}
            className="group relative rounded-xl overflow-hidden border border-white/10 hover:border-primary/50 transition-all"
          >
            <img src={av.src} alt={av.name} className="w-full aspect-square object-cover" />
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Download className="w-5 h-5 text-white" />
            </div>
          </button>
        ))}
      </div>
    </div>
  </div>
);

export default AvatarDownloadPage;
