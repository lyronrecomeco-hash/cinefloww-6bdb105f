import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI1MDFiOWNkYjllNDQ0NjkxMDJiODk5YjQ0YjU2MWQ5ZCIsIm5iZiI6MTc3MTIzMDg1My43NjYsInN1YiI6IjY5OTJkNjg1NzZjODAxNTdmMjFhZjMxMSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.c47JvphccOz_oyaUuQWCHQ1mXAsSH01OB14vKE2uenw";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";

const SITE_URL = "https://lyneflix.online";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface UserSession {
  step: string;
  data: Record<string, any>;
  lastMsgIds: number[];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- TMDB helpers ---
async function searchTMDB(query: string, type?: string): Promise<any[]> {
  const endpoint = type === "tv" ? "/search/tv" : type === "movie" ? "/search/movie" : "/search/multi";
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("query", query);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}`, "Content-Type": "application/json" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}

async function getTMDBDetails(id: number, type: "movie" | "tv"): Promise<any> {
  const url = new URL(`${TMDB_BASE}/${type}/${id}`);
  url.searchParams.set("language", "pt-BR");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}`, "Content-Type": "application/json" },
  });
  if (!res.ok) return null;
  return res.json();
}

// --- Telegram helpers ---
async function sendMessage(chatId: number | string, text: string, replyMarkup?: any): Promise<number | null> {
  const body: any = { chat_id: chatId, text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return data.result?.message_id || null;
}

async function sendPhoto(chatId: number | string, photoUrl: string, caption: string, replyMarkup?: any): Promise<number | null> {
  const body: any = { chat_id: chatId, photo: photoUrl, caption, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const res = await fetch(`${TELEGRAM_API}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return data.result?.message_id || null;
}

async function deleteMessages(chatId: number, msgIds: number[]) {
  for (const id of msgIds) {
    try {
      await fetch(`${TELEGRAM_API}/deleteMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, message_id: id }),
      });
    } catch {}
  }
}

async function getSession(chatId: number): Promise<UserSession | null> {
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", `tg_session_${chatId}`)
    .maybeSingle();
  if (!data?.value) return null;
  const s = data.value as any;
  return { step: s.step, data: s.data, lastMsgIds: s.lastMsgIds || [] };
}

async function setSession(chatId: number, session: UserSession | null) {
  if (!session) {
    await supabase.from("site_settings").delete().eq("key", `tg_session_${chatId}`);
    return;
  }
  await supabase.from("site_settings").upsert(
    { key: `tg_session_${chatId}`, value: session as any },
    { onConflict: "key" }
  );
}

async function clearAndSend(chatId: number, session: UserSession, text: string, replyMarkup?: any): Promise<number | null> {
  if (session.lastMsgIds.length > 0) {
    await deleteMessages(chatId, session.lastMsgIds);
    session.lastMsgIds = [];
  }
  const id = await sendMessage(chatId, text, replyMarkup);
  if (id) session.lastMsgIds.push(id);
  return id;
}

async function clearAndSendPhoto(chatId: number, session: UserSession, photoUrl: string, caption: string, replyMarkup?: any): Promise<number | null> {
  if (session.lastMsgIds.length > 0) {
    await deleteMessages(chatId, session.lastMsgIds);
    session.lastMsgIds = [];
  }
  const id = await sendPhoto(chatId, photoUrl, caption, replyMarkup);
  if (id) session.lastMsgIds.push(id);
  return id;
}

async function isAuthorized(userId: number): Promise<boolean> {
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "telegram_authorized_ids")
    .maybeSingle();
  if (data?.value) {
    const ids = (data.value as any)?.ids || [];
    return ids.includes(userId);
  }
  return false;
}

function formatDuration(secs: number | null): string {
  if (!secs) return "N/A";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}min`;
  return `${m}min`;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "N/A";
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  return `${(bytes / 1e6).toFixed(0)} MB`;
}

function extractNameFromText(text: string): { name: string; synopsis: string } {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { name: "", synopsis: "" };
  let name = lines[0];
  name = name.replace(/^(🎬|📺|🎥|📽|nome:|título:|title:|film:|movie:|serie:|series:)\s*/i, "").trim();
  name = name.replace(/\s*\(\d{4}\)\s*$/, "").trim();
  const synopsis = lines.slice(1).join("\n").trim();
  return { name, synopsis };
}

function slugify(text: string, id: number): string {
  const slug = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug}-${id}`;
}

// ==========================================
// CHANNEL FEATURES: Welcome + Auto-Notify
// ==========================================

