import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI1MDFiOWNkYjllNDQ0NjkxMDJiODk5YjQ0YjU2MWQ5ZCIsIm5iZiI6MTc3MTIzMDg1My43NjYsInN1YiI6IjY5OTJkNjg1NzZjODAxNTdmMjFhZjMxMSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.c47JvphccOz_oyaUuQWCHQ1mXAsSH01OB14vKE2uenw";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";

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
async function sendMessage(chatId: number, text: string, replyMarkup?: any): Promise<number | null> {
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

async function sendPhoto(chatId: number, photoUrl: string, caption: string, replyMarkup?: any): Promise<number | null> {
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

// --- AI-powered name extraction from caption/text ---
function extractNameFromText(text: string): { name: string; synopsis: string } {
  // Split by double newlines or first line vs rest
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  
  if (lines.length === 0) return { name: "", synopsis: "" };
  
  // First meaningful line is usually the title
  let name = lines[0];
  // Remove common prefixes like emoji, "Nome:", "Título:" etc
  name = name.replace(/^(🎬|📺|🎥|📽|nome:|título:|title:|film:|movie:|serie:|series:)\s*/i, "").trim();
  // Remove year in parentheses from name to keep it clean for TMDB search
  name = name.replace(/\s*\(\d{4}\)\s*$/, "").trim();
  
  // Rest is synopsis
  const synopsis = lines.slice(1).join("\n").trim();
  
  return { name, synopsis };
}

// --- Main handlers ---
async function handleCommand(chatId: number, userId: number, text: string) {
  const cmd = text.split(" ")[0].toLowerCase();
  const args = text.substring(cmd.length).trim();

  switch (cmd) {
    case "/start":
      await sendMessage(chatId,
        "🎬 <b>Bot de Ingestão LyneFlix</b>\n\n" +
        "Encaminhe um vídeo de outro chat para começar o cadastro.\n" +
        "Envie junto nome e sinopse na legenda!\n\n" +
        "📌 <b>Comandos:</b>\n" +
        "/pendentes — Lista conteúdos pendentes\n" +
        "/buscar [nome] — Busca por nome\n" +
        "/status — Resumo do sistema\n" +
        "/apis — Status dos provedores\n" +
        "/addapi [nome] [url] — Adicionar provedor\n" +
        "/raspar — Iniciar raspagem em lote\n" +
        "/raspar_parar — Parar raspagem\n" +
        "/cancelar — Cancela operação atual"
      );
      break;

    case "/cancelar": {
      const session = await getSession(chatId);
      if (session) {
        await deleteMessages(chatId, session.lastMsgIds);
        await setSession(chatId, null);
      }
      await sendMessage(chatId, "❌ Operação cancelada.");
      break;
    }

    case "/pendentes": {
      const { data, count } = await supabase
        .from("telegram_ingestions")
        .select("id, title, content_type, status, created_at", { count: "exact" })
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10);
      if (!data?.length) {
        await sendMessage(chatId, "✅ Nenhum conteúdo pendente.");
        return;
      }
      let msg = `📋 <b>Pendentes (${count}):</b>\n\n`;
      data.forEach((d, i) => {
        const icon = d.content_type === "movie" ? "🎬" : "📺";
        msg += `${i + 1}. ${icon} <b>${d.title}</b>\n   ID: <code>${d.id.slice(0, 8)}</code>\n\n`;
      });
      await sendMessage(chatId, msg);
      break;
    }

    case "/buscar": {
      if (!args) { await sendMessage(chatId, "Use: /buscar [nome]"); return; }
      const { data } = await supabase
        .from("telegram_ingestions")
        .select("id, title, content_type, status")
        .ilike("title", `%${args}%`)
        .limit(10);
      if (!data?.length) {
        await sendMessage(chatId, `🔍 Nenhum resultado para "${args}".`);
        return;
      }
      let msg = `🔍 <b>Resultados para "${args}":</b>\n\n`;
      data.forEach((d, i) => {
        const icon = d.content_type === "movie" ? "🎬" : "📺";
        const statusIcon = d.status === "pending" ? "⏳" : d.status === "confirmed" ? "✅" : "📦";
        msg += `${i + 1}. ${icon} ${statusIcon} <b>${d.title}</b>\n   ID: <code>${d.id.slice(0, 8)}</code> | ${d.status}\n\n`;
      });
      await sendMessage(chatId, msg);
      break;
    }

    case "/status": {
      const [{ count: pending }, { count: confirmed }, { count: processed }] = await Promise.all([
        supabase.from("telegram_ingestions").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("telegram_ingestions").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
        supabase.from("telegram_ingestions").select("id", { count: "exact", head: true }).eq("status", "processed"),
      ]);
      
      // Also show catalog stats
      const [{ count: totalContent }, { count: cachedVideos }] = await Promise.all([
        supabase.from("content").select("id", { count: "exact", head: true }),
        supabase.from("video_cache").select("id", { count: "exact", head: true }).gt("expires_at", new Date().toISOString()),
      ]);
      
      await sendMessage(chatId,
        "📊 <b>Status do Sistema:</b>\n\n" +
        `<b>Ingestão:</b>\n` +
        `⏳ Pendentes: <b>${pending || 0}</b>\n` +
        `✅ Confirmados: <b>${confirmed || 0}</b>\n` +
        `📦 Processados: <b>${processed || 0}</b>\n\n` +
        `<b>Catálogo:</b>\n` +
        `📚 Total conteúdo: <b>${totalContent || 0}</b>\n` +
        `🔗 Links cacheados: <b>${cachedVideos || 0}</b>\n` +
        `📈 Cobertura: <b>${totalContent ? ((cachedVideos || 0) / (totalContent as number) * 100).toFixed(1) : 0}%</b>`
      );
      break;
    }

    case "/excluir": {
      if (!args) { await sendMessage(chatId, "Use: /excluir [ID]"); return; }
      const { data } = await supabase
        .from("telegram_ingestions")
        .select("id, title")
        .ilike("id", `${args}%`)
        .limit(1)
        .maybeSingle();
      if (!data) { await sendMessage(chatId, "❌ ID não encontrado."); return; }
      await supabase.from("telegram_ingestions").delete().eq("id", data.id);
      await sendMessage(chatId, `🗑 <b>${data.title}</b> removido.`);
      break;
    }

    // --- SCRAPING COMMANDS ---
    case "/apis": {
      const { data: providers } = await supabase
        .from("scraping_providers")
        .select("*")
        .order("priority", { ascending: true });
      
      if (!providers?.length) {
        await sendMessage(chatId, "❌ Nenhum provedor cadastrado.");
        return;
      }

      let msg = "🌐 <b>Provedores de Raspagem:</b>\n\n";
      providers.forEach((p, i) => {
        const statusIcon = p.health_status === "healthy" ? "🟢" : p.health_status === "degraded" ? "🟡" : p.health_status === "down" ? "🔴" : "⚪";
        const rate = p.success_count + p.fail_count > 0 
          ? ((p.success_count / (p.success_count + p.fail_count)) * 100).toFixed(0) 
          : "N/A";
        msg += `${i + 1}. ${statusIcon} <b>${p.name}</b> [P${p.priority}]\n`;
        msg += `   ${p.base_url}\n`;
        msg += `   ✅ ${p.success_count} | ❌ ${p.fail_count} | Taxa: ${rate}%\n`;
        msg += `   ${p.active ? "🟢 Ativo" : "🔴 Inativo"}\n\n`;
      });

      const buttons = providers.map(p => ([
        { text: `${p.active ? "⏸" : "▶️"} ${p.name}`, callback_data: `toggle_provider_${p.id}` }
      ]));
      buttons.push([{ text: "🔄 Resetar contadores", callback_data: "reset_provider_stats" }]);

      await sendMessage(chatId, msg, { inline_keyboard: buttons });
      break;
    }

    case "/addapi": {
      // Format: /addapi Nome|url_base|movie_template|tv_template
      if (!args) {
        await sendMessage(chatId,
          "📝 <b>Formato:</b>\n" +
          "<code>/addapi Nome|https://url.com|/embed/movie/{tmdb_id}|/embed/tv/{tmdb_id}/{season}/{episode}</code>\n\n" +
          "Templates disponíveis:\n" +
          "<code>{tmdb_id}</code> — ID do TMDB\n" +
          "<code>{imdb_id}</code> — ID do IMDb\n" +
          "<code>{season}</code> — Temporada\n" +
          "<code>{episode}</code> — Episódio\n" +
          "<code>{slug}</code> — Slug do título"
        );
        return;
      }
      const parts = args.split("|").map(p => p.trim());
      if (parts.length < 2) {
        await sendMessage(chatId, "❌ Formato inválido. Use: Nome|URL base");
        return;
      }

      const [name, baseUrl, movieTemplate, tvTemplate] = parts;
      
      // Get max priority
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
        `✅ <b>Provedor "${name}" adicionado!</b>\n\n` +
        `🔗 ${baseUrl}\n` +
        `📊 Prioridade: ${newPriority}\n\n` +
        `Use /apis para ver todos.`
      );
      break;
    }

    case "/raspar": {
      // Check if already running
      const sessionId = `scrape_${Date.now()}`;
      
      // Save session marker
      await supabase.from("site_settings").upsert(
        { key: `scrape_session_${sessionId}`, value: { cancelled: false, started: new Date().toISOString() } as any },
        { onConflict: "key" }
      );
      
      // Store active session for /raspar_parar
      await supabase.from("site_settings").upsert(
        { key: "active_scrape_session", value: { session_id: sessionId } as any },
        { onConflict: "key" }
      );

      // Get stats
      const [{ count: total }, { count: cached }] = await Promise.all([
        supabase.from("content").select("id", { count: "exact", head: true }),
        supabase.from("video_cache").select("id", { count: "exact", head: true }).gt("expires_at", new Date().toISOString()),
      ]);
      
      const missing = (total || 0) - (cached || 0);

      await sendMessage(chatId,
        `🚀 <b>Iniciando raspagem!</b>\n\n` +
        `📚 Catálogo: ${total}\n` +
        `🔗 Cacheados: ${cached}\n` +
        `❓ Faltando: ${missing}\n\n` +
        `Enviando logs em tempo real...\nUse /raspar_parar para cancelar.`
      );

      // Trigger smart-scraper
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
        await sendMessage(chatId, "⏹ <b>Sinal de parada enviado.</b>\nA raspagem será interrompida no próximo lote.");
      } else {
        await sendMessage(chatId, "❌ Nenhuma raspagem ativa.");
      }
      break;
    }

    default:
      await sendMessage(chatId, "❓ Comando não reconhecido. Use /start para ver os comandos.");
  }
}

