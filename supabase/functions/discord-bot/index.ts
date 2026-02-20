import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DISCORD_API = "https://discord.com/api/v10";

// --- Daily template messages ---
const DAILY_TEMPLATES = [
  "🎬 **Sabia que na LyneFlix você encontra filmes e séries GRÁTIS, sem anúncios chatos?** Acesse agora e confira!",
  "🍿 **Você sabia que na LyneFlix tem lançamentos de 2026 antes de todo mundo?** Corre pra conferir!",
  "📺 **Toguro ia falar: 'Se tu não tá assistindo na LyneFlix, tu tá perdendo tempo, saboor!'** 😂🔥",
  "🔥 **Na LyneFlix você assiste em qualidade HD sem pagar nada.** Sério, é de graça mesmo!",
  "💡 **Você sabia que na LyneFlix tem doramas, animes e séries coreanas?** Catálogo completo pra você!",
  "🚀 **Saboor! Na LyneFlix tem Watch Together — assista com seus amigos em tempo real!** Cria uma sala agora!",
  "🎭 **Toguro aprovaria: LyneFlix tem tudo que você precisa, sem frescura, sem enrolação.** Só conteúdo brabo! 💪",
  "⭐ **Você sabia que pode criar sua lista personalizada na LyneFlix?** Salva tudo que quer assistir!",
  "🎬 **Na LyneFlix tem mais de mil títulos esperando por você.** Filmes, séries, doramas... É só escolher!",
  "😎 **Saboor mano, a LyneFlix é tipo Netflix só que de graça.** Não me pergunte como, só aproveita! 🔥",
];

// --- Utility ---
function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function verifyDiscordSignature(req: Request, body: string): Promise<boolean> {
  const PUBLIC_KEY = Deno.env.get("DISCORD_PUBLIC_KEY");
  if (!PUBLIC_KEY) return false;
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  if (!signature || !timestamp) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hexToUint8Array(PUBLIC_KEY), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, hexToUint8Array(signature), new TextEncoder().encode(timestamp + body));
  } catch { return false; }
}

function getSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function discordApi(path: string, method = "GET", body?: unknown) {
  const TOKEN = Deno.env.get("DISCORD_BOT_TOKEN")!;
  const opts: RequestInit = { method, headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${DISCORD_API}${path}`, opts);
  if (!res.ok) { const text = await res.text(); throw new Error(`Discord API ${res.status}: ${text}`); }
  return res.json();
}

async function logEvent(event: string, details?: string, extra?: Record<string, string>) {
  const sb = getSupabase();
  await sb.from("discord_bot_logs").insert({ event, details, guild_id: extra?.guild_id, channel_id: extra?.channel_id, user_tag: extra?.user_tag });
}

// --- Slash commands ---
async function registerCommands(applicationId: string) {
  const commands = [
    { name: "lyne", description: "Buscar filme ou série no catálogo LyneFlix", options: [{ name: "titulo", description: "Nome do filme ou série", type: 3, required: true }] },
    { name: "lancamentos", description: "Ver os últimos lançamentos do catálogo" },
    { name: "stats", description: "Estatísticas do catálogo LyneFlix" },
  ];
  await discordApi(`/applications/${applicationId}/commands`, "PUT", commands);
  return commands.length;
}

// --- /lyne ---
async function handleLyneCommand(query: string, siteUrl: string) {
  const sb = getSupabase();
  const { data: results } = await sb.from("content")
    .select("tmdb_id, title, content_type, poster_path, vote_average, release_date, overview")
    .or(`title.ilike.%${query}%,original_title.ilike.%${query}%`)
    .eq("status", "published").limit(5);

  if (!results?.length) {
    return { type: 4, data: { embeds: [{ title: "🔍 Nenhum resultado", description: `Não encontrei **"${query}"** no catálogo.\n\nTente buscar com outro nome ou peça para adicionarmos!`, color: 0xFF4444 }] } };
  }

  const embeds = results.map((item) => {
    const type = item.content_type === "movie" ? "filme" : "serie";
    const url = `${siteUrl}/${type}/${item.tmdb_id}`;
    const year = item.release_date ? ` (${item.release_date.substring(0, 4)})` : "";
    const rating = item.vote_average ? ` ⭐ ${Number(item.vote_average).toFixed(1)}` : "";
    return {
      title: `${item.content_type === "movie" ? "🎬" : "📺"} ${item.title}${year}`,
      description: (item.overview || "Sem sinopse.").substring(0, 200) + (item.overview && item.overview.length > 200 ? "..." : ""),
      url, color: 0x8B5CF6,
      thumbnail: item.poster_path ? { url: `https://image.tmdb.org/t/p/w200${item.poster_path}` } : undefined,
      fields: [{ name: "Nota", value: rating || "N/A", inline: true }, { name: "Tipo", value: item.content_type === "movie" ? "Filme" : "Série", inline: true }],
      footer: { text: "LyneFlix • Clique no título para assistir" },
    };
  });

  return { type: 4, data: { content: `🎯 Encontrei **${results.length}** resultado(s) para **"${query}"**:`, embeds } };
}

