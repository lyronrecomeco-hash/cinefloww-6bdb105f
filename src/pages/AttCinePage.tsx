import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Check, Globe, Image, KeyRound, Loader2, Save, Type } from "lucide-react";

const PARTNER_ID = "5fd77e38-a00f-431a-af82-ed88ecb51430";
const ACCESS_KEY = "cineveo2026";

type PartnerForm = {
  name: string;
  logo_url: string;
  website_url: string;
};

const EMPTY_FORM: PartnerForm = {
  name: "",
  logo_url: "",
  website_url: "",
};

const AttCinePage = () => {
  const [authed, setAuthed] = useState(false);
  const [accessKey, setAccessKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<PartnerForm>(EMPTY_FORM);
  const [current, setCurrent] = useState<PartnerForm>(EMPTY_FORM);

  const hasChanges = useMemo(() => {
    return form.name !== current.name || form.logo_url !== current.logo_url || form.website_url !== current.website_url;
  }, [form, current]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("partners")
        .select("name, logo_url, website_url")
        .eq("id", PARTNER_ID)
        .single();

      if (error) throw error;

      const next = {
        name: data?.name || "",
        logo_url: data?.logo_url || "",
        website_url: data?.website_url || "",
      };

      setCurrent(next);
      setForm(next);
    } catch (err: any) {
      toast({ title: "Erro ao carregar", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authed) loadData();
  }, [authed]);

  const handleAuth = () => {
    if (accessKey.trim() !== ACCESS_KEY) {
      toast({ title: "Chave inválida", variant: "destructive" });
      return;
    }
    setAuthed(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        logo_url: form.logo_url.trim() || null,
        website_url: form.website_url.trim() || null,
      };

      const { error } = await supabase.from("partners").update(payload).eq("id", PARTNER_ID);
      if (error) throw error;

      const next = {
        name: payload.name,
        logo_url: payload.logo_url || "",
        website_url: payload.website_url || "",
      };

      setCurrent(next);
      setForm(next);
      setSaved(true);
      toast({ title: "Informações atualizadas" });
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof PartnerForm, value: string) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-background px-4 py-10">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center justify-center">
          <div className="glass w-full p-6 sm:p-8 space-y-6">
            <div className="space-y-3 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <KeyRound className="h-6 w-6" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold text-foreground">Painel CineVeo</h1>
                <p className="mt-1 text-sm text-muted-foreground">Entre com a chave para editar o que já está salvo.</p>
              </div>
            </div>

            <div className="space-y-3">
              <input
                type="password"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                placeholder="Chave de acesso"
                className="h-11 w-full rounded-xl border border-border bg-secondary px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
                autoFocus
              />
              <button
                onClick={handleAuth}
                className="flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Entrar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6 animate-page-enter">
        <div className="glass p-6 sm:p-7 space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-secondary border border-border flex-shrink-0">
                {form.logo_url ? (
                  <img
                    src={form.logo_url}
                    alt={form.name || "CineVeo"}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <Image className="h-6 w-6 text-muted-foreground" />
                )}
              </div>

              <div className="min-w-0">
                <h1 className="font-display text-2xl font-bold text-foreground">Painel CineVeo</h1>
                <p className="text-sm text-muted-foreground">Atualize apenas nome, logo e URL do site.</p>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saving ? "Salvando..." : saved ? "Salvo" : "Salvar"}
            </button>
          </div>

          <p className="text-xs text-muted-foreground">Os campos abaixo já carregam os valores atuais que estão salvos em configurações.</p>
        </div>

        <div className="glass p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Type className="h-4 w-4" />
            </div>
            <h2 className="font-display text-lg font-bold text-foreground">Editar parceiro</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">Nome</label>
              <input
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
                placeholder="CineVeo"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">URL do site</label>
              <input
                value={form.website_url}
                onChange={(e) => updateField("website_url", e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
                placeholder="https://cineveo.lat"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 flex items-center gap-2 text-[10px] font-medium uppercase text-muted-foreground">
              <Image className="h-3.5 w-3.5" />
              URL da logo
            </label>
            <input
              value={form.logo_url}
              onChange={(e) => updateField("logo_url", e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
              placeholder="https://exemplo.com/logo.png"
            />
          </div>
        </div>

        <div className="glass p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Globe className="h-4 w-4" />
            </div>
            <h2 className="font-display text-lg font-bold text-foreground">Configuração salva atual</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-[96px_1fr] sm:items-center rounded-xl border border-border bg-card/50 p-4">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-border bg-secondary">
              {current.logo_url ? (
                <img src={current.logo_url} alt={current.name || "CineVeo"} className="h-full w-full object-cover" />
              ) : (
                <Image className="h-6 w-6 text-muted-foreground" />
              )}
            </div>

            <div className="min-w-0 space-y-2">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Nome atual</p>
                <p className="truncate text-sm font-semibold text-foreground">{current.name || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Site atual</p>
                <p className="truncate text-sm text-foreground">{current.website_url || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Logo atual</p>
                <p className="truncate text-sm text-foreground">{current.logo_url || "—"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AttCinePage;
