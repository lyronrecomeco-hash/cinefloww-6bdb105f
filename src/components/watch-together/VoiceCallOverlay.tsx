import { useState } from "react";
import {
  Mic, MicOff, PhoneOff, Users, Crown, UserX,
  Volume2, VolumeX, X, ChevronUp, ChevronDown,
  Signal, SignalLow, SignalZero, Shield,
} from "lucide-react";

interface PeerInfo {
  peerId: string;
  peerName: string;
  isMuted: boolean;
  isMutedByHost: boolean;
  isSpeaking: boolean;
}

interface Props {
  isHost: boolean;
  isMuted: boolean;
  peers: PeerInfo[];
  profileId: string;
  profileName: string;
  isCallActive: boolean;
  error: string | null;
  showControls: boolean;
  connectionQuality?: "good" | "fair" | "poor";
  onToggleMute: () => void;
  onEndCall: () => void;
  onHostMute: (peerId: string) => void;
  onHostUnmute: (peerId: string) => void;
  onHostKick: (peerId: string) => void;
}

const VoiceCallOverlay = ({
  isHost, isMuted, peers, profileId, profileName, isCallActive, error,
  showControls, connectionQuality = "good",
  onToggleMute, onEndCall, onHostMute, onHostUnmute, onHostKick,
}: Props) => {
  const [expanded, setExpanded] = useState(false);

  if (!isCallActive && !error) return null;

  const QualityIcon = connectionQuality === "good" ? Signal : connectionQuality === "fair" ? SignalLow : SignalZero;
  const qualityColor = connectionQuality === "good" ? "text-green-400" : connectionQuality === "fair" ? "text-yellow-400" : "text-destructive";

  return (
    <>
      {/* Error banner */}
      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 max-w-sm w-full mx-4">
          <div className="bg-destructive/90 backdrop-blur-xl border border-destructive/50 rounded-2xl px-4 py-3 text-sm text-white text-center">
            {error}
          </div>
        </div>
      )}

      {/* Floating call bar */}
      <div
        className={`absolute bottom-20 sm:bottom-24 left-1/2 -translate-x-1/2 z-30 transition-all duration-300 ${
          showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#0d0d0d]/95 backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
          {/* Expanded peer list */}
          {expanded && (
            <div className="p-3 border-b border-white/[0.06] max-h-48 overflow-y-auto min-w-[300px]">
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-[10px] text-white/25 uppercase tracking-wider font-semibold">
                  Na chamada ({peers.length + 1})
                </p>
                <div className="flex items-center gap-1.5">
                  <Shield className="w-3 h-3 text-green-400/60" />
                  <span className="text-[9px] text-green-400/60 font-medium">P2P Criptografado</span>
                </div>
              </div>

              {/* Self */}
              <div className="flex items-center gap-2.5 py-1.5 px-1 rounded-lg bg-white/[0.02]">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                  !isMuted ? "bg-green-500/15 ring-1 ring-green-500/30" : "bg-primary/15"
                }`}>
                  <span className="text-[10px] font-bold text-primary">Eu</span>
                </div>
                <span className="text-xs text-white/80 flex-1 truncate font-medium">
                  {profileName} {isHost && "(Host)"}
                </span>
                <div className="flex items-center gap-1">
                  <QualityIcon className={`w-3 h-3 ${qualityColor}`} />
                  {isMuted ? (
                    <MicOff className="w-3.5 h-3.5 text-destructive" />
                  ) : (
                    <Mic className="w-3.5 h-3.5 text-green-400" />
                  )}
                </div>
              </div>

              {/* Peers */}
              {peers.map((peer) => (
                <div key={peer.peerId} className="flex items-center gap-2.5 py-1.5 px-1 group hover:bg-white/[0.02] rounded-lg transition-colors">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                    peer.isSpeaking ? "bg-green-500/15 ring-1 ring-green-500/30 animate-pulse" : "bg-white/10"
                  }`}>
                    <span className="text-[10px] font-bold text-white/60">
                      {peer.peerName.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-xs text-white/80 flex-1 truncate font-medium">
                    {peer.peerName}
                    {peer.isMutedByHost && <span className="text-[9px] text-destructive/60 ml-1">(silenciado)</span>}
                  </span>

                  <div className="flex items-center gap-1">
                    {peer.isMuted || peer.isMutedByHost ? (
                      <MicOff className="w-3.5 h-3.5 text-destructive" />
                    ) : (
                      <Mic className={`w-3.5 h-3.5 ${peer.isSpeaking ? "text-green-400 animate-pulse" : "text-green-400"}`} />
                    )}

                    {isHost && (
                      <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                        {peer.isMutedByHost ? (
                          <button
                            onClick={() => onHostUnmute(peer.peerId)}
                            className="w-6 h-6 rounded-lg bg-green-500/10 flex items-center justify-center hover:bg-green-500/20 transition-colors"
                            title="Desmutar"
                          >
                            <Volume2 className="w-3 h-3 text-green-400" />
                          </button>
                        ) : (
                          <button
                            onClick={() => onHostMute(peer.peerId)}
                            className="w-6 h-6 rounded-lg bg-orange-500/10 flex items-center justify-center hover:bg-orange-500/20 transition-colors"
                            title="Mutar"
                          >
                            <VolumeX className="w-3 h-3 text-orange-400" />
                          </button>
                        )}
                        <button
                          onClick={() => onHostKick(peer.peerId)}
                          className="w-6 h-6 rounded-lg bg-destructive/10 flex items-center justify-center hover:bg-destructive/20 transition-colors"
                          title="Expulsar"
                        >
                          <UserX className="w-3 h-3 text-destructive" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Control bar */}
          <div className="flex items-center gap-2 p-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] text-white/60 text-xs font-medium hover:bg-white/10 transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              <span>{peers.length + 1}</span>
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            </button>

            <button
              onClick={onToggleMute}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isMuted
                  ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
                  : "bg-white/[0.06] text-green-400 hover:bg-white/10"
              }`}
            >
              {isMuted ? <MicOff className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
            </button>

            <button
              onClick={onEndCall}
              className="w-10 h-10 rounded-xl bg-destructive/20 text-destructive flex items-center justify-center hover:bg-destructive/30 transition-colors"
            >
              <PhoneOff className="w-4.5 h-4.5" />
            </button>

            {isHost && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-yellow-500/10">
                <Crown className="w-3 h-3 text-yellow-400" />
                <span className="text-[10px] text-yellow-400 font-semibold">HOST</span>
              </div>
            )}

            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${
              connectionQuality === "good" ? "bg-green-500/10" : connectionQuality === "fair" ? "bg-yellow-500/10" : "bg-destructive/10"
            }`}>
              <QualityIcon className={`w-3 h-3 ${qualityColor}`} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default VoiceCallOverlay;