async function handleMessage(chatId: number, userId: number, message: any) {
  const video = message.video || message.document;
  const isForwarded = message.forward_date || message.forward_from || message.forward_from_chat;

  // Handle forwarded video (with or without caption containing name/synopsis)
  if (video) {
    const uniqueId = video.file_unique_id;
    const { data: existing } = await supabase
      .from("telegram_ingestions")
      .select("id, title")
      .eq("telegram_unique_id", uniqueId)
      .maybeSingle();

    if (existing) {
      await sendMessage(chatId, `⚠️ Este arquivo já foi cadastrado como "<b>${existing.title}</b>".`);
      return;
    }

    const fileData = {
      telegram_file_id: video.file_id,
      telegram_unique_id: uniqueId,
      file_size: video.file_size || 0,
      duration: video.duration || 0,
      resolution: video.width ? `${video.width}x${video.height}` : null,
      file_name: video.file_name || null,
      mime_type: video.mime_type || null,
    };

    const caption = message.caption || "";
    const fileName = video.file_name || "";
    const cleanName = fileName.replace(/\.\w{2,4}$/, "").replace(/[._]/g, " ").trim();

    const session: UserSession = { step: "confirm_name", data: fileData, lastMsgIds: [] };

    // If user sent caption with text, extract name + synopsis from it
    if (caption) {
      const extracted = extractNameFromText(caption);
      session.data.extracted_name = extracted.name;
      session.data.extracted_synopsis = extracted.synopsis;
      
      const msg = `📥 <b>Vídeo recebido!</b>\n\n` +
        `📁 ${fileName || "Sem nome"} | 💾 ${formatSize(video.file_size)} | ⏱ ${formatDuration(video.duration)}\n\n` +
        `🔍 Nome detectado: <b>${extracted.name}</b>\n\n` +
        `✅ Confirma esse nome?`;

      const msgId = await sendMessage(chatId, msg, {
        inline_keyboard: [
          [{ text: "✅ Confirmar", callback_data: "name_confirm" }],
          [{ text: "❌ Não, quero digitar", callback_data: "name_reject" }],
        ],
      });
      if (msgId) session.lastMsgIds.push(msgId);
    } else if (cleanName) {
      // No caption but has file name
      session.data.extracted_name = cleanName;
      const msg = `📥 <b>Vídeo recebido!</b>\n\n` +
        `📁 ${fileName} | 💾 ${formatSize(video.file_size)} | ⏱ ${formatDuration(video.duration)}\n\n` +
        `🔍 Nome detectado: <b>${cleanName}</b>\n\n` +
        `✅ Confirma esse nome?`;

      const msgId = await sendMessage(chatId, msg, {
        inline_keyboard: [
          [{ text: "✅ Confirmar", callback_data: "name_confirm" }],
          [{ text: "❌ Não, quero digitar", callback_data: "name_reject" }],
        ],
      });
      if (msgId) session.lastMsgIds.push(msgId);
    } else {
      // No info at all
      session.step = "ask_title";
      const msgId = await sendMessage(chatId,
        `📥 <b>Vídeo recebido!</b>\n\n` +
        `📁 Sem nome | 💾 ${formatSize(video.file_size)} | ⏱ ${formatDuration(video.duration)}\n\n` +
        `📝 <b>Informe o nome do conteúdo:</b>`
      );
      if (msgId) session.lastMsgIds.push(msgId);
    }

    // Track user's message for cleanup
    if (message.message_id) session.lastMsgIds.push(message.message_id);
    await setSession(chatId, session);
    return;
  }

  // Handle session flow
  const session = await getSession(chatId);
  if (!session) {
    if (message.text?.startsWith("/")) {
      await handleCommand(chatId, userId, message.text);
    } else {
      await sendMessage(chatId, "Encaminhe um vídeo para começar ou use /start.");
    }
    return;
  }

  // Track user message for deletion
  if (message.message_id) session.lastMsgIds.push(message.message_id);

  const text = message.text?.trim() || "";

  switch (session.step) {
    case "ask_title":
      session.data.extracted_name = text;
      // Go straight to TMDB search
      await searchAndShowTMDB(chatId, session, text);
      break;

    case "ask_synopsis":
      session.data.synopsis = text;
      session.step = "ask_type";
      await clearAndSend(chatId, session, "🎭 <b>É um filme ou série?</b>", {
        inline_keyboard: [
          [
            { text: "🎬 Filme", callback_data: "type_movie" },
            { text: "📺 Série", callback_data: "type_series" },
          ],
        ],
      });
      await setSession(chatId, session);
      break;

    case "ask_season":
      session.data.season = parseInt(text) || 1;
      session.step = "ask_episode";
      await clearAndSend(chatId, session, "📝 <b>Episódio:</b>");
      await setSession(chatId, session);
      break;

    case "ask_episode":
      session.data.episode = parseInt(text) || 1;
      session.step = "ask_ep_title";
      await clearAndSend(chatId, session, "📝 <b>Título do episódio (opcional — envie . para pular):</b>");
      await setSession(chatId, session);
      break;

    case "ask_ep_title":
      session.data.episode_title = text === "." ? null : text;
      await showConfirmation(chatId, session);
      break;

    case "manual_search":
      await searchAndShowTMDB(chatId, session, text);
      break;

    default:
      await clearAndSend(chatId, session, "❓ Algo deu errado. Use /cancelar e tente novamente.");
      await setSession(chatId, session);
  }
}

