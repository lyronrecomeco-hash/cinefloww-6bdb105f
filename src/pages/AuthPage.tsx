import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Loader2, Mail, Lock, User, Eye, EyeOff, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import LyneflixLogo from "@/components/LyneflixLogo";
import { getTrending, backdropUrl, getDisplayTitle, getYear, TMDBMovie } from "@/services/tmdb";

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

    // Helper: race a promise against a timeout
    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} demorou demais. Tente novamente.`)), ms)),
      ]);

    try {
      if (mode === "signup") {
        const { data, error } = await withTimeout(
          supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: { name: name.trim() },
              emailRedirectTo: "https://lyneflix.online",
            },
          }),
          15000,
          "Cadastro"
        );
        if (error) throw error;
        // Fire-and-forget audit
        logAuthEvent("signup", data.user?.id, { email: email.trim() }).catch(() => {});

        if (data.session) {
          Promise.resolve(supabase.from("user_profiles").insert({
            user_id: data.user!.id,
            name: name.trim(),
            is_default: true,
            avatar_index: Math.floor(Math.random() * 8),
          })).catch(() => {});
          navigate("/perfis");
        }
      } else {
        const { data, error } = await withTimeout(
          supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          }),
          15000,
          "Login"
        );
        if (error) {
          logAuthEvent("login_failed", undefined, { email: email.trim(), error: error.message }).catch(() => {});
          throw error;
        }

        // Fire-and-forget: audit + profile check (don't block navigation)
        logAuthEvent("login_success", data.user.id).catch(() => {});

        // Background profile/ban check — don't block login
        (async () => {
          try {
            const { data: profile } = await Promise.race([
              supabase.from("profiles").select("banned, ban_reason, login_count").eq("user_id", data.user.id).single(),
              new Promise<null>((r) => setTimeout(() => r(null), 4000)),
            ]) as any;

            if (profile?.banned) {
              await supabase.auth.signOut();
              toast({
                title: "Conta suspensa",
                description: profile.ban_reason || "Sua conta foi suspensa. Contate o suporte.",
                variant: "destructive",
              });
              navigate("/conta");
              return;
            }

            // Update login stats (fire-and-forget)
            const ipHash = await getIpHash();
            Promise.resolve(supabase.from("profiles").update({
              last_login_at: new Date().toISOString(),
              login_count: (profile?.login_count || 0) + 1,
              ip_hash: ipHash,
            }).eq("user_id", data.user.id)).catch(() => {});
          } catch {}
        })();

        // Ensure user_profiles exist (fire-and-forget)
        Promise.resolve(supabase.from("user_profiles").select("id").eq("user_id", data.user.id)).then(({ data: profiles }) => {
          if (!profiles?.length) {
            Promise.resolve(supabase.from("user_profiles").insert({
              user_id: data.user.id,
              name: data.user.user_metadata?.name || email.split("@")[0],
              is_default: true,
              avatar_index: Math.floor(Math.random() * 8),
            })).catch(() => {});
          }
        }).catch(() => {});

        // Navigate immediately — don't wait for DB checks
        navigate("/perfis");
      }
    } catch (err: any) {
      const msg = err.message?.includes("Invalid login")
        ? "E-mail ou senha incorretos"
        : err.message?.includes("demorou demais")
        ? "O servidor está lento. Tente novamente em alguns segundos."
        : err.message || "Erro ao processar";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const currentMovie = banners[currentBanner];

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* LEFT SIDE — Banner Slider */}
      <div className="relative w-full lg:w-[55%] xl:w-[60%] h-[280px] sm:h-[340px] lg:h-screen flex-shrink-0 overflow-hidden">
        {banners.map((banner, i) => (
          <div
            key={banner.id}
            className={`absolute inset-0 transition-opacity duration-1000 ${
              i === currentBanner ? "opacity-100" : "opacity-0"
            }`}
          >
            <img
              src={backdropUrl(banner.backdrop_path, "original")}
              alt={getDisplayTitle(banner)}
              className="w-full h-full object-cover"
              loading={i === 0 ? "eager" : "lazy"}
            />
          </div>
        ))}
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/40 lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-background" />
        <div className="absolute inset-0 bg-background/30" />

        {/* Movie info overlay */}
        {currentMovie && (
          <div className="absolute bottom-6 left-6 right-6 lg:bottom-12 lg:left-12 lg:right-24 z-10">
            <h2 className="font-display text-lg sm:text-xl lg:text-3xl font-bold text-white drop-shadow-lg line-clamp-2">
              {getDisplayTitle(currentMovie)}
            </h2>
            <div className="flex items-center gap-3 mt-2 text-white/70 text-xs sm:text-sm">
              {currentMovie.vote_average > 0 && (
                <span className="flex items-center gap-1">
                  <span className="text-yellow-400">★</span>
                  {currentMovie.vote_average.toFixed(1)}
                </span>
              )}
              {getYear(currentMovie) && <span>{getYear(currentMovie)}</span>}
            </div>
          </div>
        )}

        {/* Dot indicators */}
        {banners.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 lg:bottom-6 lg:left-12 lg:translate-x-0 flex gap-1.5 z-10">
            {banners.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentBanner(i)}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === currentBanner ? "w-6 bg-primary" : "w-1.5 bg-white/30"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* RIGHT SIDE — Auth Form */}
      <div className="flex-1 flex items-center justify-center px-5 py-8 sm:py-12 lg:py-0">
        <div
          className={`w-full max-w-[400px] transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          {/* Logo */}
          <div className="flex justify-center mb-6 lg:mb-8">
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
      </div>
    </div>
  );
};

export default AuthPage;
