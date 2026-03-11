import { useState } from "react";
import { Copy, Check, Code2, Zap, Shield, Globe, Tv, MonitorPlay, Play } from "lucide-react";

const BASE_DOMAIN = "https://lyneflix.online";

const LynePlayPage = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const CopyBtn = ({ text, id }: { text: string; id: string }) => (
    <button
      onClick={() => copy(text, id)}
      className="absolute top-3 right-3 p-2 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all"
    >
      {copiedId === id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-lg shadow-red-900/30">
              <Play className="w-5 h-5 text-white fill-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">LynePlay</h1>
              <p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">Player as a Service</p>
            </div>
          </div>
          <a href="/" className="text-xs text-white/30 hover:text-white/60 transition-colors">← Voltar para Lyneflix</a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative py-20 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-red-900/5 via-transparent to-transparent" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-red-600/3 rounded-full blur-[120px]" />
        <div className="max-w-4xl mx-auto relative text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-white/50 mb-8">
            <Zap className="w-3 h-3 text-red-500" />
            Engine HLS adaptativa · Start &lt;2s · ABR inteligente
          </div>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight mb-6">
            Integre o player mais rápido<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-700">do Brasil</span> no seu site
          </h2>
          <p className="text-lg text-white/40 max-w-2xl mx-auto leading-relaxed mb-10">
            Uma linha de código. Player adaptativo com buffer dinâmico, auto-recovery e qualidade cinematográfica.
          </p>

          {/* Features pills */}
          <div className="flex flex-wrap justify-center gap-3 mb-16">
            {[
              { icon: Zap, label: "Start <2s" },
              { icon: MonitorPlay, label: "HLS + MP4" },
              { icon: Shield, label: "Auto-recovery" },
              { icon: Globe, label: "ABR Smart" },
              { icon: Tv, label: "Embed fácil" },
              { icon: Code2, label: "API REST" },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06]">
                <f.icon className="w-3.5 h-3.5 text-red-500/70" />
                <span className="text-xs text-white/50">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Player */}
      <section className="px-6 pb-20">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-2xl overflow-hidden border border-white/[0.06] bg-black shadow-2xl shadow-black/50">
            <iframe
              src="/embed?tmdb=157336&type=movie&title=Interstellar"
              className="w-full aspect-video"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          </div>
          <p className="text-[11px] text-white/20 mt-3 text-center">Player LynePlay em ação — engine com 7 otimizações de velocidade.</p>
        </div>
      </section>

      {/* API Documentation */}
      <section className="px-6 pb-20">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-8 sm:p-10">
            <div className="flex items-center gap-3 mb-10">
              <Code2 className="w-6 h-6 text-yellow-500" />
              <h3 className="text-2xl font-bold">Documentação da API</h3>
            </div>

            {/* Embed sections */}
            <div className="grid md:grid-cols-2 gap-8 mb-12">
              {/* Movies */}
              <div>
                <h4 className="text-base font-bold mb-2">Embed de Filmes</h4>
                <p className="text-sm text-white/40 mb-4">Use o ID do TMDB para incorporar filmes.</p>
                <div className="relative rounded-xl bg-[#0d1117] border border-white/[0.08] p-4 overflow-x-auto">
                  <CopyBtn text={`<iframe src="${BASE_DOMAIN}/embed/movie/ID_TMDB" width="100%" height="100%" frameborder="0" allowfullscreen></iframe>`} id="movie-embed" />
                  <pre className="text-[13px] text-yellow-400/90 font-mono whitespace-pre-wrap leading-relaxed pr-10">
{`<iframe src="${BASE_DOMAIN}/embed/movie/ID_TMDB" width="100%" height="100%"
  frameborder="0" allowfullscreen></iframe>`}
                  </pre>
                </div>
                <p className="text-xs text-white/30 mt-2">
                  Exemplo: <a href="/embed?tmdb=550&type=movie&title=Fight%20Club" className="text-red-400 hover:text-red-300 transition-colors">/embed/movie/550</a>
                </p>
              </div>

              {/* Series */}
              <div>
                <h4 className="text-base font-bold mb-2">Embed de Séries</h4>
                <p className="text-sm text-white/40 mb-4">Requer ID do TMDB, Temporada e Episódio.</p>
                <div className="relative rounded-xl bg-[#0d1117] border border-white/[0.08] p-4 overflow-x-auto">
                  <CopyBtn text={`<iframe src="${BASE_DOMAIN}/embed/tv/ID_TMDB/S/E" width="100%" height="100%" frameborder="0" allowfullscreen></iframe>`} id="series-embed" />
                  <pre className="text-[13px] text-yellow-400/90 font-mono whitespace-pre-wrap leading-relaxed pr-10">
{`<iframe src="${BASE_DOMAIN}/embed/tv/ID_TMDB/S/E" width="100%" height="100%"
  frameborder="0" allowfullscreen></iframe>`}
                  </pre>
                </div>
                <p className="text-xs text-white/30 mt-2">
                  Exemplo: <a href="/embed?tmdb=1399&type=tv&title=Game%20of%20Thrones&s=1&e=1" className="text-red-400 hover:text-red-300 transition-colors">/embed/tv/1399/1/1</a>
                </p>
              </div>
            </div>

            {/* API JSON */}
            <div className="mb-12">
              <h4 className="text-base font-bold mb-2">API JSON (Feed)</h4>
              <p className="text-sm text-white/40 mb-4">Obtenha a lista de conteúdos ou detalhes específicos.</p>
              <div className="relative rounded-xl bg-[#0d1117] border border-white/[0.08] p-4 overflow-x-auto">
                <CopyBtn text={`POST ${BASE_DOMAIN}/embed/api\n\n{ "tmdb_id": ID_TMDB, "content_type": "movie" | "tv", "season": S, "episode": E }`} id="api-json" />
                <pre className="text-[13px] text-green-400/90 font-mono whitespace-pre leading-relaxed">
{`POST ${BASE_DOMAIN}/embed/api

Body: { "tmdb_id": ID_TMDB, "content_type": "movie" | "tv", "season": S, "episode": E }
Response: { "url": "https://...", "type": "m3u8" | "mp4", "provider": "lyneplay" }`}
                </pre>
              </div>
            </div>

            {/* Embed URL Params */}
            <div className="mb-12">
              <h4 className="text-base font-bold mb-2">Parâmetros da Embed URL</h4>
              <p className="text-sm text-white/40 mb-4">Todos os parâmetros aceitos pelo player embed.</p>
              <div className="relative rounded-xl bg-[#0d1117] border border-white/[0.08] p-4 overflow-x-auto mb-4">
                <pre className="text-[13px] text-blue-400/90 font-mono whitespace-pre leading-relaxed">
{`GET ${BASE_DOMAIN}/embed?tmdb={id}&type={movie|tv}&title={title}&s={season}&e={episode}`}
                </pre>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left py-3 pr-6 text-white/40 font-medium text-xs uppercase tracking-wider">Parâmetro</th>
                      <th className="text-left py-3 pr-6 text-white/40 font-medium text-xs uppercase tracking-wider">Tipo</th>
                      <th className="text-left py-3 pr-6 text-white/40 font-medium text-xs uppercase tracking-wider">Obrigatório</th>
                      <th className="text-left py-3 text-white/40 font-medium text-xs uppercase tracking-wider">Descrição</th>
                    </tr>
                  </thead>
                  <tbody className="text-white/60">
                    {[
                      ["tmdb", "number", "✅", "ID do TMDB do conteúdo"],
                      ["type", "string", "✅", '"movie" ou "tv"'],
                      ["title", "string", "❌", "Título exibido no player"],
                      ["s", "number", "❌*", "Temporada (obrigatório para type=tv)"],
                      ["e", "number", "❌*", "Episódio (obrigatório para type=tv)"],
                    ].map(([param, type, req, desc], i) => (
                      <tr key={i} className="border-b border-white/[0.04]">
                        <td className="py-3 pr-6 font-mono text-xs text-red-400">{param}</td>
                        <td className="py-3 pr-6 text-xs">{type}</td>
                        <td className="py-3 pr-6 text-xs">{req}</td>
                        <td className="py-3 text-xs">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Listas de IDs */}
            <div>
              <h4 className="text-base font-bold mb-2">Exemplo de Integração Rápida</h4>
              <p className="text-sm text-white/40 mb-4">Copie e cole no seu site para começar.</p>
              <div className="relative rounded-xl bg-[#0d1117] border border-white/[0.08] p-4 overflow-x-auto">
                <CopyBtn text={`<div style="position:relative;padding-top:56.25%;max-width:1280px;margin:0 auto;">
  <iframe src="${BASE_DOMAIN}/embed?tmdb=550&type=movie&title=Fight%20Club"
    style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;border-radius:12px;"
    allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media">
  </iframe>
</div>`} id="quick-start" />
                <pre className="text-[13px] text-green-400/90 font-mono whitespace-pre leading-relaxed pr-10">
{`<div style="position:relative;padding-top:56.25%;max-width:1280px;margin:0 auto;">
  <iframe src="${BASE_DOMAIN}/embed?tmdb=550&type=movie&title=Fight%20Club"
    style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;border-radius:12px;"
    allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media">
  </iframe>
</div>`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] py-8 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center">
              <Play className="w-3 h-3 text-white fill-white" />
            </div>
            <span className="text-xs text-white/20">LynePlay © {new Date().getFullYear()}</span>
          </div>
          <span className="text-[10px] text-white/15">Powered by Lyneflix Engine</span>
        </div>
      </footer>
    </div>
  );
};

export default LynePlayPage;
