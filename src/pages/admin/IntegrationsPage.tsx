import { useState } from "react";
import { Smartphone, Settings, Palette, Bell, Shield, Globe, Download, Info, ChevronRight, Layers } from "lucide-react";

type TabKey = "geral" | "aparencia" | "notificacoes" | "versoes";

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "geral", label: "Geral", icon: <Settings className="w-4 h-4" /> },
  { key: "aparencia", label: "Aparência", icon: <Palette className="w-4 h-4" /> },
  { key: "notificacoes", label: "Notificações", icon: <Bell className="w-4 h-4" /> },
  { key: "versoes", label: "Versões", icon: <Layers className="w-4 h-4" /> },
];

const IntegrationsPage = () => {
  const [tab, setTab] = useState<TabKey>("geral");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <Smartphone className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-display">Aplicativo</h1>
          <p className="text-xs text-muted-foreground">Gerencie o app Android LyneFlix</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 w-fit flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? "bg-primary/15 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "geral" && <TabGeral />}
      {tab === "aparencia" && <TabAparencia />}
      {tab === "notificacoes" && <TabNotificacoes />}
      {tab === "versoes" && <TabVersoes />}
    </div>
  );
};

/* ─── Tab Geral ─── */
const TabGeral = () => (
  <div className="space-y-4">
    <SectionCard title="Informações do App" icon={<Info className="w-4 h-4" />}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <InfoRow label="Nome do pacote" value="com.lyneflix.online" />
        <InfoRow label="Plataforma" value="Android (Kotlin / Jetpack Compose)" />
        <InfoRow label="API Backend" value="Edge Functions (app-catalog)" />
        <InfoRow label="Autenticação" value="Supabase Auth" />
      </div>
    </SectionCard>

    <SectionCard title="Configurações Gerais" icon={<Settings className="w-4 h-4" />}>
      <div className="space-y-3">
        <SettingRow label="Catálogo paginado" description="Itens por página retornados pela API" value="20" />
        <SettingRow label="Cache de imagens" description="TTL do cache de posters no dispositivo" value="30 min" />
        <SettingRow label="Hero Slider" description="Quantidade de banners no carrossel da Home" value="6" />
        <SettingRow label="Busca local" description="Busca primeiro nos dados em memória antes da API" value="Ativo" />
      </div>
    </SectionCard>

    <SectionCard title="Endpoints" icon={<Globe className="w-4 h-4" />}>
      <div className="space-y-2">
        <EndpointRow method="GET" path="/app-catalog?type=movie&page=1" description="Catálogo de filmes" />
        <EndpointRow method="GET" path="/app-catalog?type=series&page=1" description="Catálogo de séries" />
        <EndpointRow method="GET" path="/app-catalog?type=anime&page=1" description="Catálogo de animes" />
        <EndpointRow method="GET" path="/app-catalog?action=search&q=..." description="Busca global" />
        <EndpointRow method="GET" path="/app-catalog?action=featured" description="Destaques / Em Alta" />
      </div>
    </SectionCard>
  </div>
);