// --- Shared TMDB search + display ---
async function searchAndShowTMDB(chatId: number, session: UserSession, query: string) {
  await clearAndSend(chatId, session, `🔍 Buscando "<b>${query}</b>" no TMDB...`);

  const results = await searchTMDB(query);
  if (results.length > 0) {
    const top = results.slice(0, 3);
    session.data.tmdb_results = top;
    session.step = "pick_tmdb";

    let msg = "🎬 <b>Resultados TMDB:</b>\n\n";
    const buttons: any[][] = [];
    top.forEach((r: any, i: number) => {
      const title = r.title || r.name || "?";
      const year = (r.release_date || r.first_air_date || "").substring(0, 4);
      const type = r.media_type === "tv" || r.name ? "📺" : "🎬";
      const rating = r.vote_average ? `⭐ ${r.vote_average.toFixed(1)}` : "";
      msg += `${i + 1}. ${type} <b>${title}</b> (${year}) ${rating}\n`;
      if (r.overview) msg += `   ${r.overview.substring(0, 80)}...\n`;
      msg += "\n";
      buttons.push([{ text: `${i + 1}. ${title} (${year})`, callback_data: `tmdb_pick_${i}` }]);
    });
    buttons.push([{ text: "✏️ Buscar manualmente", callback_data: "tmdb_manual" }]);
    buttons.push([{ text: "❌ Cancelar", callback_data: "confirm_cancel" }]);

    const posterPath = top[0].poster_path;
    if (posterPath) {
      await clearAndSendPhoto(chatId, session, `${TMDB_IMG}/w300${posterPath}`, msg, { inline_keyboard: buttons });
    } else {
      await clearAndSend(chatId, session, msg, { inline_keyboard: buttons });
    }
  } else {
    session.step = "manual_search";
    await clearAndSend(chatId, session, "❌ Nenhum resultado no TMDB.\n\n📝 <b>Tente outro nome:</b>");
  }
  await setSession(chatId, session);
}

