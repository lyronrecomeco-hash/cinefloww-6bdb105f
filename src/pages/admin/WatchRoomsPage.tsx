import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, Crown, Clock, Trash2, RefreshCw, Radio } from "lucide-react";

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
  participant_count?: number;
}

const WatchRoomsPage = () => {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("watch_rooms")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (data) {
      // Get participant counts
      const roomIds = data.map(r => r.id);
      const { data: participants } = await supabase
        .from("watch_room_participants")
        .select("room_id")
        .in("room_id", roomIds);

      const countMap: Record<string, number> = {};
      participants?.forEach(p => {
        countMap[p.room_id] = (countMap[p.room_id] || 0) + 1;
      });

      setRooms(data.map(r => ({ ...r, participant_count: countMap[r.id] || 0 })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  // Realtime updates
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
              <div key={room.id} className="bg-card/50 border border-primary/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-bold text-primary">{room.room_code}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                      room.status === "waiting" ? "bg-amber-500/15 text-amber-400" : "bg-green-500/15 text-green-400"
                    }`}>
                      {room.status === "waiting" ? "Aguardando" : room.status}
                    </span>
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
                <button
                  onClick={() => closeRoom(room.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors self-end sm:self-center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Encerrar
                </button>
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
              <div key={room.id} className="bg-card/30 border border-white/5 rounded-xl p-3 flex items-center gap-3 opacity-60">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{room.room_code}</span>
                    <span className="text-xs text-muted-foreground truncate">{room.title}</span>
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
    </div>
  );
};

export default WatchRoomsPage;
