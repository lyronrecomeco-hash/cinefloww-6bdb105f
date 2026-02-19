import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Loader2, Mail, Lock, User, Eye, EyeOff, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import LyneflixLogo from "@/components/LyneflixLogo";
import { getTrending, backdropUrl, TMDBMovie } from "@/services/tmdb";

const AuthPage = () => {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [banners, setBanners] = useState<TMDBMovie[]>([]);
  const [currentBanner, setCurrentBanner] = useState(0);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    setMounted(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/perfis");
    });
    getTrending().then(res => {
      const valid = res.results.filter((m: TMDBMovie) => m.backdrop_path).slice(0, 8);
      setBanners(valid);
    }).catch(() => {});
  }, [navigate]);

  // Auto-rotate banners
  useEffect(() => {
    if (banners.length < 2) return;
    const timer = setInterval(() => {
      setCurrentBanner(prev => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [banners.length]);

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

        if (data.user && !data.session) {
          toast({ title: "Verifique seu e-mail", description: "Enviamos um link de confirmação para seu e-mail." });
        } else if (data.session) {
          await supabase.from("user_profiles").insert({
            user_id: data.user!.id,
            name: name.trim(),
            is_default: true,
            avatar_index: Math.floor(Math.random() * 8),
          });
          navigate("/perfis");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          await logAuthEvent("login_failed", undefined, { email: email.trim(), error: error.message });
          throw error;
        }

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

        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("user_id", data.user.id);

        if (!profiles?.length) {
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
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      {/* Background banner slider */}
      <div className="absolute inset-0 z-0">
        {banners.map((banner, i) => (
          <div
            key={banner.id}
            className={`absolute inset-0 transition-opacity duration-1000 ${
              i === currentBanner ? "opacity-100" : "opacity-0"
            }`}
          >
            <img
              src={backdropUrl(banner.backdrop_path, "original")}
              alt=""
              className="w-full h-full object-cover"
              loading={i === 0 ? "eager" : "lazy"}
            />
          </div>
        ))}
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-background/30" />
      </div>

      <div
        className={`relative z-10 w-full max-w-md mx-4 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
      >
        {/* Glass card */}
        <div className="glass-strong rounded-2xl overflow-hidden border border-white/10 p-6 sm:p-8">
          
          {/* Logo */}
          <div className="flex justify-center mb-5">
            <LyneflixLogo size="lg" animate={true} />
          </div>

          <h1 className="font-display text-xl sm:text-2xl font-bold text-center mb-1">
            {mode === "login" ? "Acesse sua conta" : "Crie sua conta"}
          </h1>
          <p className="text-sm text-muted-foreground text-center mb-6">
            {mode === "login"
              ? "Bem-vindo de volta. Digite seus dados para entrar."
              : "Cadastre-se para salvar sua lista e muito mais."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Nome
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    className="w-full h-11 pl-10 pr-4 rounded-lg bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 transition-colors"
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
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full h-11 pl-10 pr-4 rounded-lg bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 transition-colors"
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
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-11 pl-10 pr-11 rounded-lg bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 transition-colors"
                  required
                  minLength={6}
                  maxLength={72}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 mt-2"
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

          <div className="mt-5 text-center">
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

          <div className="flex items-center justify-center gap-1 mt-4 text-[10px] text-muted-foreground/40 uppercase tracking-widest">
            <Shield className="w-3 h-3" />
            <span>Conexão segura E2E</span>
          </div>
        </div>

        {/* Banner indicators */}
        {banners.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-4">
            {banners.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentBanner(i)}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === currentBanner ? "w-6 bg-primary" : "w-1.5 bg-white/20"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthPage;