// --- /lancamentos ---
async function handleLancamentos(siteUrl: string) {
  const sb = getSupabase();
  const { data: items } = await sb.from("content")
    .select("tmdb_id, title, content_type, poster_path, release_date")
    .eq("status", "published").order("created_at", { ascending: false }).limit(10);

  if (!items?.length) return { type: 4, data: { content: "Nenhum lançamento recente encontrado." } };

  const list = items.map((item, i) => {
    const type = item.content_type === "movie" ? "filme" : "serie";
    const emoji = item.content_type === "movie" ? "🎬" : "📺";
    const url = `${siteUrl}/${type}/${item.tmdb_id}`;
    const year = item.release_date ? ` (${item.release_date.substring(0, 4)})` : "";
    return `${i + 1}. ${emoji} [${item.title}${year}](${url})`;
  }).join("\n");

  return { type: 4, data: { embeds: [{ title: "🆕 Últimos Lançamentos", description: list, color: 0x8B5CF6, footer: { text: `LyneFlix • ${siteUrl}` } }] } };
}

// --- /stats ---
async function handleStats() {
  const sb = getSupabase();
  const [movies, series, cache] = await Promise.all([
    sb.from("content").select("*", { count: "exact", head: true }).eq("content_type", "movie"),
    sb.from("content").select("*", { count: "exact", head: true }).in("content_type", ["tv", "series", "dorama", "anime"]),
    sb.from("video_cache").select("*", { count: "exact", head: true }),
  ]);
  return { type: 4, data: { embeds: [{ title: "📊 Estatísticas LyneFlix", color: 0x8B5CF6, fields: [
    { name: "🎬 Filmes", value: String(movies.count || 0), inline: true },
    { name: "📺 Séries", value: String(series.count || 0), inline: true },
    { name: "🔗 Links Ativos", value: String(cache.count || 0), inline: true },
  ], footer: { text: "LyneFlix Bot" } }] } };
}

// --- Fetch TMDB details for rich notifications ---
const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI3MmJhMDM0NWIxMzMyMmMxYjkzYmIwMTE1MjVjNjMwYSIsIm5iZiI6MTczOTgyMDk4NC41MjgsInN1YiI6IjY3YjQ0NTU4OWMyNGM4MzFjMTg3OGM5ZiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.SMM78Mku6GRGlMxPgkKjMiEm22-ikomPfKEhETAeJpc";