async function getChannelConfig() {
  const { data } = await supabase
    .from("telegram_config")
    .select("*")
    .limit(1)
    .maybeSingle();
  return data;
}

async function sendWelcomeMessage(chatId: number | string, memberName: string, userId?: number) {
  const config = await getChannelConfig();
  if (!config || !config.welcome_enabled) return;

  // Build user mention: if userId is available, use HTML mention link
  const mention = userId 
    ? `<a href="tg://user?id=${userId}">${memberName}</a>` 
    : memberName;

  const message = (config.welcome_message || "Bem-vindo, {name}! 🎬")
    .replace("{name}", mention)
    .replace("{nome}", mention);

  const imageUrl = config.welcome_image_url;

  const buttons = {
    inline_keyboard: [
      [{ text: "🎬 Acessar LyneFlix", url: SITE_URL }],
    ],
  };

  if (imageUrl) {
    await sendPhoto(chatId, imageUrl, message, buttons);
  } else {
    await sendMessage(chatId, message, buttons);
  }
}

async function notifyNewContent(content: any) {
  const config = await getChannelConfig();
  if (!config || !config.auto_notify_new_content || !config.channel_id) return;

  const channelId = config.channel_id;
  const isMovie = content.content_type === "movie";
  const typeLabel = isMovie ? "Filme" : "Série";
  const typeEmoji = isMovie ? "🎬" : "📺";
  const title = content.title || content.original_title || "Título desconhecido";
  const year = content.release_date ? content.release_date.substring(0, 4) : "";
  const overview = content.overview ? content.overview.substring(0, 200) + (content.overview.length > 200 ? "..." : "") : "";
  const rating = content.vote_average ? `⭐ ${Number(content.vote_average).toFixed(1)}` : "";
  
  const slug = slugify(title, content.tmdb_id);
  const detailUrl = `${SITE_URL}/${isMovie ? "filme" : "serie"}/${slug}`;

  const caption = `🔥 <b>Se liga pessoal, ${typeLabel.toLowerCase()} novo na área, se liga só:</b>\n\n` +
    `${typeEmoji} <b>${title}</b>${year ? ` (${year})` : ""}\n` +
    (rating ? `${rating}\n` : "") +
    (overview ? `\n📝 ${overview}\n` : "") +
    `\n🔗 <b>Assistir agora:</b> ${detailUrl}`;

  const buttons = {
    inline_keyboard: [
      [{ text: `▶️ Assistir ${title}`, url: detailUrl }],
      [{ text: "🏠 Ir para LyneFlix", url: SITE_URL }],
    ],
  };

  const posterPath = content.poster_path;
  if (posterPath) {
    const posterUrl = posterPath.startsWith("http") ? posterPath : `${TMDB_IMG}/w500${posterPath}`;
    await sendPhoto(channelId, posterUrl, caption, buttons);
  } else {
    await sendMessage(channelId, caption, buttons);
  }
}

// ==========================================
// API ACTIONS (called from admin panel)
// ==========================================

async function handleApiAction(action: string, body: any): Promise<Response> {
  switch (action) {
    case "getChats": {
      // Get bot's updates to find chats
      const res = await fetch(`${TELEGRAM_API}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 100 }),
      });
      const data = await res.json();
      const chats = new Map();
      if (data.result) {
        for (const update of data.result) {
          const msg = update.message || update.channel_post || update.my_chat_member?.chat;
          if (msg) {
            const chat = msg.chat || msg;
            if (chat && (chat.type === "channel" || chat.type === "supergroup" || chat.type === "group")) {
              chats.set(chat.id, {
                id: chat.id,
                title: chat.title || "Sem nome",
                type: chat.type,
                username: chat.username || null,
              });
            }
          }
        }
      }
      return new Response(JSON.stringify({ chats: Array.from(chats.values()) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    case "testWelcome": {
      const { channel_id, message, image_url } = body;
      if (!channel_id) {
        return new Response(JSON.stringify({ error: "channel_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const buttons = {
        inline_keyboard: [
          [{ text: "🎬 Acessar LyneFlix", url: SITE_URL }],
        ],
      };

      const text = message || "🎬 Mensagem de teste da LyneFlix!";
      
      try {
        if (image_url) {
          await sendPhoto(channel_id, image_url, text, buttons);
        } else {
          await sendMessage(channel_id, text, buttons);
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    case "notifyContent": {
      // Manually trigger notification for a specific content
      const { content } = body;
      if (!content) {
        return new Response(JSON.stringify({ error: "content required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await notifyNewContent(content);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    case "getBotInfo": {
      const res = await fetch(`${TELEGRAM_API}/getMe`);
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    case "broadcast": {
      const { channel_id, message, image_url } = body;
      if (!channel_id || !message) {
        return new Response(JSON.stringify({ error: "channel_id and message required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        if (image_url) {
          await sendPhoto(channel_id, image_url, message);
        } else {
          await sendMessage(channel_id, message);
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    default:
      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
  }
}

// --- Telegram API helpers for channel management ---
async function getChat(chatIdOrUsername: string | number): Promise<any> {
  const res = await fetch(`${TELEGRAM_API}/getChat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatIdOrUsername }),
  });
  const data = await res.json();
  return data.ok ? data.result : null;
}