/* ─── Tab Aparência ─── */
const TabAparencia = () => (
  <div className="space-y-4">
    <SectionCard title="Tema do App" icon={<Palette className="w-4 h-4" />}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ColorSwatch label="Background" color="#0A0D16" token="LyneBg" />
        <ColorSwatch label="Card" color="#111628" token="LyneCard" />
        <ColorSwatch label="Accent" color="#3B82F6" token="LyneAccent" />
        <ColorSwatch label="Text" color="#FFFFFF" token="LyneText" />
        <ColorSwatch label="Muted" color="#6B7280" token="LyneMuted" />
        <ColorSwatch label="Gold" color="#FFD700" token="LyneGold" />
        <ColorSwatch label="Red" color="#EF4444" token="LyneRed" />
        <ColorSwatch label="Secondary" color="#8A8A9A" token="LyneTextSecondary" />
      </div>
    </SectionCard>

    <SectionCard title="Layout" icon={<Layers className="w-4 h-4" />}>
      <div className="space-y-3">
        <SettingRow label="Grid de catálogo" description="Colunas fixas na grade de conteúdo" value="3 colunas" />
        <SettingRow label="Bottom Nav" description="Altura do menu inferior" value="64dp" />
        <SettingRow label="Card corners" description="Raio dos cantos dos cards" value="10dp" />
        <SettingRow label="Poster ratio" description="Proporção dos posters" value="2:3" />
      </div>
    </SectionCard>

    <SectionCard title="Telas" icon={<Smartphone className="w-4 h-4" />}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {["Início (Home)", "Filmes", "Séries", "Animes", "Conta / Auth", "Detalhes", "Player", "Busca", "Perfis"].map((screen) => (
          <div key={screen} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/5">
            <ChevronRight className="w-3 h-3 text-primary" />
            <span className="text-sm text-foreground">{screen}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  </div>
);

/* ─── Tab Notificações ─── */
const TabNotificacoes = () => (
  <div className="space-y-4">
    <SectionCard title="Push Notifications" icon={<Bell className="w-4 h-4" />}>
      <div className="space-y-3">
        <SettingRow label="Status" description="Sistema de notificações push" value="Planejado" />
        <SettingRow label="Provider" description="Serviço de push" value="Firebase Cloud Messaging" />
      </div>
      <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
        <p className="text-xs text-yellow-400">⚠️ Notificações push ainda não implementadas no app. Em breve!</p>
      </div>
    </SectionCard>
  </div>
);

/* ─── Tab Versões ─── */
const TabVersoes = () => (
  <div className="space-y-4">
    <SectionCard title="Controle de Versões" icon={<Download className="w-4 h-4" />}>
      <div className="space-y-3">
        <SettingRow label="Versão atual" description="Versão mais recente do APK" value="1.0.0" />
        <SettingRow label="Min SDK" description="Versão mínima do Android" value="API 24 (Android 7.0)" />
        <SettingRow label="Target SDK" description="Versão alvo do Android" value="API 34 (Android 14)" />
        <SettingRow label="Build" description="Tipo de build" value="Release (ProGuard)" />
      </div>
    </SectionCard>

    <SectionCard title="Distribuição" icon={<Shield className="w-4 h-4" />}>
      <div className="space-y-3">
        <SettingRow label="Canal" description="Forma de distribuição" value="APK direto (site)" />
        <SettingRow label="Auto-update" description="Verificação automática de atualizações" value="Planejado" />
      </div>
    </SectionCard>
  </div>
);

/* ─── Componentes auxiliares ─── */
const SectionCard = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="rounded-xl bg-white/[0.03] border border-white/10 p-5">
    <div className="flex items-center gap-2 mb-4">
      <span className="text-primary">{icon}</span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
    {children}
  </div>
);

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="space-y-1">
    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
    <p className="text-sm text-foreground font-medium">{value}</p>
  </div>
);

const SettingRow = ({ label, description, value }: { label: string; description: string; value: string }) => (
  <div className="flex items-center justify-between gap-4 py-2 border-b border-white/5 last:border-0">
    <div>
      <p className="text-sm text-foreground font-medium">{label}</p>
      <p className="text-[11px] text-muted-foreground">{description}</p>
    </div>
    <span className="text-xs text-primary font-mono bg-primary/10 px-2 py-1 rounded-md whitespace-nowrap">{value}</span>
  </div>
);

const EndpointRow = ({ method, path, description }: { method: string; path: string; description: string }) => (
  <div className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
    <span className="text-[10px] font-bold text-green-400 bg-green-400/10 px-2 py-0.5 rounded">{method}</span>
    <code className="text-xs text-foreground/80 font-mono flex-1 truncate">{path}</code>
    <span className="text-[11px] text-muted-foreground hidden sm:block">{description}</span>
  </div>
);

const ColorSwatch = ({ label, color, token }: { label: string; color: string; token: string }) => (
  <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
    <div className="w-8 h-8 rounded-md border border-white/10" style={{ backgroundColor: color }} />
    <div>
      <p className="text-xs text-foreground font-medium">{label}</p>
      <p className="text-[10px] text-muted-foreground font-mono">{token}</p>
    </div>
  </div>
);

export default IntegrationsPage;
