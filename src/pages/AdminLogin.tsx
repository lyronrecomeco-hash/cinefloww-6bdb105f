import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Loader2, Shield, Lock, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import LyneflixLogo from "@/components/LyneflixLogo";

const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;

      const { data: roles, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .in("role", ["admin", "moderator"]);

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
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-primary/8 blur-[180px] animate-pulse" style={{ animationDuration: "4s" }} />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[150px] animate-pulse" style={{ animationDuration: "6s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-primary/3 blur-[100px] animate-pulse" style={{ animationDuration: "8s" }} />
        
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: "linear-gradient(hsl(var(--primary) / 0.3) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary) / 0.3) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }} />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo + Title */}
        <div className="text-center mb-8">
          <div className="relative inline-block mb-4">
            <LyneflixLogo size="md" animate={false} />
            {/* Subtle glow behind logo */}
            <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-full scale-150 -z-10" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-primary/40" />
            <Shield className="w-4 h-4 text-primary/70" />
            <span className="text-xs font-medium tracking-[0.15em] text-primary/70 uppercase">Painel Administrativo</span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-primary/40" />
          </div>
        </div>

        {/* Form Card */}
        <div className="glass-strong rounded-2xl p-8 relative overflow-hidden">
          {/* Top accent line */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
          
          <h2 className="font-display text-xl font-bold text-center mb-1">Acesse sua conta</h2>
          <p className="text-sm text-muted-foreground text-center mb-8">
            Digite seus dados para entrar no painel.
          </p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                E-mail
              </label>
              <div className={`relative transition-all duration-300 ${focused === "email" ? "scale-[1.01]" : ""}`}>
                <Mail className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-300 ${focused === "email" ? "text-primary" : "text-muted-foreground/40"}`} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocused("email")}
                  onBlur={() => setFocused(null)}
                  placeholder="seu@email.com"
                  className="w-full h-12 pl-11 pr-4 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:bg-white/[0.07] focus:shadow-[0_0_20px_-5px_hsl(var(--primary)/0.15)] transition-all duration-300"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Senha
              </label>
              <div className={`relative transition-all duration-300 ${focused === "password" ? "scale-[1.01]" : ""}`}>
                <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-300 ${focused === "password" ? "text-primary" : "text-muted-foreground/40"}`} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocused("password")}
                  onBlur={() => setFocused(null)}
                  placeholder="••••••••"
                  className="w-full h-12 pl-11 pr-4 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:bg-white/[0.07] focus:shadow-[0_0_20px_-5px_hsl(var(--primary)/0.15)] transition-all duration-300"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:opacity-90 hover:shadow-lg hover:shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 relative overflow-hidden group"
            >
              {/* Shine effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>ENTRAR <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></>
              )}
            </button>
          </form>

          <div className="flex items-center gap-3 mt-6">
            <div className="flex-1 h-px bg-white/5" />
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Acesso restrito</p>
            <div className="flex-1 h-px bg-white/5" />
          </div>

          <p className="text-xs text-muted-foreground text-center mt-4">
            Dificuldades no acesso? Contatar o suporte
          </p>
        </div>

        {/* Security badge */}
        <div className="flex items-center justify-center gap-1.5 mt-4 text-[10px] text-muted-foreground/40">
          <Lock className="w-3 h-3" />
          <span>Conexão segura e criptografada</span>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
