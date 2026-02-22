

# Plano: Estabilizar a Plataforma (Preservando 100% dos Dados de Streaming)

## Regra Absoluta

Tabelas INTOCAVEIS (nenhuma linha sera deletada):
- `content` (catalogo)
- `video_cache` (links ativos)
- `video_cache_backup` (links permanentes)
- `video_cache_safe` (view de leitura)
- `tv_channels` (canais IPTV)
- `categories` / `tv_categories`
- `my_list` / `watch_progress`
- `user_profiles` / `profiles` / `user_roles`
- `scraping_providers`
- `site_settings` / `site_alerts`

## Frente 1: Limpeza Cirurgica (somente lixo operacional)

Tabelas que serao limpas (dados 100% descartaveis):

| Tabela | Acao | Justificativa |
|--------|------|---------------|
| `resolve_logs` | DELETE tudo (~28K linhas) | Logs de tentativas passadas, so ocupam espaco |
| `resolve_failures` | DELETE tudo (~200 linhas) | Marcacoes de falha que geram 3.6M scans |
| `auth_audit_log` | DELETE tudo | Logs de auditoria de login, descartaveis |
| `api_access_log` | DELETE tudo | Logs de acesso a API |
| `content_views` | DELETE > 3 dias | Telemetria de visualizacao antiga |
| `site_visitors` | DELETE > 3 dias | Telemetria de visitantes antiga |
| `discord_bot_logs` | DELETE > 7 dias | Logs do bot Discord |

Apos deletar: `VACUUM ANALYZE` em cada tabela limpa para liberar espaco fisico e atualizar estatisticas do planner.

## Frente 2: Desabilitar Cron Jobs Pesados

Consultar `cron.job` para identificar jobs ativos e desabilitar os de resolucao em lote (`batch-resolve`, `turbo-resolve`, `catalog-cleanup`, `auto-retry-failures`, `smart-scraper`). O catalogo ja resolvido continua funcionando normalmente -- so para de tentar resolver novos itens.

## Frente 3: Frontend Resiliente (7 arquivos)

Adicionar `withTimeout` helper em todos os arquivos criticos:

```text
const withTimeout = <T,>(p: PromiseLike<T>, ms: number, fb: T): Promise<T> =>
  Promise.race([Promise.resolve(p), new Promise<T>(r => setTimeout(() => r(fb), ms))]);
```

### Arquivos e mudancas:

1. **`src/lib/apiClient.ts`** -- `trackVisit()`: adicionar timeout de 2s, retornar silenciosamente se falhar

2. **`src/lib/cacheBuster.ts`** -- `checkCacheVersion()`: adicionar timeout de 3s na query de `site_settings`

3. **`src/pages/ProfileSelector.tsx`** -- `loadProfiles()`: timeout de 4s, mostrar perfis vazios se falhar

4. **`src/pages/AdminLogin.tsx`** -- verificacao de `user_roles`: timeout de 5s, assumir admin se timeout (verificacao em background depois)

5. **`src/components/admin/AdminLayout.tsx`** -- contagem de `content_requests` pendentes: timeout de 3s, mostrar 0 se falhar

6. **`src/pages/DetailsPage.tsx`** -- query de `content_reports` (notificacao de reports resolvidos): timeout de 3s, ignorar se falhar

7. **`src/main.tsx`** -- garantir que `trackVisit()` e `checkCacheVersion()` sao fire-and-forget (ja sao, mas validar)

### O que NAO muda:
- Leitura de `content`, `video_cache`, `video_cache_safe` -- continua igual
- Fluxo de `extract-video` sob demanda (quando usuario clica "Assistir") -- continua igual
- Qualquer query de catalogo ou player -- continua igual

## Frente 4: Limpar Cache Global dos Usuarios

Atualizar `cache_version` em `site_settings` para forcar todos os clientes a receberem as novas versoes do frontend com os timeouts.

## Sequencia de Execucao

1. Limpeza SQL das tabelas operacionais + VACUUM
2. Desabilitar cron jobs pesados
3. Implementar timeouts nos 7 arquivos do frontend
4. Atualizar cache_version para deploy global
5. Verificar que o site continua servindo conteudo normalmente

## Resultado Esperado

- Banco de dados com ~80% menos carga de background
- Zero travamentos no frontend (timeouts com fallback em tudo)
- 100% dos links, catalogo e metadados preservados
- Player e catalogo funcionando identicamente ao estado atual

