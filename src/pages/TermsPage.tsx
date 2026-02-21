import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LyneflixLogo from "@/components/LyneflixLogo";

const TermsPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 sm:pt-28 pb-16 px-4 sm:px-6 lg:px-12">
        <div className="max-w-3xl mx-auto">
          <LyneflixLogo size="md" animate className="mb-8" />
          <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold mb-6 text-center">Termos de Uso e Condições Gerais</h1>
          
          <div className="space-y-6 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">1. Aceitação dos Termos</h2>
              <p>
                Ao acessar, navegar ou utilizar a plataforma LyneFlix ("Plataforma"), disponível em lyneflix.online, você ("Usuário") declara ter lido, 
                compreendido e aceito integralmente estes Termos de Uso e Condições Gerais ("Termos"). Caso não concorde com qualquer disposição aqui 
                prevista, solicitamos que cesse imediatamente o uso da Plataforma.
              </p>
              <p className="mt-2">
                O uso continuado da Plataforma após eventuais alterações nestes Termos constitui aceitação tácita das modificações realizadas.
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">2. Descrição do Serviço</h2>
              <p>
                A LyneFlix é uma plataforma de indexação e catalogação de conteúdo audiovisual que utiliza APIs públicas de terceiros — incluindo, 
                mas não limitado a, The Movie Database (TMDB) — para exibir metadados informativos sobre filmes, séries e outros conteúdos. 
                A Plataforma não armazena, hospeda, transmite ou distribui arquivos de mídia protegidos por direitos autorais em seus servidores.
              </p>
              <p className="mt-2">
                Os links de reprodução são fornecidos por provedores externos independentes, sobre os quais a LyneFlix não possui controle, 
                responsabilidade ou vínculo contratual. A Plataforma atua exclusivamente como intermediário de referência.
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">3. Cadastro e Conta de Usuário</h2>
              <p>Determinadas funcionalidades da Plataforma requerem a criação de uma conta de usuário. Ao se cadastrar, o Usuário compromete-se a:</p>
              <ul className="list-disc list-inside mt-2 space-y-1.5 pl-4">
                <li>Fornecer informações verdadeiras, completas e atualizadas</li>
                <li>Manter a confidencialidade de suas credenciais de acesso (e-mail e senha)</li>
                <li>Não compartilhar sua conta com terceiros sem autorização</li>
                <li>Comunicar imediatamente qualquer uso não autorizado de sua conta</li>
                <li>Assumir total responsabilidade por todas as atividades realizadas sob sua conta</li>
              </ul>
              <p className="mt-2">
                A LyneFlix reserva-se o direito de suspender ou encerrar contas que violem estes Termos, sem aviso prévio, conforme descrito na Seção 10.
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">4. Uso Aceitável</h2>
              <p>O Usuário compromete-se a utilizar a Plataforma de forma ética e legal, sendo expressamente vedado:</p>
              <ul className="list-disc list-inside mt-2 space-y-1.5 pl-4">
                <li>Utilizar o serviço para fins ilegais, fraudulentos ou não autorizados</li>
                <li>Acessar, modificar ou destruir dados de outros usuários</li>
                <li>Realizar engenharia reversa, descompilação ou desassemblagem da Plataforma</li>
                <li>Utilizar bots, scrapers, spiders ou qualquer meio automatizado para coletar dados</li>
                <li>Sobrecarregar a infraestrutura com volume excessivo de requisições (ataques DDoS/DoS)</li>
                <li>Contornar medidas de segurança, autenticação ou rate limiting implementadas</li>
                <li>Reproduzir, duplicar, copiar, vender ou revender qualquer parte do serviço</li>
                <li>Publicar conteúdo difamatório, abusivo, discriminatório ou que viole direitos de terceiros</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">5. Funcionalidades Interativas</h2>
              <h3 className="text-xs font-semibold text-foreground/80 mt-3 mb-1.5">5.1. Watch Together (Assistir Junto)</h3>
              <p>
                A funcionalidade Watch Together permite que usuários sincronizem a reprodução de conteúdo e se comuniquem em tempo real 
                via chat de texto ou chamada de voz. Ao utilizar esta funcionalidade, o Usuário concorda que:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1.5 pl-4">
                <li>As chamadas de voz são processadas via tecnologia peer-to-peer (WebRTC), sem intermediação de servidores da LyneFlix</li>
                <li>O host da sala possui autoridade para silenciar ou remover participantes</li>
                <li>Mensagens de chat são registradas temporariamente e associadas ao perfil do usuário</li>
                <li>O uso abusivo desta funcionalidade (spam, assédio, conteúdo impróprio) resultará em suspensão imediata</li>
                <li>As salas expiram automaticamente após 6 horas de inatividade</li>
              </ul>

              <h3 className="text-xs font-semibold text-foreground/80 mt-3 mb-1.5">5.2. Minha Lista e Progresso</h3>
              <p>
                Os dados de "Minha Lista" e progresso de visualização são vinculados ao perfil do usuário e podem ser compartilhados 
                via código de compartilhamento gerado pela Plataforma. A LyneFlix não se responsabiliza pela precisão do progresso 
                em caso de falhas nos provedores de conteúdo.
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">6. Privacidade e Proteção de Dados</h2>
              <p>
                A LyneFlix adota medidas rigorosas para proteger a privacidade dos seus usuários, em conformidade com as melhores 
                práticas de segurança da informação:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1.5 pl-4">
                <li>Endereços IP são armazenados exclusivamente em formato hash (SHA-256), impossibilitando a identificação reversa</li>
                <li>Credenciais de acesso são criptografadas e jamais armazenadas em texto plano</li>
                <li>A comunicação entre cliente e servidor é protegida por criptografia TLS/SSL</li>
                <li>Não compartilhamos dados pessoais com terceiros para fins comerciais</li>
                <li>Logs de auditoria são mantidos estritamente para fins de segurança e prevenção de abusos</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">7. Propriedade Intelectual</h2>
              <p>
                Todos os elementos visuais, marcas, logos, design de interface e código-fonte da LyneFlix são de propriedade exclusiva 
                da Plataforma e protegidos por leis de propriedade intelectual aplicáveis. O conteúdo audiovisual exibido — incluindo 
                pôsteres, sinopses e metadados — pertence aos seus respectivos proprietários e detentores de direitos, sendo utilizado 
                conforme as licenças das APIs fornecedoras.
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">8. Isenção de Garantias</h2>
              <p>
                A Plataforma é disponibilizada no estado em que se encontra ("as is"), sem garantias de qualquer natureza, 
                expressas ou implícitas. A LyneFlix não garante que:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1.5 pl-4">
                <li>O serviço será ininterrupto, seguro ou livre de erros</li>
                <li>Os resultados obtidos serão precisos ou confiáveis</li>
                <li>Links de reprodução fornecidos por terceiros estarão sempre disponíveis ou funcionais</li>
                <li>O conteúdo indexado estará atualizado em tempo real</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">9. Limitação de Responsabilidade</h2>
              <p>
                Em nenhuma circunstância a LyneFlix, seus administradores, desenvolvedores ou afiliados serão responsáveis por danos 
                diretos, indiretos, incidentais, especiais, consequenciais ou punitivos decorrentes do uso ou incapacidade de uso 
                da Plataforma, incluindo, mas não limitado a:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1.5 pl-4">
                <li>Conteúdo fornecido por provedores terceiros</li>
                <li>Perda de dados, lucros ou oportunidades de negócios</li>
                <li>Interrupções de serviço causadas por fatores externos</li>
                <li>Ações de usuários que violem estes Termos</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">10. Suspensão e Banimento</h2>
              <p>
                A LyneFlix reserva-se o direito de, a seu exclusivo critério e sem aviso prévio, suspender temporariamente ou 
                banir permanentemente o acesso de qualquer Usuário que viole estes Termos. As medidas incluem:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1.5 pl-4">
                <li>Banimento com registro obrigatório de justificativa</li>
                <li>Restrição imediata de acesso via políticas de segurança (RLS)</li>
                <li>Registro em log de auditoria para fins de compliance</li>
                <li>Bloqueio de IP em casos de atividade maliciosa comprovada</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">11. Alterações nos Termos</h2>
              <p>
                A LyneFlix poderá modificar estes Termos a qualquer momento, mediante publicação da versão atualizada nesta página. 
                Recomendamos a revisão periódica deste documento. As alterações entram em vigor imediatamente após a publicação, 
                e o uso continuado da Plataforma constitui aceitação integral dos novos Termos.
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">12. Disposições Gerais</h2>
              <p>
                Caso qualquer disposição destes Termos seja considerada inválida ou inexequível, as demais disposições permanecerão 
                em pleno vigor e efeito. A omissão da LyneFlix em exercer qualquer direito previsto nestes Termos não constitui renúncia 
                a esse direito.
              </p>
            </section>

            <section>
              <h2 className="font-display text-sm sm:text-base font-semibold text-foreground mb-2">13. Contato</h2>
              <p>
                Para questões relacionadas a estes Termos de Uso, direitos autorais (DMCA), denúncias de abuso ou solicitações gerais, 
                entre em contato através dos canais oficiais disponíveis na Plataforma.
              </p>
            </section>

            <div className="border-t border-white/[0.06] pt-4 mt-6">
              <p className="text-muted-foreground/60 text-[10px] sm:text-xs">
                Última atualização: Fevereiro de 2026 • lyneflix.online
              </p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default TermsPage;
