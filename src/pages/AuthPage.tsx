import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Loader2, Mail, Lock, User, Eye, EyeOff, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const AuthPage = () => {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    setMounted(true);
    // If already logged in, go to profile selector
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/perfis");
    });
  }, [navigate]);

  const getIpHash = async () => {
    try {
      const data = new TextEncoder().encode(navigator.userAgent + Date.now());
      const hash = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hash)).slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
    } catch { return "unknown"; }
  };

  const logAuthEvent = async (event: string, userId?: string, metadata?: Record<string, unknown>) => {
    const ipHash = await getIpHash();
    try {
      await supabase.from("auth_audit_log").insert([{
        user_id: userId || null,
        event,
        ip_hash: ipHash,
        user_agent: navigator.userAgent.substring(0, 200),
        metadata: (metadata || {}) as any,
      }]);
    } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    if (mode === "signup" && !name.trim()) return;
    if (password.length < 6) {
      toast({ title: "Erro", description: "A senha deve ter pelo menos 6 caracteres", variant: "destructive" });
      return;
    }
    setLoading(true);

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { name: name.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        await logAuthEvent("signup", data.user?.id, { email: email.trim() });

        // Check if email confirmation is required
        if (data.user && !data.session) {
          toast({ title: "Verifique seu e-mail", description: "Enviamos um link de confirmação para seu e-mail." });
        } else if (data.session) {
          // Auto-create default profile
          await supabase.from("user_profiles").insert({
            user_id: data.user!.id,
            name: name.trim(),
            is_default: true,
            avatar_index: Math.floor(Math.random() * 8),
          });
          navigate("/perfis");
        }
      } else {
        // Check if banned
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          await logAuthEvent("login_failed", undefined, { email: email.trim(), error: error.message });
          throw error;
        }

        // Check ban status
        const { data: profile } = await supabase
          .from("profiles")
          .select("banned, ban_reason")
          .eq("user_id", data.user.id)
          .single();

        if (profile?.banned) {
          await supabase.auth.signOut();
          await logAuthEvent("login_banned", data.user.id);
          toast({
            title: "Conta suspensa",
            description: profile.ban_reason || "Sua conta foi suspensa. Contate o suporte.",
            variant: "destructive",
          });
          return;
        }

        // Update profile login info
        const ipHash = await getIpHash();
        await supabase
          .from("profiles")
          .update({
            last_login_at: new Date().toISOString(),
            login_count: (profile as any)?.login_count ? (profile as any).login_count + 1 : 1,
            ip_hash: ipHash,
          })
          .eq("user_id", data.user.id);

        await logAuthEvent("login_success", data.user.id);

        // Check if has profiles
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("user_id", data.user.id);

        if (!profiles?.length) {
          // Create default profile
          await supabase.from("user_profiles").insert({
            user_id: data.user.id,
            name: data.user.user_metadata?.name || email.split("@")[0],
            is_default: true,
            avatar_index: Math.floor(Math.random() * 8),
          });
        }

        navigate("/perfis");
      }
    } catch (err: any) {
      const msg = err.message?.includes("Invalid login")
        ? "E-mail ou senha incorretos"
        : err.message || "Erro ao processar";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Cinematic background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[url('https://image.tmdb.org/t/p/original/9faGSFi5jam6pDWGNd0p8JcJgXQ.jpg')] bg-cover bg-center opacity-[0.12]" />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/85 to-background" />
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-primary/8 blur-[150px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-blue-600/8 blur-[120px] animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      <div
        className={`w-full max-w-md transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
      >
        {/* Glass card */}
        <div className="glass-strong rounded-3xl p-8 sm:p-10 relative overflow-hidden">
          {/* Security badge */}
          <div className="absolute top-4 right-4 flex items-center gap-1 text-[10px] text-emerald-400/60 uppercase tracking-widest">
            <Shield className="w-3 h-3" />
            <span>E2E</span>
          </div>

          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/30 to-purple-600/20 border border-white/10 flex items-center justify-center">
              <span className="text-primary font-display font-bold text-2xl">L</span>
            </div>
          </div>

          <h1 className="font-display text-2xl font-bold text-center mb-1">
            {mode === "login" ? "Bem-vindo de volta" : "Crie sua conta"}
          </h1>
          <p className="text-sm text-muted-foreground text-center mb-8">
            {mode === "login"
              ? "Entre para continuar assistindo"
              : "Cadastre-se para salvar sua lista e muito mais"}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className={`transition-all duration-500 ${mode === "signup" ? "opacity-100 max-h-20" : "opacity-0 max-h-0 overflow-hidden"}`}>
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Nome
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    className="w-full h-12 pl-11 pr-4 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                    maxLength={50}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full h-12 pl-11 pr-4 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                  required
                  maxLength={255}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-12 pl-11 pr-12 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                  required
                  minLength={6}
                  maxLength={72}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-purple-600 text-white hover:opacity-90 disabled:opacity-50 mt-6"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  {mode === "login" ? "ENTRAR" : "CRIAR CONTA"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {mode === "login" ? (
                <>Não tem conta? <span className="text-primary font-medium">Cadastre-se</span></>
              ) : (
                <>Já tem conta? <span className="text-primary font-medium">Entrar</span></>
              )}
            </button>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground/40 text-center mt-4">
          Protegido com criptografia ponta a ponta
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
