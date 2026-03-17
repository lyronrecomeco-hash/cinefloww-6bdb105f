import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Check, Loader2, Image, Globe, Type } from "lucide-react";

const PARTNER_ID = "5fd77e38-a00f-431a-af82-ed88ecb51430";
const ACCESS_KEY = "cineveo2026";

const AttCinePage = () => {
  const [authed, setAuthed] = useState(false);
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [saved, setSaved] = useState(false);

  const handleAuth = () => {
    if (key === ACCESS_KEY) {
      setAuthed(true);
      loadData();
    } else {
      toast({ title: "Chave inválida", variant: "destructive" });
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("partners")
        .select("name, logo_url, website_url")
        .eq("id", PARTNER_ID)
        .single();
      if (data) {
        setName(data.name || "");
        setLogoUrl(data.logo_url || "");
        setWebsiteUrl(data.website_url || "");
      }
    } catch {}
    setLoading(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("partners")
        .update({
          name: name.trim(),
          logo_url: logoUrl.trim() || null,
          website_url: websiteUrl.trim() || null,
        })
        .eq("id", PARTNER_ID);

      if (error) throw error;
      setSaved(true);
      toast({ title: "Atualizado com sucesso!" });
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <Globe className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Painel CineVeo</h1>
            <p className="text-sm text-muted-foreground">Insira a chave de acesso</p>
          </div>

          <div className="space-y-3">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAuth()}
              placeholder="Chave de acesso"
              className="w-full h-12 px-4 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
              autoFocus
            />
            <button
              onClick={handleAuth}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
            >
              Entrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={name}
              className="w-20 h-20 rounded-2xl object-cover mx-auto border border-border"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          )}
          <h1 className="text-2xl font-bold text-foreground">Painel CineVeo</h1>
          <p className="text-sm text-muted-foreground">
            Atualize as informações exibidas no site
          </p>
        </div>

        {/* Form */}
        <div className="rounded-2xl bg-card border border-border p-6 space-y-5">
          {/* Nome */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Type className="w-3.5 h-3.5" />
              Nome
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do parceiro"
              className="w-full h-11 px-4 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
            />
          </div>

          {/* Logo URL */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Image className="w-3.5 h-3.5" />
              URL da Logo
            </label>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://exemplo.com/logo.png"
              className="w-full h-11 px-4 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
            />
            {logoUrl && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border">
                <img
                  src={logoUrl}
                  alt="Preview"
                  className="w-12 h-12 rounded-lg object-cover border border-border"
                  onError={(e) => (e.currentTarget.src = "/placeholder.svg")}
                />
                <span className="text-xs text-muted-foreground truncate flex-1">{logoUrl}</span>
              </div>
            )}
          </div>

          {/* Website URL */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Globe className="w-3.5 h-3.5" />
              URL do Site
            </label>
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://cineveo.lat"
              className="w-full h-11 px-4 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
            />
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className={`w-full h-12 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
              saved
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            } disabled:opacity-50`}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <Check className="w-4 h-4" />
            ) : null}
            {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar Alterações"}
          </button>
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          Alterações são refletidas imediatamente no site
        </p>
      </div>
    </div>
  );
};

export default AttCinePage;
