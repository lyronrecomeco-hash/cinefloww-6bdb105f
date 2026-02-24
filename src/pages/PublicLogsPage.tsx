import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lock, ScrollText, RefreshCw, Shield, Globe, Users, Activity } from "lucide-react";

type LogType = "resolve" | "visitors" | "api" | "auth";

const TAB_CONFIG: { key: LogType; label: string; icon: typeof ScrollText }[] = [
  { key: "resolve", label: "Resolve", icon: Activity },
  { key: "visitors", label: "Visitantes", icon: Globe },
  { key: "api", label: "API", icon: Shield },
  { key: "auth", label: "Auth", icon: Users },
];

const PublicLogsPage = () => {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<LogType>("resolve");
  const [storedPass, setStoredPass] = useState("");

  const fetchLogs = useCallback(async (type: LogType, pass: string) => {
    setLoading(true);
    setError("");
    try {
      const { data, error: fnError } = await supabase.functions.invoke("admin-logs", {
        headers: { "x-admin-pass": pass },
        body: null,
        method: "GET",
      });

      // Use fetch directly since invoke doesn't support query params well
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-logs?type=${type}&limit=200`,
        {
          headers: {
            "x-admin-pass": pass,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      if (res.status === 403) {
        setAuthenticated(false);
        setError("Senha incorreta");
        setLogs([]);
        return;
      }

      const json = await res.json();
      setLogs(json.data || []);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setStoredPass(password);
    setAuthenticated(true);
    await fetchLogs(activeTab, password);
  };

  const handleTabChange = async (tab: LogType) => {
    setActiveTab(tab);
    await fetchLogs(tab, storedPass);
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
    } catch { return d; }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="glass-strong p-8 w-full max-w-sm space-y-5">
          <div className="flex items-center justify-center gap-2 text-primary">
            <Lock className="w-6 h-6" />
            <h1 className="text-xl font-bold font-display">Acesso Restrito</h1>
          </div>
          <p className="text-center text-muted-foreground text-sm">
            Digite a senha de administrador para acessar os logs.
          </p>
          {error && (
            <div className="text-center text-destructive text-sm font-medium">{error}</div>
          )}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha de acesso"
            className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50"
            autoFocus
          />
          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <ScrollText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display">Logs do Sistema</h1>
              <p className="text-xs text-muted-foreground">{logs.length} registros</p>
            </div>
          </div>
          <button
            onClick={() => fetchLogs(activeTab, storedPass)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {TAB_CONFIG.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Logs */}
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="glass p-4 space-y-1 max-h-[75vh] overflow-y-auto scrollbar-hide">
            {logs.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">Nenhum log encontrado</p>
            ) : (
              logs.map((log, i) => (
                <div
                  key={log.id || i}
                  className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-xs font-mono transition-colors"
                >
                  <span className="text-muted-foreground whitespace-nowrap flex-shrink-0">
                    {formatDate(log.created_at || log.visited_at || log.accessed_at || "")}
                  </span>
                  <span className="text-foreground break-all">
                    {activeTab === "resolve" && (
                      <>
                        <span className={log.success ? "text-emerald-400" : "text-red-400"}>
                          {log.success ? "✓" : "✗"}
                        </span>{" "}
                        {log.title} {log.season != null && `S${log.season}E${log.episode}`}{" "}
                        <span className="text-muted-foreground">({log.provider})</span>
                        {log.error_message && (
                          <span className="text-red-400/70 ml-2">{log.error_message}</span>
                        )}
                      </>
                    )}
                    {activeTab === "visitors" && (
                      <>
                        <span className="text-primary">{log.pathname || "/"}</span>{" "}
                        <span className="text-muted-foreground">{log.hostname}</span>{" "}
                        {log.referrer && <span className="text-muted-foreground/60">← {log.referrer}</span>}
                      </>
                    )}
                    {activeTab === "api" && (
                      <>
                        <span className={log.blocked ? "text-red-400" : "text-emerald-400"}>
                          {log.blocked ? "BLOCKED" : "OK"}
                        </span>{" "}
                        {log.endpoint}{" "}
                        {log.reason && <span className="text-muted-foreground">({log.reason})</span>}
                      </>
                    )}
                    {activeTab === "auth" && (
                      <>
                        <span className="text-primary">{log.event}</span>{" "}
                        <span className="text-muted-foreground">{log.user_id?.slice(0, 8)}...</span>
                      </>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicLogsPage;