async function fetchTMDBDetails(tmdbId: number, type: string): Promise<any> {
  const mediaType = type === "movie" ? "movie" : "tv";
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?language=pt-BR&append_to_response=credits`,
      { headers: { Authorization: `Bearer ${TMDB_TOKEN}` } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// --- Send a release notification with rich formatting ---
async function sendReleaseNotification() {
  const sb = getSupabase();
  const { data: config } = await sb.from("discord_config").select("*").limit(1).single();
  if (!config?.notification_channel_id) throw new Error("Canal de notificação não configurado");

  const siteUrl = config.site_url || "https://cinefloww.lovable.app";

  // Get latest 2026 content (movies/series only, no anime/dorama)
  const { data: items } = await sb.from("content")
    .select("tmdb_id, title, content_type, poster_path, backdrop_path, overview, release_date, vote_average, runtime")
    .eq("status", "published")
    .not("overview", "is", null)
    .in("content_type", ["movie", "tv", "series"])
    .gte("release_date", "2026-01-01")
    .lte("release_date", "2026-12-31")
    .order("created_at", { ascending: false })
    .limit(10);

  // Filter items that actually have synopsis
  const validItems = (items || []).filter(i => i.overview && i.overview.trim().length > 10);
  if (!validItems.length) throw new Error("Nenhum conteúdo de 2026 com sinopse encontrado para notificar");

  const item = validItems[0];
  const type = item.content_type === "movie" ? "filme" : "serie";
  const url = `${siteUrl}/${type}/${item.tmdb_id}`;
  const emoji = item.content_type === "movie" ? "🎬" : "📺";
  const year = item.release_date ? item.release_date.substring(0, 4) : "N/A";
  const rating = item.vote_average ? `⭐ ${Number(item.vote_average).toFixed(1)}` : "";

  // Fetch rich TMDB details (genres, cast, director, runtime)
  const tmdb = await fetchTMDBDetails(item.tmdb_id, item.content_type);

  const genres = tmdb?.genres?.map((g: any) => g.name).join(", ") || "N/A";
  const runtime = tmdb?.runtime || tmdb?.episode_run_time?.[0] || item.runtime || null;
  const runtimeStr = runtime ? `${runtime}min` : "";
  const director = tmdb?.credits?.crew?.find((c: any) => c.job === "Director")?.name || 
                    tmdb?.created_by?.[0]?.name || "";
  const cast = tmdb?.credits?.cast?.slice(0, 3).map((c: any) => c.name).join(", ") || "";
  const synopsis = (item.overview || "").substring(0, 400);

  // Build rich formatted message like the reference screenshot
  const titleLine = `➤ **Título:** ${item.title} » ${year}${runtimeStr ? ` » ${runtimeStr}` : ""}`;
  const directorLine = director ? `\n**Diretor:** ${director}` : "";
  const castLine = cast ? `\n**Elenco:** ${cast}` : "";
  const genresLine = `\n**Gêneros:** ${genres}`;
  const synopsisLine = `\n**Sinopse:** *${synopsis}*`;
  const linkLine = `\n\n🔴 **LINK PARA ASSISTIR:** ${url}`;
  const footerLine = `\n\n➡ Acesse **LyneFlix** — Filmes e séries GRÁTIS, sem anúncios!\n➡ @here`;

  const content = `${titleLine}${directorLine}${castLine}${genresLine}${synopsisLine}${linkLine}${footerLine}`;

  // Use backdrop for wide image, fallback to poster
  const imageUrl = item.backdrop_path 
    ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` 
    : item.poster_path 
      ? `https://image.tmdb.org/t/p/w500${item.poster_path}` 
      : undefined;

  const embed = {
    color: 0x8B5CF6,
    image: imageUrl ? { url: imageUrl } : undefined,
    thumbnail: item.poster_path ? { url: `https://image.tmdb.org/t/p/w200${item.poster_path}` } : undefined,
  };

  await discordApi(`/channels/${config.notification_channel_id}/messages`, "POST", { content, embeds: [embed] });
  await logEvent("release_notified", item.title, { channel_id: config.notification_channel_id });
  return item.title;
}

// --- Send daily template message ---
async function sendDailyTemplate() {
  const sb = getSupabase();
  const { data: config } = await sb.from("discord_config").select("*").limit(1).single();
  if (!config?.notification_channel_id) throw new Error("Canal de notificação não configurado");

  const siteUrl = config.site_url || "https://cinefloww.lovable.app";
  const template = DAILY_TEMPLATES[Math.floor(Math.random() * DAILY_TEMPLATES.length)];
  const content = `${template}\n\n🔗 **Acesse agora:** ${siteUrl}`;

  await discordApi(`/channels/${config.notification_channel_id}/messages`, "POST", { content });
  await logEvent("daily_template_sent", template.substring(0, 80), { channel_id: config.notification_channel_id });
  return template;
}