async function showConfirmation(chatId: number, session: UserSession) {
  const d = session.data;
  const typeIcon = d.content_type === "movie" ? "🎬 Filme" : "📺 Série";
  const year = d.tmdb_year || "";

  let msg = `⚠️ <b>CONFIRMAR CADASTRO</b>\n\n` +
    `📌 Nome: <b>${d.title}</b>${year ? ` (${year})` : ""}\n` +
    `🎭 Tipo: ${typeIcon}\n`;

  if (d.content_type === "series") {
    msg += `📺 T${d.season || "?"}E${d.episode || "?"}\n`;
    if (d.episode_title) msg += `📝 Título ep.: ${d.episode_title}\n`;
  }

  if (d.tmdb_runtime) msg += `⏱ Duração TMDB: ${formatDuration(d.tmdb_runtime * 60)}\n`;
  if (d.tmdb_rating) msg += `⭐ Nota: ${d.tmdb_rating}\n`;

  msg += `\n📝 Sinopse: ${(d.synopsis || "").substring(0, 150)}${(d.synopsis || "").length > 150 ? "..." : ""}\n\n` +
    `📁 Arquivo: ${formatSize(d.file_size)} | ⏱ ${formatDuration(d.duration)}\n`;
  
  if (d.tmdb_id) msg += `🔗 TMDB ID: <code>${d.tmdb_id}</code>\n`;

  msg += `\n<b>Deseja enviar para processamento?</b>`;

  session.step = "confirm";

  const posterPath = d.tmdb_poster;
  if (posterPath) {
    await clearAndSendPhoto(chatId, session, `${TMDB_IMG}/w300${posterPath}`, msg, {
      inline_keyboard: [
        [{ text: "✅ Confirmar envio", callback_data: "confirm_yes" }],
        [{ text: "✏️ Editar informações", callback_data: "confirm_edit" }],
        [{ text: "❌ Cancelar", callback_data: "confirm_cancel" }],
      ],
    });
  } else {
    await clearAndSend(chatId, session, msg, {
      inline_keyboard: [
        [{ text: "✅ Confirmar envio", callback_data: "confirm_yes" }],
        [{ text: "✏️ Editar informações", callback_data: "confirm_edit" }],
        [{ text: "❌ Cancelar", callback_data: "confirm_cancel" }],
      ],
    });
  }
  await setSession(chatId, session);
}

