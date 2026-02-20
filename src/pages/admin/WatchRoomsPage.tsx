import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, Crown, Clock, Trash2, RefreshCw, Radio, X, Phone, MessageCircle, Eye } from "lucide-react";

interface RoomRow {
  id: string;
  room_code: string;
  title: string;
  content_type: string;
  status: string;
  host_profile_id: string;
  max_participants: number;
  created_at: string;
  expires_at: string;
  season: number | null;
  episode: number | null;
  room_mode: string;
  participant_count?: number;
  participants?: ParticipantRow[];
}

interface ParticipantRow {
  id: string;
  profile_id: string;
  role: string;
  joined_at: string;
  last_heartbeat: string;
  muted_by_host: boolean;
  profile_name?: string;
}

const WatchRoomsPage = () => {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<RoomRow | null>(null);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("watch_rooms")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (data) {
      const roomIds = data.map(r => r.id);
      const { data: participants } = await supabase
        .from("watch_room_participants")
        .select("*")
        .in("room_id", roomIds);

      // Get profile names
      const profileIds = [...new Set(participants?.map(p => p.profile_id) || [])];
      let profileMap: Record<string, string> = {};
      if (profileIds.length > 0) {
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("id, name")
          .in("id", profileIds);
        profiles?.forEach(p => { profileMap[p.id] = p.name; });
      }

      const countMap: Record<string, number> = {};
      const participantMap: Record<string, ParticipantRow[]> = {};
      participants?.forEach(p => {
        countMap[p.room_id] = (countMap[p.room_id] || 0) + 1;
        if (!participantMap[p.room_id]) participantMap[p.room_id] = [];
        participantMap[p.room_id].push({ ...p, profile_name: profileMap[p.profile_id] || p.profile_id.slice(0, 8) });
      });

      setRooms(data.map(r => ({
        ...r,
        participant_count: countMap[r.id] || 0,
        participants: participantMap[r.id] || [],
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-watch-rooms")
      .on("postgres_changes", { event: "*", schema: "public", table: "watch_rooms" }, () => fetchRooms())
      .on("postgres_changes", { event: "*", schema: "public", table: "watch_room_participants" }, () => fetchRooms())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRooms]);

  const closeRoom = async (roomId: string) => {
    await supabase.from("watch_rooms").update({ status: "closed" }).eq("id", roomId);
  };

  const activeRooms = rooms.filter(r => r.status !== "closed");
  const closedRooms = rooms.filter(r => r.status === "closed");

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString("pt-BR")} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  const isExpired = (iso: string) => new Date(iso) < new Date();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Radio className="w-6 h-6 text-primary" />
            Watch Together
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeRooms.length} sala{activeRooms.length !== 1 ? "s" : ""} ativa{activeRooms.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={fetchRooms}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card/50 border border-white/10 rounded-2xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Ativas</p>
          <p className="text-2xl font-bold text-primary">{activeRooms.length}</p>
        </div>
        <div className="bg-card/50 border border-white/10 rounded-2xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Participantes</p>
          <p className="text-2xl font-bold text-foreground">
            {activeRooms.reduce((s, r) => s + (r.participant_count || 0), 0)}
          </p>
        </div>
        <div className="bg-card/50 border border-white/10 rounded-2xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Encerradas</p>
          <p className="text-2xl font-bold text-muted-foreground">{closedRooms.length}</p>
        </div>
        <div className="bg-card/50 border border-white/10 rounded-2xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Total</p>
          <p className="text-2xl font-bold text-muted-foreground">{rooms.length}</p>
        </div>
      </div>

      {/* Active Rooms */}
      {activeRooms.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Salas Ativas</h2>
          <div className="grid gap-3">
            {activeRooms.map(room => (
              <div
                key={room.id}
                className="bg-card/50 border border-primary/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer hover:bg-card/70 transition-colors"
                onClick={() => setSelectedRoom(room)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-sm font-bold text-primary">{room.room_code}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                      room.status === "waiting" ? "bg-amber-500/15 text-amber-400" : "bg-green-500/15 text-green-400"
                    }`}>
                      {room.status === "waiting" ? "Aguardando" : room.status}
                    </span>
                    {room.room_mode === "call" ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-500/15 text-green-400">
                        <Phone className="w-3 h-3" /> Chamada
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-400">
                        <MessageCircle className="w-3 h-3" /> Chat
                      </span>
                    )}
                    {isExpired(room.expires_at) && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-destructive/15 text-destructive">
                        Expirada
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground truncate">
                    {room.title}
                    {room.season && room.episode ? ` • T${room.season}E${room.episode}` : ""}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {room.participant_count}/{room.max_participants}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(room.created_at)}
                    </span>
                    <span className="capitalize">{room.content_type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedRoom(room); }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 text-foreground text-xs font-medium hover:bg-white/10 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Detalhes
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); closeRoom(room.id); }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Encerrar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Closed Rooms */}
      {closedRooms.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Histórico</h2>
          <div className="grid gap-2">
            {closedRooms.slice(0, 20).map(room => (
              <div
                key={room.id}
                className="bg-card/30 border border-white/5 rounded-xl p-3 flex items-center gap-3 opacity-60 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setSelectedRoom(room)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{room.room_code}</span>
                    <span className="text-xs text-muted-foreground truncate">{room.title}</span>
                    {room.room_mode === "call" && <Phone className="w-3 h-3 text-green-400/60" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">{formatDate(room.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {rooms.length === 0 && !loading && (
        <div className="text-center py-16">
          <Radio className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">Nenhuma sala Watch Together encontrada.</p>
        </div>
      )}

      {/* Room Detail Modal */}
      {selectedRoom && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-card/95 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl mx-auto max-h-[85vh] overflow-y-auto">
            <button
              onClick={() => setSelectedRoom(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors z-10"
            >
              <X className="w-4 h-4 text-white" />
            </button>

            <div className="p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-2xl bg-primary/15 flex items-center justify-center">
                  <Radio className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Detalhes da Sala</h3>
                  <p className="font-mono text-xs text-primary font-bold">{selectedRoom.room_code}</p>
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Conteúdo</p>
                  <p className="text-sm font-medium text-foreground truncate">{selectedRoom.title}</p>
                  {selectedRoom.season && selectedRoom.episode && (
                    <p className="text-xs text-muted-foreground">T{selectedRoom.season} E{selectedRoom.episode}</p>
                  )}
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Status</p>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                    selectedRoom.status === "closed"
                      ? "bg-muted text-muted-foreground"
                      : selectedRoom.status === "waiting"
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-green-500/15 text-green-400"
                  }`}>
                    {selectedRoom.status === "waiting" ? "Aguardando" : selectedRoom.status === "closed" ? "Encerrada" : selectedRoom.status}
                  </span>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Modo</p>
                  <div className="flex items-center gap-1.5">
                    {selectedRoom.room_mode === "call" ? (
                      <>
                        <Phone className="w-3.5 h-3.5 text-green-400" />
                        <span className="text-sm font-medium text-green-400">Chamada</span>
                      </>
                    ) : (
                      <>
                        <MessageCircle className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-sm font-medium text-blue-400">Chat</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Tipo</p>
                  <p className="text-sm font-medium text-foreground capitalize">{selectedRoom.content_type}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Criada em</p>
                  <p className="text-xs font-medium text-foreground">{formatDate(selectedRoom.created_at)}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Expira em</p>
                  <p className={`text-xs font-medium ${isExpired(selectedRoom.expires_at) ? "text-destructive" : "text-foreground"}`}>
                    {formatDate(selectedRoom.expires_at)}
                    {isExpired(selectedRoom.expires_at) && " (expirada)"}
                  </p>
                </div>
              </div>

              {/* Participants */}
              <div className="mb-5">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">
                  Participantes ({selectedRoom.participant_count || 0}/{selectedRoom.max_participants})
                </p>
                {selectedRoom.participants && selectedRoom.participants.length > 0 ? (
                  <div className="space-y-2">
                    {selectedRoom.participants.map(p => (
                      <div key={p.id} className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                        <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-bold text-primary">
                          {(p.profile_name || "?").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{p.profile_name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Entrou: {formatDate(p.joined_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {p.role === "host" && <Crown className="w-3.5 h-3.5 text-yellow-400" />}
                          {p.muted_by_host && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500/15 text-orange-400">
                              Mutado
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            p.role === "host" ? "bg-yellow-500/15 text-yellow-400" : "bg-white/5 text-muted-foreground"
                          }`}>
                            {p.role === "host" ? "Host" : "Viewer"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground/60 text-center py-4">Nenhum participante</p>
                )}
              </div>

              {/* Actions */}
              {selectedRoom.status !== "closed" && (
                <button
                  onClick={() => { closeRoom(selectedRoom.id); setSelectedRoom(null); }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-destructive/10 text-destructive text-sm font-semibold hover:bg-destructive/20 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Encerrar Sala
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WatchRoomsPage;
