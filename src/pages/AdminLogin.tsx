import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;

      // Check admin role
      const { data: roles, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .eq("role", "admin");

      if (roleError || !roles?.length) {
        await supabase.auth.signOut();
        throw new Error("Acesso negado. Você não tem permissão de administrador.");
      }

      navigate("/admin");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message || "Credenciais inválidas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/10 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-purple-600/10 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-4xl glass-strong overflow-hidden grid grid-cols-1 md:grid-cols-2">
        {/* Left side - Branding */}
        <div className="relative p-8 md:p-12 flex flex-col justify-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-purple-600/10 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-background/50 to-transparent" />
          
          {/* Animated orb */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px]">
            <div className="w-full h-full rounded-full bg-gradient-to-br from-primary/40 via-cyan-400/20 to-purple-600/30 blur-[60px] animate-pulse" />
          </div>

          <div className="relative z-10">
            <p className="text-xs font-medium tracking-[0.2em] text-primary/80 mb-4 uppercase">Cineflow Admin v1.0</p>
            <h1 className="font-display text-3xl md:text-4xl font-bold leading-tight mb-3">
              Gerencie seu<br />
              <span className="text-gradient">Catálogo.</span>
            </h1>
            <p className="text-sm text-muted-foreground max-w-[280px]">
              Painel administrativo para gerenciar filmes, séries, doramas e animes.
            </p>
          </div>
        </div>

        {/* Right side - Login form */}
        <div className="p-8 md:p-12 flex flex-col justify-center bg-white/[0.02]">
          <div className="flex justify-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <span className="text-primary font-display font-bold text-xl">C</span>
            </div>
          </div>

          <h2 className="font-display text-xl font-bold text-center mb-1">Acesse sua conta</h2>
          <p className="text-sm text-muted-foreground text-center mb-8">
            Bem-vindo de volta. Digite seus dados para entrar.
          </p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-purple-600 text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>ENTRAR <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Dificuldades no acesso? Contatar o suporte
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