async function getChatMemberCount(chatIdOrUsername: string | number): Promise<number> {
  const res = await fetch(`${TELEGRAM_API}/getChatMemberCount`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatIdOrUsername }),
  });
  const data = await res.json();
  return data.ok ? data.result : 0;
}

async function joinChat(inviteLink: string): Promise<any> {
  // Bot can't join via invite link — it needs to be added by admin
  // But we can try getChat to check if bot is already member
  return null;
}

// Save managed channels to site_settings
async function getManagedChannels(): Promise<any[]> {
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "tg_managed_channels")
    .maybeSingle();
  if (!data?.value) return [];
  return (data.value as any)?.channels || [];
}

async function saveManagedChannels(channels: any[]) {
  await supabase.from("site_settings").upsert(
    { key: "tg_managed_channels", value: { channels } as any },
    { onConflict: "key" }
  );
}

// --- Main handlers (ingestor bot) ---
async function handleCommand(chatId: number, userId: number, text: string) {
  const cmd = text.split(" ")[0].toLowerCase().split("@")[0]; // handle /cmd@botname
  const args = text.substring(text.split(" ")[0].length).trim();

  switch (cmd) {
    case "/start":
      await sendMessage(chatId,
        "<b>Bot LyneFlix - Painel de Controle</b>\n\n" +
        "Gerencie tudo pelo privado.\n\n" +
        "<b>Sistema:</b>\n" +
        "/status — Resumo do sistema\n" +
        "/apis — Status dos provedores\n" +
        "/addapi — Adicionar provedor\n" +
        "/raspar — Iniciar raspagem em lote\n" +
        "/raspar_parar — Parar raspagem\n\n" +
        "<b>Canal:</b>\n" +
        "/enviar — Enviar mensagem ao canal principal\n" +
        "/canais — Listar canais gerenciados\n" +
        "/addcanal — Adicionar canal (envie o @ ou link)\n" +
        "/infocanal — Info de um canal\n" +
        "/msgcanal — Enviar msg a um canal gerenciado\n\n" +
        "<b>Descoberta:</b>\n" +
        "/buscar — Buscar canais publicos de filmes/series\n\n" +
        "/cancelar — Cancela operacao atual"
      );
      break;

    case "/cancelar": {
      const session = await getSession(chatId);
      if (session) {
        await deleteMessages(chatId, session.lastMsgIds);
        await setSession(chatId, null);
      }
      await sendMessage(chatId, "Operacao cancelada.");
      break;
    }

    case "/status": {
      const [{ count: totalContent }, { count: cachedVideos }] = await Promise.all([
        supabase.from("content").select("id", { count: "exact", head: true }),
        supabase.from("video_cache").select("id", { count: "exact", head: true }).gt("expires_at", new Date().toISOString()),
      ]);
      
      const config = await getChannelConfig();
      const managed = await getManagedChannels();
      
      await sendMessage(chatId,
        "<b>Status do Sistema</b>\n\n" +
        `<b>Catalogo:</b>\n` +
        `Total conteudo: <b>${totalContent || 0}</b>\n` +
        `Links cacheados: <b>${cachedVideos || 0}</b>\n` +
        `Cobertura: <b>${totalContent ? ((cachedVideos || 0) / (totalContent as number) * 100).toFixed(1) : 0}%</b>\n\n` +
        `<b>Canal Telegram:</b>\n` +
        `Canal: ${config?.channel_username || "Nao configurado"}\n` +
        `Auto-notificacoes: ${config?.auto_notify_new_content ? "Ativas" : "Desativadas"}\n` +
        `Boas-vindas: ${config?.welcome_enabled ? "Ativado" : "Desativado"}\n` +
        `Canais gerenciados: <b>${managed.length}</b>`
      );
      break;
    }

    case "/apis": {
      const { data: providers } = await supabase
        .from("scraping_providers")
        .select("*")
        .order("priority", { ascending: true });
      
      if (!providers?.length) {
        await sendMessage(chatId, "Nenhum provedor cadastrado.");
        return;
      }

      let msg = "<b>Provedores de Raspagem:</b>\n\n";
      providers.forEach((p, i) => {
        const statusIcon = p.health_status === "healthy" ? "ON" : p.health_status === "degraded" ? "WARN" : p.health_status === "down" ? "OFF" : "?";
        const rate = p.success_count + p.fail_count > 0 
          ? ((p.success_count / (p.success_count + p.fail_count)) * 100).toFixed(0) 
          : "N/A";
        msg += `${i + 1}. [${statusIcon}] <b>${p.name}</b> [P${p.priority}]\n`;
        msg += `   ${p.base_url}\n`;
        msg += `   OK: ${p.success_count} | FAIL: ${p.fail_count} | Taxa: ${rate}%\n`;
        msg += `   ${p.active ? "Ativo" : "Inativo"}\n\n`;
      });

      const buttons = providers.map(p => ([
        { text: `${p.active ? "Desativar" : "Ativar"} ${p.name}`, callback_data: `toggle_provider_${p.id}` }
      ]));
      buttons.push([{ text: "Resetar contadores", callback_data: "reset_provider_stats" }]);

      await sendMessage(chatId, msg, { inline_keyboard: buttons });
      break;
    }

    case "/addapi": {
      if (!args) {
        await sendMessage(chatId,
          "<b>Formato:</b>\n" +
          "<code>/addapi Nome|https://url.com|/embed/movie/{tmdb_id}|/embed/tv/{tmdb_id}/{season}/{episode}</code>"
        );
        return;
      }
      const parts = args.split("|").map(p => p.trim());
      if (parts.length < 2) {
        await sendMessage(chatId, "Formato invalido. Use: Nome|URL base");
        return;
      }

      const [name, baseUrl, movieTemplate, tvTemplate] = parts;
      
      const { data: maxP } = await supabase
        .from("scraping_providers")
        .select("priority")
        .order("priority", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const newPriority = (maxP?.priority || 0) + 1;

      await supabase.from("scraping_providers").insert({
        name,
        base_url: baseUrl,
        movie_url_template: movieTemplate || "/embed/movie/{tmdb_id}",
        tv_url_template: tvTemplate || "/embed/tv/{tmdb_id}/{season}/{episode}",
        priority: newPriority,
        active: true,
        health_status: "unknown",
      });

      await sendMessage(chatId,
        `<b>Provedor "${name}" adicionado!</b>\n\n` +
        `${baseUrl}\nPrioridade: ${newPriority}\n\nUse /apis para ver todos.`
      );
      break;
    }

    // ==========================================
    // CHANNEL MANAGEMENT COMMANDS
    // ==========================================

    case "/enviar": {
      if (!args) {
        // Enter send mode — next message will be forwarded to channel
        const session: UserSession = { step: "awaiting_channel_msg", data: {}, lastMsgIds: [] };
        await setSession(chatId, session);
        await clearAndSend(chatId, session, 
          "<b>Enviar mensagem ao canal principal</b>\n\n" +
          "Digite a mensagem que deseja enviar ao canal.\n" +
          "Suporta HTML.\n\n" +
          "Use /cancelar para cancelar."
        );
        await setSession(chatId, session);
        return;
      }
      // Direct send with args
      const config = await getChannelConfig();
      const target = config?.channel_id || config?.channel_username;
      if (!target) {
        await sendMessage(chatId, "Canal principal nao configurado.");
        return;
      }
      await sendMessage(target, args);
      await sendMessage(chatId, "Mensagem enviada ao canal!");
      break;
    }

    case "/canais": {
      const managed = await getManagedChannels();
      if (managed.length === 0) {
        await sendMessage(chatId, 
          "<b>Canais Gerenciados</b>\n\nNenhum canal adicionado.\nUse /addcanal @username para adicionar."
        );
        return;
      }
      
      let msg = "<b>Canais Gerenciados:</b>\n\n";
      const buttons: any[][] = [];
      managed.forEach((ch, i) => {
        msg += `${i + 1}. <b>${ch.title}</b>\n`;
        msg += `   ${ch.username ? "@" + ch.username : ch.id}\n`;
        msg += `   Tipo: ${ch.type} | Membros: ${ch.member_count || "?"}\n\n`;
        buttons.push([
          { text: `Enviar msg: ${ch.title}`, callback_data: `msg_channel_${ch.id}` },
          { text: `Remover`, callback_data: `rm_channel_${ch.id}` },
        ]);
      });
      
      await sendMessage(chatId, msg, { inline_keyboard: buttons });
      break;
    }

    case "/addcanal": {
      if (!args) {
        await sendMessage(chatId, 
          "<b>Adicionar Canal</b>\n\n" +
          "Envie o @ do canal ou link:\n" +
          "<code>/addcanal @nome_do_canal</code>\n" +
          "<code>/addcanal https://t.me/nome_do_canal</code>\n\n" +
          "O bot precisa ser admin do canal para enviar mensagens."
        );
        return;
      }

      let channelRef = args.trim();
      // Extract username from t.me link
      const tmeMatch = channelRef.match(/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)/);
      if (tmeMatch) channelRef = "@" + tmeMatch[1];
      if (!channelRef.startsWith("@") && !channelRef.startsWith("-")) {
        channelRef = "@" + channelRef;
      }

      const chatInfo = await getChat(channelRef);
      if (!chatInfo) {
        await sendMessage(chatId, 
          `Nao foi possivel acessar <b>${channelRef}</b>.\n\n` +
          "Verifique se:\n" +
          "- O canal/grupo e publico\n" +
          "- O bot e admin do canal\n" +
          "- O username esta correto"
        );
        return;
      }

      const memberCount = await getChatMemberCount(chatInfo.id);
      
      const channelData = {
        id: chatInfo.id,
        title: chatInfo.title || channelRef,
        username: chatInfo.username || null,
        type: chatInfo.type,
        member_count: memberCount,
        added_at: new Date().toISOString(),
      };

      const managed = await getManagedChannels();
      const exists = managed.find((c: any) => c.id === chatInfo.id);
      if (!exists) {
        managed.push(channelData);
        await saveManagedChannels(managed);
      }

      await sendMessage(chatId,
        `<b>Canal adicionado!</b>\n\n` +
        `<b>${chatInfo.title}</b>\n` +
        `Tipo: ${chatInfo.type}\n` +
        `Username: ${chatInfo.username ? "@" + chatInfo.username : "Privado"}\n` +
        `Membros: ${memberCount}\n` +
        `ID: <code>${chatInfo.id}</code>\n\n` +
        `Use /msgcanal ${chatInfo.id} para enviar mensagens.`,
        {
          inline_keyboard: [
            [{ text: "Enviar mensagem de teste", callback_data: `test_channel_${chatInfo.id}` }],
          ]
        }
      );
      break;
    }

    case "/infocanal": {
      if (!args) {
        await sendMessage(chatId, "Use: <code>/infocanal @username</code>");
        return;
      }

      let channelRef = args.trim();
      const tmeMatch = channelRef.match(/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)/);
      if (tmeMatch) channelRef = "@" + tmeMatch[1];
      if (!channelRef.startsWith("@") && !channelRef.startsWith("-")) {
        channelRef = "@" + channelRef;
      }

      const chatInfo = await getChat(channelRef);
      if (!chatInfo) {
        await sendMessage(chatId, `Nao consegui acessar <b>${channelRef}</b>. Verifique se o canal e publico.`);
        return;
      }

      const memberCount = await getChatMemberCount(chatInfo.id);

      await sendMessage(chatId,
        `<b>Info do Canal</b>\n\n` +
        `<b>${chatInfo.title}</b>\n` +
        `Tipo: ${chatInfo.type}\n` +
        `Username: ${chatInfo.username ? "@" + chatInfo.username : "N/A"}\n` +
        `Membros: ${memberCount}\n` +
        `ID: <code>${chatInfo.id}</code>\n` +
        (chatInfo.description ? `\nDescricao: ${chatInfo.description.substring(0, 200)}` : ""),
        {
          inline_keyboard: [
            [{ text: "Adicionar aos gerenciados", callback_data: `add_ch_${chatInfo.id}_${chatInfo.username || ""}` }],
          ]
        }
      );
      break;
    }

    case "/msgcanal": {
      if (!args) {
        // Show list of managed channels to choose
        const managed = await getManagedChannels();
        if (managed.length === 0) {
          await sendMessage(chatId, "Nenhum canal gerenciado. Use /addcanal primeiro.");
          return;
        }
        const buttons = managed.map((ch: any) => ([
          { text: ch.title, callback_data: `msg_channel_${ch.id}` }
        ]));
        await sendMessage(chatId, "<b>Selecione o canal:</b>", { inline_keyboard: buttons });
        return;
      }
      
      // Parse: /msgcanal <id> <message>
      const spaceIdx = args.indexOf(" ");
      if (spaceIdx === -1) {
        // Only channel ID, enter session
        const session: UserSession = { step: "awaiting_managed_msg", data: { target_channel: args.trim() }, lastMsgIds: [] };
        await setSession(chatId, session);
        await clearAndSend(chatId, session,
          `<b>Enviar mensagem ao canal</b>\n\nDigite a mensagem (suporta HTML).\nUse /cancelar para cancelar.`
        );
        await setSession(chatId, session);
        return;
      }
      
      const targetCh = args.substring(0, spaceIdx).trim();
      const msgText = args.substring(spaceIdx + 1).trim();
      
      try {
        await sendMessage(targetCh, msgText);
        await sendMessage(chatId, "Mensagem enviada!");
      } catch (err) {
        await sendMessage(chatId, `Erro ao enviar: ${err}`);
      }
      break;
    }

    case "/buscar": {
      const query = args || "filmes series";
      // Use Telegram's username resolution to check known public channels
      const knownChannels = [
        "@filmesetc", "@filmeshd_br", "@seriesehd", "@filmesgratis",
        "@canalfilmes", "@filmesseries", "@saborfilmes", "@filmeseseries",
        "@filmeshdgratis", "@seriesfilmes", "@filmesnovos", "@lancamentosfilmes",
        "@cinebrasil", "@filmeseseriesbr", "@telecinefilmes", "@filmesdeserie",
        "@seriesbrasileiras", "@animesbrasil", "@animesgratis", "@doramas_br",
      ];

      await sendMessage(chatId, `<b>Buscando canais publicos...</b>\nVerificando ${knownChannels.length} canais conhecidos...`);

      const found: any[] = [];
      for (const username of knownChannels) {
        try {
          const info = await getChat(username);
          if (info) {
            const count = await getChatMemberCount(info.id);
            found.push({
              id: info.id,
              title: info.title,
              username: info.username,
              type: info.type,
              member_count: count,
              description: info.description?.substring(0, 100) || "",
            });
          }
        } catch {}
        // Small delay to avoid rate limit
        await new Promise(r => setTimeout(r, 200));
      }

      if (found.length === 0) {
        await sendMessage(chatId, "Nenhum canal encontrado ativo no momento.");
        return;
      }

      // Sort by member count
      found.sort((a, b) => b.member_count - a.member_count);

      let msg = `<b>Canais Publicos Encontrados (${found.length}):</b>\n\n`;
      const buttons: any[][] = [];
      
      found.forEach((ch, i) => {
        msg += `${i + 1}. <b>${ch.title}</b>\n`;
        msg += `   @${ch.username} | ${ch.member_count} membros\n`;
        if (ch.description) msg += `   ${ch.description}\n`;
        msg += "\n";
        
        if (i < 10) { // Limit buttons to first 10
          buttons.push([
            { text: `Info: ${ch.title}`, callback_data: `info_ch_${ch.username}` },
            { text: `Adicionar`, callback_data: `add_ch_${ch.id}_${ch.username}` },
          ]);
        }
      });

      await sendMessage(chatId, msg, buttons.length > 0 ? { inline_keyboard: buttons } : undefined);
      break;
    }

    case "/raspar": {
      const sessionId = `scrape_${Date.now()}`;
      
      await supabase.from("site_settings").upsert(
        { key: `scrape_session_${sessionId}`, value: { cancelled: false, started: new Date().toISOString() } as any },
        { onConflict: "key" }
      );
      
      await supabase.from("site_settings").upsert(
        { key: "active_scrape_session", value: { session_id: sessionId } as any },
        { onConflict: "key" }
      );

      const [{ count: total }, { count: cached }] = await Promise.all([
        supabase.from("content").select("id", { count: "exact", head: true }),
        supabase.from("video_cache").select("id", { count: "exact", head: true }).gt("expires_at", new Date().toISOString()),
      ]);
      
      const missing = (total || 0) - (cached || 0);

      await sendMessage(chatId,
        `<b>Iniciando raspagem!</b>\n\n` +
        `Catalogo: ${total}\nCacheados: ${cached}\nFaltando: ${missing}\n\n` +
        `Use /raspar_parar para cancelar.`
      );

      fetch(`${SUPABASE_URL}/functions/v1/smart-scraper`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ chat_id: chatId, session_id: sessionId }),
      }).catch(() => {});

      break;
    }

    case "/raspar_parar": {
      const { data: activeSession } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "active_scrape_session")
        .maybeSingle();
      
      if (activeSession?.value) {
        const sessionId = (activeSession.value as any).session_id;
        await supabase.from("site_settings").upsert(
          { key: `scrape_session_${sessionId}`, value: { cancelled: true } as any },
          { onConflict: "key" }
        );
        await sendMessage(chatId, "<b>Sinal de parada enviado.</b>");
      } else {
        await sendMessage(chatId, "Nenhuma raspagem ativa.");
      }
      break;
    }

    default: {
      // Check if user is in a session (awaiting input)
      const session = await getSession(chatId);
      if (session) {
        await handleSessionInput(chatId, userId, text, session);
        return;
      }
      await sendMessage(chatId, "Comando nao reconhecido. Use /start para ver os comandos.");
    }
  }
}