// --- Notify new content (with rich formatting) ---
async function notifyNewContent(content: { title: string; tmdb_id: number; content_type: string; poster_path?: string; overview?: string; release_date?: string }) {
  const sb = getSupabase();
  const { data: config } = await sb.from("discord_config").select("*").limit(1).single();
  if (!config?.notification_channel_id || !config.auto_notify_new_content) return;

  // Skip content without synopsis
  if (!content.overview || content.overview.trim().length < 10) return;

  const type = content.content_type === "movie" ? "filme" : "serie";
  const siteUrl = config.site_url || "https://cinefloww.lovable.app";
  const url = `${siteUrl}/${type}/${content.tmdb_id}`;
  const year = content.release_date ? content.release_date.substring(0, 4) : "";

  // Fetch rich TMDB details
  const tmdb = await fetchTMDBDetails(content.tmdb_id, content.content_type);
  const genres = tmdb?.genres?.map((g: any) => g.name).join(", ") || "";
  const runtime = tmdb?.runtime || tmdb?.episode_run_time?.[0] || null;
  const director = tmdb?.credits?.crew?.find((c: any) => c.job === "Director")?.name || 
                    tmdb?.created_by?.[0]?.name || "";
  const cast = tmdb?.credits?.cast?.slice(0, 3).map((c: any) => c.name).join(", ") || "";

  const titleLine = `➤ **Título:** ${content.title}${year ? ` » ${year}` : ""}${runtime ? ` » ${runtime}min` : ""}`;
  const details = [
    director ? `**Diretor:** ${director}` : "",
    cast ? `**Elenco:** ${cast}` : "",
    genres ? `**Gêneros:** ${genres}` : "",
    `**Sinopse:** *${(content.overview || "").substring(0, 400)}*`,
  ].filter(Boolean).join("\n");

  const msg = `${titleLine}\n\n${details}\n\n🔴 **LINK PARA ASSISTIR:** ${url}\n\n➡ Acesse **LyneFlix** — Filmes e séries GRÁTIS!\n➡ @here`;

  const embed = {
    color: 0x10B981,
    image: content.poster_path ? { url: `https://image.tmdb.org/t/p/w500${content.poster_path}` } : undefined,
  };

  await discordApi(`/channels/${config.notification_channel_id}/messages`, "POST", { content: msg, embeds: [embed] });
  await logEvent("new_content_notified", content.title, { channel_id: config.notification_channel_id });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);

  // Admin API endpoints
  if (url.searchParams.has("action")) {
    const action = url.searchParams.get("action");
    try {
      if (action === "register_commands") {
        const appId = Deno.env.get("DISCORD_APPLICATION_ID")!;
        const count = await registerCommands(appId);
        await logEvent("commands_registered", `${count} comandos registrados`);
        return new Response(JSON.stringify({ success: true, count }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "send_message") {
        const { channel_id, content, embed } = await req.json();
        const body: Record<string, unknown> = { content };
        if (embed) body.embeds = [embed];
        await discordApi(`/channels/${channel_id}/messages`, "POST", body);
        await logEvent("message_sent", content, { channel_id });
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "get_guilds") {
        const guilds = await discordApi("/users/@me/guilds");
        return new Response(JSON.stringify({ success: true, guilds }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "get_channels") {
        const guildId = url.searchParams.get("guild_id");
        if (!guildId) throw new Error("guild_id required");
        const channels = await discordApi(`/guilds/${guildId}/channels`);
        const textChannels = channels.filter((c: any) => c.type === 0);
        return new Response(JSON.stringify({ success: true, channels: textChannels }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "create_channel") {
        const { guild_id, name, topic } = await req.json();
        const channel = await discordApi(`/guilds/${guild_id}/channels`, "POST", { name, topic, type: 0 });
        await logEvent("channel_created", name, { guild_id, channel_id: channel.id });
        return new Response(JSON.stringify({ success: true, channel }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "bot_info") {
        const bot = await discordApi("/users/@me");
        return new Response(JSON.stringify({ success: true, bot }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "notify_content") {
        const content = await req.json();
        await notifyNewContent(content);
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // NEW: Send a release notification now
      if (action === "send_release") {
        const title = await sendReleaseNotification();
        return new Response(JSON.stringify({ success: true, title }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // NEW: Send a daily template message
      if (action === "send_daily_template") {
        const template = await sendDailyTemplate();
        return new Response(JSON.stringify({ success: true, template }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  // Discord Interaction Webhook
  try {
    const body = await req.text();
    const isValid = await verifyDiscordSignature(req, body);
    if (!isValid) return new Response("Invalid signature", { status: 401 });

    const interaction = JSON.parse(body);
    if (interaction.type === 1) return new Response(JSON.stringify({ type: 1 }), { headers: { "Content-Type": "application/json" } });

    if (interaction.type === 2) {
      const commandName = interaction.data.name;
      const userTag = interaction.member?.user?.username || interaction.user?.username || "unknown";
      const sb = getSupabase();
      const { data: config } = await sb.from("discord_config").select("site_url").limit(1).single();
      const siteUrl = config?.site_url || "https://cinefloww.lovable.app";

      let response;
      if (commandName === "lyne") {
        const query = interaction.data.options?.[0]?.value || "";
        response = await handleLyneCommand(query, siteUrl);
        await logEvent("command_lyne", query, { user_tag: userTag, guild_id: interaction.guild_id });
      } else if (commandName === "lancamentos") {
        response = await handleLancamentos(siteUrl);
        await logEvent("command_lancamentos", null, { user_tag: userTag, guild_id: interaction.guild_id });
      } else if (commandName === "stats") {
        response = await handleStats();
        await logEvent("command_stats", null, { user_tag: userTag, guild_id: interaction.guild_id });
      } else {
        response = { type: 4, data: { content: "Comando não reconhecido." } };
      }
      return new Response(JSON.stringify(response), { headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ type: 1 }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Discord bot error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