async function handleCallback(chatId: number, userId: number, callbackData: string, callbackQueryId: string) {
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });

  const session = await getSession(chatId);
  if (!session) {
    await sendMessage(chatId, "Sessão expirada. Encaminhe o vídeo novamente.");
    return;
  }

  // --- Name confirmation flow ---
  if (callbackData === "name_confirm") {
    const name = session.data.extracted_name;
    if (session.data.extracted_synopsis) {
      session.data.synopsis = session.data.extracted_synopsis;
    }
    // Search TMDB with confirmed name
    await searchAndShowTMDB(chatId, session, name);
    return;
  }

  if (callbackData === "name_reject") {
    session.step = "ask_title";
    await clearAndSend(chatId, session, "📝 <b>Informe o nome correto:</b>");
    await setSession(chatId, session);
    return;
  }

  // --- TMDB pick ---
  if (callbackData.startsWith("tmdb_pick_")) {
    const idx = parseInt(callbackData.replace("tmdb_pick_", ""));
    const results = session.data.tmdb_results || [];
    const picked = results[idx];
    if (!picked) {
      await clearAndSend(chatId, session, "❌ Opção inválida.");
      await setSession(chatId, session);
      return;
    }

    const mediaType = picked.media_type === "tv" || picked.name ? "tv" : "movie";
    const details = await getTMDBDetails(picked.id, mediaType);

    session.data.title = details?.title || details?.name || picked.title || picked.name;
    session.data.synopsis = session.data.extracted_synopsis || details?.overview || picked.overview || "";
    session.data.content_type = mediaType === "tv" ? "series" : "movie";
    session.data.tmdb_id = picked.id;
    session.data.tmdb_poster = details?.poster_path || picked.poster_path;
    session.data.tmdb_backdrop = details?.backdrop_path || picked.backdrop_path;
    session.data.tmdb_year = (details?.release_date || details?.first_air_date || "").substring(0, 4);
    session.data.tmdb_runtime = details?.runtime || null;
    session.data.tmdb_rating = details?.vote_average ? details.vote_average.toFixed(1) : null;
    session.data.tmdb_seasons = details?.number_of_seasons || null;

    if (mediaType === "tv") {
      session.step = "ask_season";
      await clearAndSend(chatId, session,
        `✅ <b>${session.data.title}</b> (${session.data.tmdb_year}) selecionado!\n\n📝 <b>Temporada:</b>`
      );
      await setSession(chatId, session);
    } else {
      await showConfirmation(chatId, session);
    }
    return;
  }

  if (callbackData === "tmdb_manual") {
    session.step = "manual_search";
    await clearAndSend(chatId, session, "🔍 <b>Digite o nome para buscar no TMDB:</b>");
    await setSession(chatId, session);
    return;
  }

  if (callbackData === "type_movie") {
    session.data.content_type = "movie";
    await showConfirmation(chatId, session);
  } else if (callbackData === "type_series") {
    session.data.content_type = "series";
    session.step = "ask_season";
    await clearAndSend(chatId, session, "📝 <b>Temporada:</b>");
    await setSession(chatId, session);
  } else if (callbackData === "confirm_yes") {
    const d = session.data;
    const { error } = await supabase.from("telegram_ingestions").insert({
      title: d.title,
      synopsis: d.synopsis,
      content_type: d.content_type,
      season: d.season || null,
      episode: d.episode || null,
      episode_title: d.episode_title || null,
      telegram_file_id: d.telegram_file_id,
      telegram_unique_id: d.telegram_unique_id,
      file_size: d.file_size,
      duration: d.duration,
      resolution: d.resolution,
      file_name: d.file_name,
      mime_type: d.mime_type,
      status: "pending",
      telegram_user_id: userId,
      tmdb_id: d.tmdb_id || null,
      tmdb_poster: d.tmdb_poster || null,
      tmdb_backdrop: d.tmdb_backdrop || null,
      tmdb_year: d.tmdb_year || null,
      tmdb_rating: d.tmdb_rating ? parseFloat(d.tmdb_rating) : null,
    });

    await deleteMessages(chatId, session.lastMsgIds);
    await setSession(chatId, null);

    if (error) {
      await sendMessage(chatId, `❌ Erro ao salvar: ${error.message}`);
    } else {
      const poster = d.tmdb_poster ? `${TMDB_IMG}/w200${d.tmdb_poster}` : null;
      const msg = `✅ <b>${d.title}</b>${d.tmdb_year ? ` (${d.tmdb_year})` : ""} cadastrado!\n\nStatus: ⏳ Pendente\nEncaminhe outro vídeo para continuar.`;
      if (poster) {
        await sendPhoto(chatId, poster, msg);
      } else {
        await sendMessage(chatId, msg);
      }
    }
  } else if (callbackData === "confirm_edit") {
    session.step = "ask_title";
    await clearAndSend(chatId, session, "📝 <b>Informe o nome do conteúdo:</b>");
    await setSession(chatId, session);
  } else if (callbackData === "confirm_cancel") {
    await deleteMessages(chatId, session.lastMsgIds);
    await setSession(chatId, null);
    await sendMessage(chatId, "❌ Cadastro cancelado.");
  }

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
      await sendMessage(chatId, `${prov.active ? "⏸" : "▶️"} <b>${prov.name}</b> ${prov.active ? "desativado" : "ativado"}!`);
    }
  }

  if (callbackData === "reset_provider_stats") {
    await supabase.from("scraping_providers")
      .update({ success_count: 0, fail_count: 0, health_status: "unknown" })
      .neq("id", "00000000-0000-0000-0000-000000000000"); // update all
    await sendMessage(chatId, "🔄 Contadores resetados!");
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("setup") === "true") {
      const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-bot`;
      const res = await fetch(`${TELEGRAM_API}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl }),
      });
      const data = await res.json();
      return new Response(JSON.stringify({ webhook: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const update = await req.json();
    const message = update.message || update.edited_message;
    const callback = update.callback_query;

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

    const authorized = await isAuthorized(userId);
    if (!authorized) {
      await sendMessage(chatId, "🚫 <b>Acesso negado.</b>\n\nVocê não está autorizado a usar este bot.");
      return new Response("ok", { headers: corsHeaders });
    }

    if (callback) {
      await handleCallback(chatId, userId, callback.data, callback.id);
    } else if (message) {
      if (message.text?.startsWith("/")) {
        await handleCommand(chatId, userId, message.text);
      } else {
        await handleMessage(chatId, userId, message);
      }
    }

    return new Response("ok", { headers: corsHeaders });
  } catch (err) {
    console.error("Bot error:", err);
    return new Response("ok", { headers: corsHeaders });
  }
});
