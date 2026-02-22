import { useState } from "react";
import { Bot } from "lucide-react";

// Lazy-load the actual content from existing pages
import DiscordBotPage from "./DiscordBotPage";
import TelegramPage from "./TelegramPage";

const IntegrationsPage = () => {
  const [tab, setTab] = useState<"discord" | "telegram">("discord");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <Bot className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-display">Integrações</h1>
          <p className="text-xs text-muted-foreground">Discord Bot & Telegram Bot</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 w-fit">
        <button
          onClick={() => setTab("discord")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "discord"
              ? "bg-[#5865F2]/15 text-[#5865F2] border border-[#5865F2]/20"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          🎮 Discord
        </button>
        <button
          onClick={() => setTab("telegram")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "telegram"
              ? "bg-[#0088cc]/15 text-[#0088cc] border border-[#0088cc]/20"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          📨 Telegram
        </button>
      </div>

      {/* Content */}
      {tab === "discord" ? <DiscordBotPage /> : <TelegramPage />}
    </div>
  );
};

export default IntegrationsPage;
