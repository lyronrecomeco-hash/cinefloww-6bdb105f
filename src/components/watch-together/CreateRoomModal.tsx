import { useState } from "react";
import { X, Copy, Check, Users, Loader2, MessageCircle, Phone } from "lucide-react";
import { createRoom } from "@/lib/watchRoom";

interface Props {
  profileId: string;
  tmdbId: number;
  contentType: string;
  title: string;
  posterPath?: string;
  season?: number;
  episode?: number;
  onClose: () => void;
  onCreated: (roomCode: string, roomMode: "chat" | "call") => void;
}

const CreateRoomModal = ({ profileId, tmdbId, contentType, title, posterPath, season, episode, onClose, onCreated }: Props) => {
  const [loading, setLoading] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"chat" | "call">("chat");
  const [roomMode, setRoomMode] = useState<"chat" | "call">("chat");

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const room = await createRoom({
        hostProfileId: profileId,
        tmdbId,
        contentType,
        title,
        posterPath,
        season,
        episode,
        roomMode: mode,
      });
      if (room) {
        setRoomCode(room.room_code);
        setRoomMode(mode);
      }
    } catch (e: any) {
      setError(e.message || "Erro ao criar sala");
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-[420px] bg-card/95 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl mx-auto">
        <button onClick={onClose} className="absolute top-3 right-3 sm:top-4 sm:right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors z-10">
          <X className="w-4 h-4 text-white" />
        </button>

        <div className="p-5 sm:p-8">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-4 sm:mb-5">
            <Users className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
          </div>

          <h3 className="text-lg sm:text-xl font-bold text-center text-foreground mb-1">Assistir Junto</h3>
          <p className="text-xs sm:text-sm text-muted-foreground text-center mb-5 sm:mb-6 line-clamp-1">
            {title}{season && episode ? ` • T${season}E${episode}` : ""}
          </p>

          {!roomCode ? (
            <div className="space-y-4">
              {/* Mode selection */}
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-medium">Modo da sala</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setMode("chat")}
                    className={`flex flex-col items-center gap-2 p-3 sm:p-4 rounded-2xl border transition-all ${
                      mode === "chat"
                        ? "border-primary/40 bg-primary/10 ring-1 ring-primary/20"
                        : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                    }`}
                  >
                    <MessageCircle className={`w-5 h-5 ${mode === "chat" ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="text-center">
                      <p className={`text-xs sm:text-sm font-semibold ${mode === "chat" ? "text-primary" : "text-foreground"}`}>Chat</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Mensagens de texto</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setMode("call")}
                    className={`flex flex-col items-center gap-2 p-3 sm:p-4 rounded-2xl border transition-all ${
                      mode === "call"
                        ? "border-green-500/40 bg-green-500/10 ring-1 ring-green-500/20"
                        : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                    }`}
                  >
                    <Phone className={`w-5 h-5 ${mode === "call" ? "text-green-400" : "text-muted-foreground"}`} />
                    <div className="text-center">
                      <p className={`text-xs sm:text-sm font-semibold ${mode === "call" ? "text-green-400" : "text-foreground"}`}>Chamada</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Voz em tempo real</p>
                    </div>
                  </button>
                </div>
              </div>

              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-3 sm:p-4">
                <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    Você será o host e controlará a reprodução
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    Até 5 participantes por sala
                  </li>
                  {mode === "call" ? (
                    <>
                      <li className="flex items-start gap-2">
                        <span className="text-green-400 mt-0.5">•</span>
                        Chamada criptografada ponta a ponta
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-400 mt-0.5">•</span>
                        Host pode mutar e expulsar participantes
                      </li>
                    </>
                  ) : (
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      Chat em tempo real incluído
                    </li>
                  )}
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    A sala expira em 6 horas
                  </li>
                </ul>
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-xs sm:text-sm text-destructive">
                  {error}
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={loading}
                className={`w-full flex items-center justify-center gap-2 py-3 sm:py-3.5 rounded-2xl font-semibold text-sm transition-all disabled:opacity-50 ${
                  mode === "call"
                    ? "bg-green-500 text-white hover:bg-green-600"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : mode === "call" ? (
                  <Phone className="w-5 h-5" />
                ) : (
                  <Users className="w-5 h-5" />
                )}
                {loading ? "Criando..." : mode === "call" ? "Criar Sala de Chamada" : "Criar Sala"}
              </button>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-5">
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 sm:p-5 text-center">
                <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-2">Código da Sala</p>
                <p className="text-2xl sm:text-3xl font-mono font-bold text-primary tracking-[0.15em] sm:tracking-[0.2em]">{roomCode}</p>
                {roomMode === "call" && (
                  <div className="flex items-center justify-center gap-1.5 mt-2">
                    <Phone className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-xs text-green-400 font-medium">Chamada de Voz</span>
                  </div>
                )}
              </div>

              <button
                onClick={copyCode}
                className="w-full flex items-center justify-center gap-2 py-2.5 sm:py-3 rounded-xl bg-white/10 text-foreground text-sm font-medium hover:bg-white/20 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copiado!" : "Copiar Código"}
              </button>

              <button
                onClick={() => onCreated(roomCode, roomMode)}
                className={`w-full flex items-center justify-center gap-2 py-3 sm:py-3.5 rounded-2xl font-semibold text-sm transition-all ${
                  roomMode === "call"
                    ? "bg-green-500 text-white hover:bg-green-600"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                Entrar na Sala
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateRoomModal;