// Handle session-based inputs (multi-step flows)
async function handleSessionInput(chatId: number, userId: number, text: string, session: UserSession) {
  switch (session.step) {
    case "awaiting_channel_msg": {
      const config = await getChannelConfig();
      const target = config?.channel_id || config?.channel_username;
      if (!target) {
        await sendMessage(chatId, "Canal principal nao configurado.");
        await setSession(chatId, null);
        return;
      }
      await sendMessage(target, text);
      await clearAndSend(chatId, session, "Mensagem enviada ao canal!");
      await setSession(chatId, null);
      break;
    }
    case "awaiting_managed_msg": {
      const targetChannel = session.data.target_channel;
      try {
        await sendMessage(targetChannel, text);
        await clearAndSend(chatId, session, "Mensagem enviada!");
      } catch (err) {
        await clearAndSend(chatId, session, `Erro ao enviar: ${err}`);
      }
      await setSession(chatId, null);
      break;
    }
    default:
      await setSession(chatId, null);
  }
}

async function handleCallback(chatId: number, userId: number, callbackData: string, callbackQueryId: string) {
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });

  // --- Provider management callbacks ---
  if (callbackData.startsWith("toggle_provider_")) {
    const providerId = callbackData.replace("toggle_provider_", "");
    const { data: prov } = await supabase
      .from("scraping_providers")
      .select("active, name")
      .eq("id", providerId)
      .maybeSingle();
    
    if (prov) {
      await supabase.from("scraping_providers")
        .update({ active: !prov.active })
        .eq("id", providerId);
      await sendMessage(chatId, `<b>${prov.name}</b> ${prov.active ? "desativado" : "ativado"}!`);
    }
  }

  if (callbackData === "reset_provider_stats") {
    await supabase.from("scraping_providers")
      .update({ success_count: 0, fail_count: 0, health_status: "unknown" })
      .neq("id", "00000000-0000-0000-0000-000000000000");
    await sendMessage(chatId, "Contadores resetados!");
  }

  // --- Channel management callbacks ---
  if (callbackData.startsWith("msg_channel_")) {
    const targetId = callbackData.replace("msg_channel_", "");
    const session: UserSession = { step: "awaiting_managed_msg", data: { target_channel: targetId }, lastMsgIds: [] };
    await setSession(chatId, session);
    await clearAndSend(chatId, session,
      `<b>Enviar mensagem ao canal</b>\n\nDigite a mensagem (suporta HTML).\nUse /cancelar para cancelar.`
    );
    await setSession(chatId, session);
  }

  if (callbackData.startsWith("rm_channel_")) {
    const removeId = callbackData.replace("rm_channel_", "");
    const managed = await getManagedChannels();
    const updated = managed.filter((c: any) => String(c.id) !== removeId);
    await saveManagedChannels(updated);
    await sendMessage(chatId, "Canal removido da lista.");
  }

  if (callbackData.startsWith("test_channel_")) {
    const testId = callbackData.replace("test_channel_", "");
    try {
      await sendMessage(testId, "<b>Mensagem de teste da LyneFlix Bot</b>\n\nSe voce esta vendo esta mensagem, o bot esta funcionando corretamente neste canal.");
      await sendMessage(chatId, "Mensagem de teste enviada!");
    } catch (err) {
      await sendMessage(chatId, `Erro ao enviar teste: ${err}`);
    }
  }

  if (callbackData.startsWith("add_ch_")) {
    const parts = callbackData.replace("add_ch_", "").split("_");
    const chId = parts[0];
    const chUsername = parts.slice(1).join("_");
    
    const chatInfo = await getChat(chUsername ? "@" + chUsername : chId);
    if (chatInfo) {
      const memberCount = await getChatMemberCount(chatInfo.id);
      const channelData = {
        id: chatInfo.id,
        title: chatInfo.title || chUsername || chId,
        username: chatInfo.username || null,
        type: chatInfo.type,
        member_count: memberCount,
        added_at: new Date().toISOString(),
      };
      const managed = await getManagedChannels();
      if (!managed.find((c: any) => c.id === chatInfo.id)) {
        managed.push(channelData);
        await saveManagedChannels(managed);
      }
      await sendMessage(chatId, `<b>${chatInfo.title}</b> adicionado aos canais gerenciados!`);
    } else {
      await sendMessage(chatId, "Nao foi possivel acessar o canal.");
    }
  }

  if (callbackData.startsWith("info_ch_")) {
    const username = callbackData.replace("info_ch_", "");
    const chatInfo = await getChat("@" + username);
    if (chatInfo) {
      const memberCount = await getChatMemberCount(chatInfo.id);
      await sendMessage(chatId,
        `<b>${chatInfo.title}</b>\n\n` +
        `Username: @${chatInfo.username}\n` +
        `Tipo: ${chatInfo.type}\n` +
        `Membros: ${memberCount}\n` +
        `ID: <code>${chatInfo.id}</code>\n` +
        (chatInfo.description ? `\n${chatInfo.description.substring(0, 300)}` : ""),
        {
          inline_keyboard: [
            [{ text: "Adicionar aos gerenciados", callback_data: `add_ch_${chatInfo.id}_${chatInfo.username}` }],
          ]
        }
      );
    }
  }
}

