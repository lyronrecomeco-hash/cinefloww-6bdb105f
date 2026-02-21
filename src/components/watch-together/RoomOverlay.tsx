import { useState } from "react";
import { Users, Copy, Check, X, Crown, LogOut, MessageCircle, Phone } from "lucide-react";
import RoomChat from "./RoomChat";
import ChatBubbleNotification from "./ChatBubbleNotification";
import VoiceCallOverlay from "./VoiceCallOverlay";

interface Participant {
  id: string;
  profile_id: string;
  role: string;
}

interface Message {
  id: string;
  profile_id: string;
  profile_name?: string;
  message: string;
  created_at: string;
}

interface PeerInfo {
  peerId: string;
  peerName: string;
  isMuted: boolean;
  isMutedByHost: boolean;
  isSpeaking: boolean;
}

interface Props {
  roomCode: string;
  roomMode: "chat" | "call";
  isHost: boolean;
  participants: Participant[];
  participantNames: Record<string, string>;
  messages: Message[];
  profileId: string;
  profileName: string;
  onLeave: () => void;
  onSendMessage: (msg: string) => void;
  showControls: boolean;
  // Voice call props
  voiceCallActive?: boolean;
  voiceMuted?: boolean;
  voicePeers?: PeerInfo[];
  voiceError?: string | null;
  onToggleVoiceMute?: () => void;
  onEndVoiceCall?: () => void;
  onHostMute?: (peerId: string) => void;
  onHostUnmute?: (peerId: string) => void;
  onHostKick?: (peerId: string) => void;
}

const RoomOverlay = ({
  roomCode, roomMode, isHost, participants, participantNames, messages, profileId, profileName,
  onLeave, onSendMessage, showControls,
  voiceCallActive, voiceMuted, voicePeers, voiceError,
  onToggleVoiceMute, onEndVoiceCall, onHostMute, onHostUnmute, onHostKick,
}: Props) => {
  const [copied, setCopied] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showPanel, setShowPanel] = useState(false);

  const isCallMode = roomMode === "call";

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Chat mode: floating bubbles & drawer */}
      {!isCallMode && (
        <>
          {!showChat && (
            <ChatBubbleNotification
              messages={messages}
              profileId={profileId}
              onOpenChat={() => setShowChat(true)}
            />
          )}
        </>
      )}

      {/* Room badge - top right */}
      <div className={`absolute top-4 right-16 z-20 flex items-center gap-2 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        {!isCallMode && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowChat(!showChat); }}
            className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-white text-xs font-medium hover:bg-black/80 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Chat</span>
          </button>
        )}

        {isCallMode && (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/20 backdrop-blur-md border border-green-500/30 text-green-400 text-xs font-bold">
            <Phone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Chamada</span>
          </div>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); setShowPanel(!showPanel); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/20 backdrop-blur-md border border-primary/30 text-primary text-xs font-bold hover:bg-primary/30 transition-colors"
        >
          <Users className="w-3.5 h-3.5" />
          <span>{participants.length}</span>
          {isHost && <Crown className="w-3 h-3 text-yellow-400" />}
        </button>

        {/* Voice call active indicator with voice peer count */}
        {isCallMode && voiceCallActive && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-green-500/15 backdrop-blur-md border border-green-500/20 text-green-400 text-[10px] font-bold">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span>{(voicePeers?.length || 0) + 1} na voz</span>
          </div>
        )}
      </div>

      {/* Participants panel */}
      {showPanel && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setShowPanel(false)} />
          <div className="absolute top-16 right-4 sm:right-16 z-[61] w-64 sm:w-72 bg-[#0d0d0d]/95 backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-white/[0.06]">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-white">Watch Together</h4>
                <button onClick={() => setShowPanel(false)} className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/10 transition-colors">
                  <X className="w-3 h-3 text-white/60" />
                </button>
              </div>
              <button onClick={copyCode} className="flex items-center gap-2 text-xs text-white/40 hover:text-white/60 transition-colors">
                <span className="font-mono font-bold text-primary">{roomCode}</span>
                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              </button>
              {isCallMode && (
                <div className="flex items-center gap-1.5 mt-2">
                  <Phone className="w-3 h-3 text-green-400" />
                  <span className="text-[10px] text-green-400 font-medium">Chamada de Voz Ativa</span>
                </div>
              )}
            </div>

            <div className="p-3 max-h-48 overflow-y-auto">
              <p className="text-[10px] text-white/25 uppercase tracking-wider mb-2 font-semibold">
                Participantes ({participants.length})
              </p>
              {participants.map(p => {
                const displayName = p.profile_id === profileId 
                  ? "Você" 
                  : (participantNames[p.profile_id] || `Perfil ${p.profile_id.slice(0, 6)}`);
                const initials = p.profile_id === profileId 
                  ? profileName.slice(0, 2).toUpperCase()
                  : (participantNames[p.profile_id] || p.profile_id).slice(0, 2).toUpperCase();
                return (
                <div key={p.id} className="flex items-center gap-2.5 py-2">
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-bold text-primary">
                    {initials}
                  </div>
                  <span className="text-xs text-white/80 flex-1 truncate font-medium">
                    {displayName}
                  </span>
                  {p.role === "host" && <Crown className="w-3 h-3 text-yellow-400" />}
                </div>
                );
              })}
            </div>

            <div className="p-3 border-t border-white/[0.06]">
              <button
                onClick={onLeave}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                {isHost ? "Encerrar Sala" : "Sair da Sala"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Chat drawer (only in chat mode) */}
      {!isCallMode && (
        <RoomChat
          messages={messages}
          profileId={profileId}
          onSend={onSendMessage}
          onClose={() => setShowChat(false)}
          isOpen={showChat}
        />
      )}

      {/* Voice call overlay (only in call mode) */}
      {isCallMode && voiceCallActive !== undefined && (
        <VoiceCallOverlay
          isHost={isHost}
          isMuted={voiceMuted || false}
          peers={voicePeers || []}
          profileId={profileId}
          profileName={profileName}
          isCallActive={voiceCallActive}
          error={voiceError || null}
          showControls={showControls}
          onToggleMute={onToggleVoiceMute || (() => {})}
          onEndCall={onEndVoiceCall || (() => {})}
          onHostMute={onHostMute || (() => {})}
          onHostUnmute={onHostUnmute || (() => {})}
          onHostKick={onHostKick || (() => {})}
        />
      )}
    </>
  );
};

export default RoomOverlay;
