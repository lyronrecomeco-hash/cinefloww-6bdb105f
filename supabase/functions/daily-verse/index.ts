import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VERSES = [
  { verse: "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna.", ref: "João 3:16" },
  { verse: "O Senhor é o meu pastor; nada me faltará.", ref: "Salmos 23:1" },
  { verse: "Tudo posso naquele que me fortalece.", ref: "Filipenses 4:13" },
  { verse: "Confia no Senhor de todo o teu coração e não te estribes no teu próprio entendimento.", ref: "Provérbios 3:5" },
  { verse: "Porque eu bem sei os pensamentos que penso de vós, diz o Senhor; pensamentos de paz e não de mal.", ref: "Jeremias 29:11" },
  { verse: "Não temas, porque eu sou contigo; não te assombres, porque eu sou o teu Deus.", ref: "Isaías 41:10" },
  { verse: "Entrega o teu caminho ao Senhor; confia nele, e ele tudo fará.", ref: "Salmos 37:5" },
  { verse: "E conhecereis a verdade, e a verdade vos libertará.", ref: "João 8:32" },
  { verse: "Mas os que esperam no Senhor renovarão as suas forças; subirão com asas como águias.", ref: "Isaías 40:31" },
  { verse: "Lançando sobre ele toda a vossa ansiedade, porque ele tem cuidado de vós.", ref: "1 Pedro 5:7" },
  { verse: "O Senhor é a minha luz e a minha salvação; a quem temerei?", ref: "Salmos 27:1" },
  { verse: "Eu sou o caminho, a verdade e a vida.", ref: "João 14:6" },
  { verse: "Sede fortes e corajosos. Não temais, porque o Senhor, vosso Deus, é convosco.", ref: "Josué 1:9" },
  { verse: "Alegrai-vos sempre no Senhor; outra vez digo: alegrai-vos!", ref: "Filipenses 4:4" },
  { verse: "O amor é paciente, o amor é bondoso.", ref: "1 Coríntios 13:4" },
  { verse: "Pois onde estiver o vosso tesouro, aí estará também o vosso coração.", ref: "Mateus 6:21" },
  { verse: "Bem-aventurados os pacificadores, porque eles serão chamados filhos de Deus.", ref: "Mateus 5:9" },
  { verse: "Deem graças ao Senhor porque ele é bom; o seu amor dura para sempre.", ref: "Salmos 136:1" },
  { verse: "Vinde a mim, todos os que estais cansados e oprimidos, e eu vos aliviarei.", ref: "Mateus 11:28" },
  { verse: "Busquem o Reino de Deus em primeiro lugar, e todas essas coisas vos serão acrescentadas.", ref: "Mateus 6:33" },
  { verse: "Ainda que eu ande pelo vale da sombra da morte, não temerei mal algum, porque tu estás comigo.", ref: "Salmos 23:4" },
  { verse: "Deus é o nosso refúgio e fortaleza, socorro bem presente na angústia.", ref: "Salmos 46:1" },
  { verse: "Porque pela graça sois salvos, por meio da fé; e isto não vem de vós; é dom de Deus.", ref: "Efésios 2:8" },
  { verse: "Se Deus é por nós, quem será contra nós?", ref: "Romanos 8:31" },
  { verse: "Tenham bom ânimo! Eu venci o mundo.", ref: "João 16:33" },
  { verse: "O fruto do Espírito é: amor, alegria, paz, paciência, amabilidade, bondade, fidelidade.", ref: "Gálatas 5:22" },
  { verse: "Instruirei e te ensinarei o caminho que deves seguir.", ref: "Salmos 32:8" },
  { verse: "Não se turbe o vosso coração; credes em Deus, crede também em mim.", ref: "João 14:1" },
  { verse: "Grandes coisas fez o Senhor por nós, e por isso estamos alegres.", ref: "Salmos 126:3" },
  { verse: "A palavra de Deus é viva, e eficaz, e mais penetrante do que qualquer espada de dois gumes.", ref: "Hebreus 4:12" },
  { verse: "De sorte que as coisas que se veem são temporais, e as que não se veem são eternas.", ref: "2 Coríntios 4:18" },
];

const DAYS_PT = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get current date in Brazil timezone
    const now = new Date();
    const brDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const dayOfYear = Math.floor((brDate.getTime() - new Date(brDate.getFullYear(), 0, 0).getTime()) / 86400000);
    const dayName = DAYS_PT[brDate.getDay()];
    const verse = VERSES[dayOfYear % VERSES.length];

    // Delete old verse alerts
    await supabase
      .from("site_alerts")
      .delete()
      .like("title", "%Versículo do Dia%");

    // Create new verse alert for today
    const { error } = await supabase
      .from("site_alerts")
      .insert({
        title: `📖 Versículo do Dia — ${dayName}`,
        message: `"${verse.verse}"\n\n— ${verse.ref}\n\nA LyneFlix deseja a você um dia abençoado! 🙏`,
        button_text: "Amém! 🙏",
        button_link: null,
        button_style: "primary",
        interval_minutes: 480,
        active: true,
      });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, verse: verse.ref, day: dayName }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