// ==========================================
// MAIN HTTP HANDLER
// ==========================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // --- GET requests (setup, API actions) ---
  if (req.method === "GET") {
    if (url.searchParams.get("setup") === "true") {
      const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-bot`;
      const res = await fetch(`${TELEGRAM_API}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message", "callback_query", "chat_member", "my_chat_member"] }),
      });
      const data = await res.json();
      return new Response(JSON.stringify({ webhook: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // API actions from admin panel (GET)
    if (action) {
      return await handleApiAction(action, {});
    }

    return new Response(JSON.stringify({ status: "ok", bot: "LyneFlix Bot" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- POST requests ---
  try {
    const bodyText = await req.text();
    let body: any;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // API actions from admin panel (POST)
    if (action) {
      return await handleApiAction(action, body);
    }

    // --- Telegram webhook update ---
    const update = body;
    const message = update.message || update.edited_message;
    const callback = update.callback_query;
    const chatMember = update.chat_member;

    // Handle new chat members (welcome message)
    if (chatMember) {
      const newStatus = chatMember.new_chat_member?.status;
      const oldStatus = chatMember.old_chat_member?.status;
      const chat = chatMember.chat;
      const user = chatMember.new_chat_member?.user;

      // User joined channel/group
      if (user && (newStatus === "member" || newStatus === "administrator") && (oldStatus === "left" || oldStatus === "kicked" || !oldStatus)) {
        const memberName = user.first_name || user.username || "Novo membro";
        await sendWelcomeMessage(chat.id, memberName, user.id);
      }
      return new Response("ok", { headers: corsHeaders });
    }

    // Handle new_chat_members in messages (groups)
    if (message?.new_chat_members) {
      for (const member of message.new_chat_members) {
        if (!member.is_bot) {
          const memberName = member.first_name || member.username || "Novo membro";
          await sendWelcomeMessage(message.chat.id, memberName, member.id);
        }
      }
      return new Response("ok", { headers: corsHeaders });
    }

    let chatId: number;
    let userId: number;

    if (callback) {
      chatId = callback.message.chat.id;
      userId = callback.from.id;
    } else if (message) {
      chatId = message.chat.id;
      userId = message.from.id;
    } else {
      return new Response("ok", { headers: corsHeaders });
    }

    // Only check authorization for private chats (bot commands)
    if (message?.chat?.type === "private" || callback?.message?.chat?.type === "private") {
      const authorized = await isAuthorized(userId);
      if (!authorized) {
        await sendMessage(chatId, "🚫 <b>Acesso negado.</b>\n\nVocê não está autorizado a usar este bot.");
        return new Response("ok", { headers: corsHeaders });
      }
    }

    if (callback) {
      await handleCallback(chatId, userId, callback.data, callback.id);
    } else if (message) {
      if (message.text?.startsWith("/")) {
        await handleCommand(chatId, userId, message.text);
      } else if (message.text && message.chat?.type === "private") {
        // Check for active session (non-command text input)
        const session = await getSession(chatId);
        if (session) {
          await handleSessionInput(chatId, userId, message.text, session);
        }
      }
    }

    return new Response("ok", { headers: corsHeaders });
  } catch (err) {
    console.error("Bot error:", err);
    return new Response("ok", { headers: corsHeaders });
  }
});
