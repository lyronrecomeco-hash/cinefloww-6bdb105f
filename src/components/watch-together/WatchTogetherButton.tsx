import { useState, useEffect } from "react";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import CreateRoomModal from "./CreateRoomModal";
import JoinRoomModal from "./JoinRoomModal";
import WatchTogetherInfoModal from "./WatchTogetherInfoModal";

interface WatchTogetherButtonProps {
  profileId: string | null;
  tmdbId: number;
  contentType: string;
  title: string;
  posterPath?: string;
  season?: number;
  episode?: number;
  onRoomJoined: (roomCode: string, roomMode?: "chat" | "call") => void;
}

const WatchTogetherButton = ({
  profileId, tmdbId, contentType, title, posterPath, season, episode, onRoomJoined,
}: WatchTogetherButtonProps) => {
  const [showInfo, setShowInfo] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  const isLoggedIn = !!profileId;

  useEffect(() => {
    const fetchSetting = async () => {
      try {
        const { data } = await supabase
          .from("site_settings")
          .select("value")
          .eq("key", "watch_together_enabled")
          .maybeSingle();
        setEnabled((data?.value as any)?.value === true);
      } catch {
        setEnabled(false);
      }
    };
    fetchSetting();
  }, []);

  if (enabled !== true) return null;

  const handleButtonClick = () => {
    setShowInfo(true);
  };

  const handleContinue = () => {
    setShowInfo(false);
    setShowMenu(true);
  };

  return (
    <>
      <button
        onClick={handleButtonClick}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 text-white text-sm font-medium hover:bg-white/20 hover:border-primary/30 transition-all duration-200 group"
      >
        <Users className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
        <span className="hidden sm:inline">Assistir Junto</span>
      </button>

      {showMenu && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowMenu(false)} />
          <div className="relative z-[9999] w-full max-w-[260px] bg-card/95 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-2xl">
            <p className="text-xs text-muted-foreground px-4 pt-2 pb-1 font-medium">O que deseja fazer?</p>
            <button
              onClick={() => { setShowMenu(false); setShowCreate(true); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-foreground hover:bg-white/10 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="text-left">
                <p className="font-medium">Criar Sala</p>
                <p className="text-xs text-muted-foreground">Convide amigos</p>
              </div>
            </button>
            <button
              onClick={() => { setShowMenu(false); setShowJoin(true); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-foreground hover:bg-white/10 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
                <span className="text-sm">🔗</span>
              </div>
              <div className="text-left">
                <p className="font-medium">Entrar numa Sala</p>
                <p className="text-xs text-muted-foreground">Cole o código</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {showInfo && (
        <WatchTogetherInfoModal
          isLoggedIn={isLoggedIn}
          onClose={() => setShowInfo(false)}
          onContinue={handleContinue}
        />
      )}

      {showCreate && profileId && (
        <CreateRoomModal
          profileId={profileId}
          tmdbId={tmdbId}
          contentType={contentType}
          title={title}
          posterPath={posterPath}
          season={season}
          episode={episode}
          onClose={() => setShowCreate(false)}
          onCreated={(code, mode) => { setShowCreate(false); onRoomJoined(code, mode); }}
        />
      )}

      {showJoin && profileId && (
        <JoinRoomModal
          profileId={profileId}
          onClose={() => setShowJoin(false)}
          onJoined={(code) => { setShowJoin(false); onRoomJoined(code); }}
        />
      )}
    </>
  );
};

export default WatchTogetherButton;
