import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LyneflixLogo from "@/components/LyneflixLogo";

const DmcaPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 sm:pt-28 pb-16 px-4 sm:px-6 lg:px-12">
        <div className="max-w-3xl mx-auto">
          <LyneflixLogo size="md" animate className="mb-8" />
          <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold mb-6 text-center">Política DMCA — Digital Millennium Copyright Act</h1>
          
          <div className="space-y-6 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">1. Introdução e Compromisso</h2>
              <p>
                A LyneFlix ("Plataforma"), acessível em lyneflix.online, respeita e protege os direitos de propriedade intelectual de terceiros, 
                em estrita conformidade com o Digital Millennium Copyright Act (DMCA), 17 U.S.C. § 512. Estamos comprometidos em responder 
                prontamente a notificações legítimas de supostas infrações de direitos autorais e em cooperar com detentores de direitos 
                para a remoção de conteúdo infrator.
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">2. Natureza do Serviço — Isenção de Hospedagem</h2>
              <p>
                É fundamental esclarecer que a LyneFlix opera exclusivamente como um serviço de indexação e catalogação de metadados 
                audiovisuais. A Plataforma:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1.5 pl-4">
                <li><strong>NÃO armazena</strong> arquivos de mídia (vídeos, áudios) em seus servidores</li>
                <li><strong>NÃO hospeda</strong> conteúdo protegido por direitos autorais</li>
                <li><strong>NÃO transmite</strong> ou distribui streams de vídeo por conta própria</li>
                <li><strong>NÃO possui</strong> controle sobre os provedores de conteúdo indexados</li>
              </ul>
              <p className="mt-2">
                Todo conteúdo audiovisual referenciado na Plataforma é fornecido por provedores externos independentes, 
                sobre os quais a LyneFlix não possui responsabilidade, controle editorial ou vínculo contratual. Os metadados 
                exibidos (pôsteres, sinopses, avaliações) são obtidos via APIs públicas como The Movie Database (TMDB).
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">3. Agente Designado para Notificações</h2>
              <p>
                Em conformidade com o DMCA, a LyneFlix designa o seguinte canal para recebimento de notificações 
                de violação de direitos autorais:
              </p>
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 mt-3">
                <p className="text-foreground font-medium text-sm">Agente DMCA — LyneFlix</p>
                <p className="mt-1">Plataforma: lyneflix.online</p>
                <p>Canal de contato: Formulário de denúncia disponível na Plataforma</p>
                <p className="text-[10px] text-muted-foreground/50 mt-2">
                  Notificações enviadas por outros canais ou em formato inadequado poderão sofrer atrasos no processamento.
                </p>
              </div>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">4. Requisitos para Notificação Válida</h2>
              <p>
                Para que uma notificação de DMCA seja considerada válida e processada, o reclamante deve fornecer, conforme 17 U.S.C. § 512(c)(3), 
                os seguintes elementos obrigatórios:
              </p>
              <ol className="list-decimal list-inside mt-2 space-y-2 pl-4">
                <li>
                  <strong>Identificação da obra protegida:</strong> Descrição detalhada ou link para a obra protegida por direitos autorais 
                  que alega ter sido violada
                </li>
                <li>
                  <strong>Identificação do material infrator:</strong> URL(s) específica(s) na Plataforma onde o material supostamente 
                  infrator pode ser encontrado, com informação suficiente para sua localização
                </li>
                <li>
                  <strong>Dados de contato do reclamante:</strong> Nome completo, endereço postal, número de telefone e endereço de e-mail válido
                </li>
                <li>
                  <strong>Declaração de boa-fé:</strong> Declaração escrita de que o reclamante acredita, de boa-fé, que o uso do material 
                  não é autorizado pelo titular dos direitos, seu agente ou pela lei
                </li>
                <li>
                  <strong>Declaração de veracidade:</strong> Declaração, sob pena de perjúrio, de que as informações contidas na notificação 
                  são precisas e que o reclamante é o titular dos direitos ou está autorizado a agir em seu nome
                </li>
                <li>
                  <strong>Assinatura:</strong> Assinatura física ou eletrônica do titular dos direitos autorais ou pessoa legalmente 
                  autorizada a agir em seu nome
                </li>
              </ol>
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3 mt-3">
                <p className="text-yellow-400/80 text-xs font-medium">
                  ⚠️ Notificações incompletas ou que não cumpram todos os requisitos acima poderão ser recusadas ou devolvidas para complementação.
                </p>
              </div>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">5. Procedimento de Remoção</h2>
              <p>Ao receber uma notificação válida de DMCA, a LyneFlix adotará as seguintes medidas:</p>
              <ul className="list-disc list-inside mt-2 space-y-1.5 pl-4">
                <li>Confirmação de recebimento ao reclamante em até 48 horas úteis</li>
                <li>Análise da notificação quanto à conformidade com os requisitos do §512(c)(3)</li>
                <li>Remoção ou desativação do acesso ao material indexado de forma expedita</li>
                <li>Notificação ao provedor de conteúdo responsável, quando identificável</li>
                <li>Registro interno da notificação para fins de compliance e auditoria</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">6. Contra-Notificação</h2>
              <p>
                Se o Usuário ou provedor de conteúdo afetado por uma remoção acreditar que o material foi removido por erro ou 
                identificação equivocada, poderá submeter uma contra-notificação nos termos do 17 U.S.C. § 512(g), contendo:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1.5 pl-4">
                <li>Identificação do material removido e sua localização anterior na Plataforma</li>
                <li>Declaração, sob pena de perjúrio, de que a remoção decorreu de erro ou identificação equivocada</li>
                <li>Nome, endereço, telefone e consentimento para jurisdição do tribunal federal competente</li>
                <li>Assinatura física ou eletrônica</li>
              </ul>
              <p className="mt-2">
                Após recebimento de uma contra-notificação válida, a LyneFlix poderá restaurar o material em até 14 dias úteis, 
                salvo se o reclamante original notificar a instauração de ação judicial.
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">7. Política de Reincidência</h2>
              <p>
                Em conformidade com o DMCA, a LyneFlix adota uma política rigorosa contra reincidência:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1.5 pl-4">
                <li>Provedores de conteúdo com violações recorrentes terão seus links permanentemente removidos</li>
                <li>Usuários que promovam ou facilitem violações repetidas terão suas contas suspensas ou encerradas</li>
                <li>Registros de violações são mantidos para fins de auditoria e compliance</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">8. Notificações Fraudulentas</h2>
              <p>
                A submissão de notificações de DMCA fraudulentas, de má-fé ou materialmente falsas constitui violação da lei federal 
                e pode sujeitar o reclamante a responsabilidade civil por danos, incluindo custos e honorários advocatícios, conforme 
                previsto no 17 U.S.C. § 512(f).
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">9. Limitação de Responsabilidade</h2>
              <p>
                A LyneFlix não se responsabiliza pelo conteúdo disponibilizado por provedores terceiros. A remoção de referências 
                na Plataforma não implica em remoção do conteúdo original nos servidores dos provedores. Para remoção efetiva do 
                conteúdo-fonte, o reclamante deverá contatar diretamente o provedor de hospedagem responsável.
              </p>
            </section>

            <div className="border-t border-white/[0.06] pt-4 mt-6">
              <p className="text-muted-foreground/60 text-[10px] sm:text-xs">
                Última atualização: Fevereiro de 2026 • lyneflix.online
              </p>
              <p className="text-muted-foreground/40 text-[9px] mt-1">
                Este documento está em conformidade com o Digital Millennium Copyright Act (DMCA), 17 U.S.C. § 512.
              </p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default DmcaPage;
