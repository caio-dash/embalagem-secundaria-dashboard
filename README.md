[README-Dashboard-Embalagem-Secundaria.md](https://github.com/user-attachments/files/32753003/README-Dashboard-Embalagem-Secundaria.md)
# Dashboard Embalagem Secundária — Documentação Técnica

**Projeto:** Hemobrás — Acompanhamento de produção da linha de Embalagem Secundária
**Repositório:** https://github.com/caio-dash/embalagem-secundaria-dashboard
**Backend:** Supabase (projeto `jvunnfjzqqkrscjldfkf`, "Caio Duarte Project", região `us-west-2`)
**Última atualização deste documento:** 27/09/2026

> Este documento existe para que qualquer pessoa — não só quem construiu o sistema —
> consiga entender, manter e evoluir este dashboard. Se algo aqui ficar desatualizado
> depois de uma mudança, atualize esta seção correspondente no mesmo commit.

---

## 1. Visão geral

O sistema é composto por **dois arquivos HTML independentes**, hospedados como site
estático no GitHub Pages, e um **banco de dados Supabase** compartilhado entre eles.

| Arquivo | No repositório | URL pública | Quem acessa |
|---|---|---|---|
| Dashboard de visualização | `index.html` | `https://caio-dash.github.io/embalagem-secundaria-dashboard/` | Qualquer pessoa (leitura pública) |
| Dashboard editável | `editar.html` | `https://caio-dash.github.io/embalagem-secundaria-dashboard/editar.html` | Só usuários autenticados (login) |

Não existe backend próprio (Node, servidor, etc.) — os dois arquivos são HTML+CSS+JS
puro, e falam diretamente com o Supabase pelo SDK `supabase-js` embutido no `<script>`.
Não há build, bundler ou processo de compilação: o que está no arquivo `.html` é
exatamente o que roda no navegador.

### 1.1 Por que dois arquivos separados (não um só com controle de permissão)?

Separar fisicamente o dashboard público do dashboard de edição significa que quem só
precisa visualizar nunca baixa/carrega o código de edição (menor, mais rápido, sem
risco de alguém achar um jeito de habilitar edição via console do navegador).

---

## 2. Como publicar uma alteração (deploy)

**Não existe deploy automático.** Não há CI/CD, GitHub Actions, nem conector do
GitHub integrado a nenhuma ferramenta de IA usada neste projeto. Todo o processo é
manual:

1. Editar o arquivo `.html` (localmente, ou pedindo a uma IA para gerar a versão nova).
2. No GitHub, abrir o repositório → clicar no arquivo antigo → **Edit** (ícone de
   lápis) → colar o conteúdo novo → **Commit changes**.
   - Alternativa para arquivos grandes: **Add file → Upload files**, arrastar o
     arquivo novo com o mesmo nome, confirmar substituição.
3. O GitHub Pages publica sozinho, geralmente em menos de 1 minuto. Sem necessidade
   de nenhum outro passo.

> ⚠️ Antes de subir uma mudança, rode o **checklist de testes manuais** (seção 9)
> pelo menos uma vez no arquivo baixado, localmente.

---

## 3. Estrutura de dados no Supabase

### 3.1 Tabelas principais

| Tabela | Conteúdo | Coluna de dados | Chave primária |
|---|---|---|---|
| `lotes` | Um registro por lote de produção (linha principal) | `dados` (jsonb) | `id` (texto, ex.: `261001B013`) |
| `kit_medico_lotes` | Um registro por lote do Kit Médico | `dados` (jsonb) | `id` (texto) |

Cada linha tem também `updated_at` (timestamp da última gravação). O **conteúdo real**
do lote (período, produção, descarte, OEE, insumos, dados diários etc.) vive inteiro
dentro da coluna `dados`, como um objeto JSON — a tabela em si só indexa pelo `id`.

> **Ponto de atenção histórico:** o `id` da linha (chave primária da tabela) e o
> `dados->>'id'` (campo interno do lote) **devem ser sempre iguais**. Um bug corrigido
> em setembro/2026 permitia que ficassem dessincronizados quando alguém editava o ID
> de um lote já salvo, criando lotes "fantasma". A validação de ID duplicado
> (seção 6.3) e o botão de exclusão corrigido (seção 6.1) previnem isso hoje.

### 3.2 Tabelas de apoio

| Tabela | Para que serve | Quem grava | Quem lê |
|---|---|---|---|
| `backups` | Snapshot automático toda vez que alguém salva pelo dashboard editável — usado pelo botão "🕐 Backups" pra desfazer uma edição recente | O próprio app, a cada save | Usuários autenticados |
| `backups_externos` | Snapshot diário automático (agendado), isolado do fluxo normal do app | Função `criar_snapshot_backup_externo()`, via `pg_cron` | Usuários autenticados |

### 3.3 Row Level Security (RLS)

RLS está habilitado em todas as tabelas. Resumo das políticas atuais:

| Tabela | SELECT | INSERT/UPDATE | DELETE |
|---|---|---|---|
| `lotes` | Público (qualquer um, inclusive anônimo) | Só autenticado | Só autenticado |
| `kit_medico_lotes` | Público | Só autenticado | Só autenticado |
| `backups_externos` | Só autenticado | Ninguém via API (só a função `security definer`) | Ninguém via API |

> **Se um botão de excluir/salvar "não funcionar" sem erro aparente no futuro**,
> o primeiro lugar a checar é se existe a política de RLS correspondente
> (`select policyname, cmd from pg_policies where tablename = '...'`). Foi
> exatamente isso que causou o bug da "exclusão fantasma" em setembro/2026: a
> política de `DELETE` simplesmente não existia, e o Supabase ignorava
> silenciosamente a tentativa de apagar.

### 3.4 Autenticação

Usa Supabase Auth (e-mail/senha). **Não há cadastro público** — novos usuários
precisam ser criados manualmente pelo administrador do projeto, direto no painel do
Supabase (Authentication → Users → Add user). O dashboard de visualização não exige
login; o editável exige.

---

## 4. Backups — as 3 camadas de proteção

| Camada | O quê | Quando | Onde fica | Sobrevive a... |
|---|---|---|---|---|
| **1. Backup por save** | Cópia da tabela toda vez que alguém salva | A cada clique em "Atualizar Dashboard" | Tabela `backups` (mesmo projeto Supabase) | Erro de edição / querer desfazer algo recente |
| **2. Snapshot diário** | Cópia completa de `lotes` + `kit_medico_lotes` | Todo dia às 3h (automático, `pg_cron`) | Tabela `backups_externos` (mesmo projeto Supabase, isolada) | Bug de aplicação, RLS mal configurada, erro do upsert |
| **3. E-mail semanal** | Arquivo `.json` completo anexado | Toda segunda-feira às 7h (automático) | Enviado por e-mail via Resend, fora do Supabase | Perda do projeto Supabase inteiro (cobrança, exclusão acidental, etc.) |
| **(manual, sob demanda)** | Mesmo `.json` da camada 3 | Quando alguém clicar | Baixado pro computador de quem clicou | Qualquer coisa — fica onde a pessoa guardar |

### 4.1 Detalhes técnicos do backup automático diário

- Função: `public.criar_snapshot_backup_externo()` (`security definer`, roda com
  privilégio elevado).
- Job: `backup-diario-embalagem-secundaria` (`pg_cron`), agendado `0 3 * * *` (3h,
  horário do servidor = UTC).
- Retenção: apaga snapshots com mais de 60 dias automaticamente, a cada execução.

### 4.2 Detalhes técnicos do e-mail semanal

- Edge Function: `backup-semanal-email` (Deno), sem verificação de JWT do Supabase
  (`verify_jwt: false`) — em vez disso, valida um cabeçalho customizado
  `x-cron-secret` contra o segredo `CRON_SECRET`.
- Job: `backup-semanal-email-embalagem-secundaria` (`pg_cron` + `pg_net`), agendado
  `0 7 * * 1` (segunda-feira, 7h UTC).
- Envio via **Resend** (`resend.com`), usando o segredo `RESEND_API_KEY`.
- **Pendência conhecida:** o e-mail hoje vai para `caiosdd@gmail.com` (endereço de
  teste), porque nenhum domínio institucional foi verificado no Resend ainda. Isso
  depende da equipe de TI da Hemobrás adicionar registros DNS (ver combinado em
  27/09/2026). Quando o domínio for verificado, atualizar a constante
  `DESTINATARIO_BACKUP` dentro do código da Edge Function para
  `caio.duarte@hemobras.gov.br` (ou o endereço definitivo).

**Segredos usados por essa função** (configurados em Supabase → Edge Functions →
Secrets, nunca no código nem em texto de conversa):
- `RESEND_API_KEY` — chave da conta Resend.
- `CRON_SECRET` — token gerado internamente, só para autenticar a chamada do
  `pg_cron` para a função (não é credencial de nenhum serviço externo).

### 4.3 Como restaurar um backup

- **Camada 1 (`backups`):** pelo próprio dashboard editável, botão "🕐 Backups" →
  escolher a data → "Restaurar".
- **Camada 2 (`backups_externos`):** não tem tela própria ainda. Restaurar exige uma
  consulta SQL direta no Supabase (peça ajuda a quem tiver acesso ao projeto).
- **Camada 3 (e-mail/manual):** abrir o `.json` recebido e, se precisar repor os
  dados, pedir para reimportar manualmente (também via SQL direto, hoje).

---

## 4.4 Risco: pausa automática por inatividade (plano gratuito)

A organização "Hemobrás" no Supabase está no **plano gratuito**, que **pausa
projetos após 7 dias sem atividade**. Quando isso acontece: o banco para
completamente, o `pg_cron` para de rodar (os jobs perdidos **não são recuperados**
automaticamente depois), as Edge Functions ficam inacessíveis, e **não há nenhuma
notificação** avisando que a pausa ocorreu. Ou seja: os 3 backups descritos acima
também parariam de rodar, silenciosamente.

Não há confirmação oficial de que os próprios jobs do `pg_cron` (backup diário,
e-mail semanal) contam como "atividade" suficiente para evitar essa pausa — há
relatos conflitantes sobre isso. Por segurança, foi criado um mecanismo
**independente do Supabase**, que faz uma escrita real no banco a partir de fora:

- **Tabela:** `system_heartbeat` (uma linha única, sem política de escrita para
  clientes — só a função abaixo grava).
- **Edge Function:** `keep-alive` — recebe uma chamada autenticada (mesmo
  `CRON_SECRET` do backup semanal) e grava a hora atual em `system_heartbeat`.
- **Acionador:** GitHub Actions, workflow `.github/workflows/keep-alive.yml` no
  repositório, rodando a cada 3 dias (margem segura dentro do limite de 7).
- **Segredo necessário no GitHub:** `CRON_SECRET` (Settings → Secrets and
  variables → Actions) — mesmo valor configurado no Supabase.

> **Isso é uma mitigação, não uma garantia.** O Supabase não documenta publicamente
> o critério exato de "atividade". A solução definitiva, se algum dia fizer sentido
> orçamentariamente, é migrar a organização para o plano Pro (US$ 25/mês), que
> elimina esse risco por completo.

---

## 5. Modo TV (kiosk / telão)

Existe **só no dashboard de visualização** (`index.html`). Pensado para rodar sem
supervisão em uma tela grande (recepção, sala de controle, reunião).

### 5.1 O que ele mostra, em ordem

1. **Descarte de Insumos** — zoom individual em cada gráfico de insumo (Bula,
   Etiqueta, Granel, etc.), 20 segundos cada, um de cada vez.
2. **Índice de descarte (%)** — 45s.
3. **Paradas não planejadas registradas (h)** — 45s.
4. **Desvios abertos por lote** — 45s.
5. **OEE médio (equipamentos com dados)** — 45s.
6. **Progresso acumulado de lotes** — 45s, mas com uma particularidade: só neste
   passo, o gráfico é reconstruído com granularidade **mensal** (Jan–Dez, 12 pontos)
   em vez da visão **semanal** padrão do resto do dashboard — mais legível de longe.
   Essa reconstrução é temporária: assim que a aba "Comparativo" for recarregada
   normalmente (por qualquer motivo), o gráfico volta ao padrão semanal sozinho.

Depois do passo 6, o ciclo recomeça do passo 1.

### 5.2 Controles

- Botão flutuante **"▶ Iniciar Modo TV"** (canto inferior esquerdo) liga/desliga.
- Barra de controles (aparece só durante o Modo TV): **◀** anterior, **⏸/▶**
  pausar/retomar, **▶** próximo, **✕** sair.
- Atalhos de teclado (só funcionam com o Modo TV ativo): `Espaço` pausa/retoma,
  `←`/`→` navegam, `Esc` sai.
- Transição com fade suave entre um gráfico e outro (~350ms).

### 5.3 Atualização de dados em segundo plano

A cada 10 minutos, o Modo TV busca dados novos do Supabase silenciosamente, sem
interromper o que está na tela — a atualização só aparece na próxima troca de
gráfico do rodízio.

### 5.4 Onde mexer no código, se precisar mudar algo

- Lista de passos e durações: array `passosTV`, dentro do bloco `MODO TV` no HTML.
- Granularidade mensal do progresso: função `renderProgressoAnualPorMesTV()`.
- Filtro automático de "mês atual" ao entrar no Modo TV: função
  `aplicarFiltroMesAtual()` — só aplica se houver dados carregados para o mês/ano
  correntes, pra não deixar telas vazias.

---

## 6. Dashboard editável — funcionalidades de segurança/UX

### 6.1 Confirmação antes de excluir

Clicar no ✕ de uma linha (Linha Principal ou Kit Médico) sempre pede confirmação,
mostrando o ID do lote, antes de remover — e a exclusão só é persistida de fato no
Supabase quando "Atualizar Dashboard" é clicado depois.

### 6.2 Painel de edição focada

Botão **✎** em cada linha abre um painel maior, com um campo por linha e rótulos
claros, em vez de editar direto na grade densa. Tecnicamente, os campos mostrados no
painel são os **mesmos elementos** da tabela (só movidos de lugar na tela via DOM) —
não há cópia de dados nem sincronização separada. Insumos e dados diários continuam
sendo editados nas linhas expansíveis da própria tabela (fora do escopo do painel).

### 6.3 Validação de ID duplicado

Ao clicar em "Atualizar Dashboard" (ou "Atualizar" no Kit Médico), o sistema verifica
se dois lotes ficaram com o mesmo ID na tabela. Se sim, **bloqueia o salvamento** e
avisa qual ID está duplicado.

### 6.4 Proteção contra sobrescrita simultânea

Antes de qualquer salvamento, o sistema compara um "retrato" (timestamp da última
alteração + contagem de registros) capturado quando a página carregou com o estado
atual do servidor. Se algo mudou nesse meio-tempo (outra pessoa editando ao mesmo
tempo), aparece um aviso perguntando se a pessoa quer mesmo sobrescrever ou prefere
recarregar a página primeiro.

### 6.5 Skeleton loading

Nos dois dashboards, enquanto os dados carregam (ou enquanto se decide se mostra o
login), aparece um layout "fantasma" (blocos cinza animados) em vez de tela em
branco. Há uma salvaguarda de 8 segundos: se algo impedir o carregamento normal, o
skeleton some sozinho, pra nunca travar a tela.

### 6.6 Interface responsiva (inclusive fonte)

Como praticamente todo o CSS deste projeto usa `px` fixo (não `rem`), a
responsividade é feita escalando a página inteira via `zoom`, calculado em JS a
partir da largura da janela (`window.innerWidth`), com 1280px como referência
("tamanho original"). Ajusta automaticamente tanto em celular (menor) quanto em
monitores grandes/TVs (maior).

---

## 7. Como adicionar um novo tipo de insumo

Hoje, os insumos rastreados na aba "Descarte de Insumos" vêm de uma lista fixa no
código (`INSUMOS_META`, no `Dash_Editável.html`, próximo à função `buildDescarte`).
Para adicionar um novo insumo:

1. Localizar `INSUMOS_META` no arquivo editável.
2. Adicionar uma nova entrada com `chave` (identificador interno, ex.: `novoInsumo`)
   e `label` (nome mostrado na tela).
3. Repetir a mesma entrada no `Dash_Visualização.html`, se ele também referenciar essa
   lista para exibição.
4. Nenhuma migração de banco é necessária — o campo entra dentro do `insumos` (jsonb)
   de cada lote automaticamente, e lotes antigos sem esse campo simplesmente não
   mostram dado pra ele (sem erro).

---

## 8. Problemas já resolvidos (para não repetir)

| Data | Sintoma | Causa raiz | Correção |
|---|---|---|---|
| Set/2026 | Lote excluído reaparecia ao recarregar | Botão ✕ só apagava da tela (DOM), nunca mandava `DELETE` pro Supabase — o salvamento fazia só `upsert` | Passou a rastrear IDs removidos e enviar `DELETE` explícito ao salvar |
| Set/2026 | Mesmo depois da correção acima, exclusão continuava não persistindo | Faltava política de RLS de `DELETE` nas tabelas `lotes` e `kit_medico_lotes` — o Supabase ignorava a tentativa silenciosamente | Criadas as políticas de `DELETE` para usuários autenticados |
| Set/2026 | Dashboard mostrava dados desatualizados (faltavam 2 lotes) | O arquivo tinha um array de dados "de fallback" desatualizado, usado antes do Supabase carregar | Dados de fallback ressincronizados com o estado atual do banco |

---

## 9. Checklist manual antes de publicar uma mudança

Não existe suíte de testes automatizados neste projeto. Antes de subir uma alteração
para o GitHub, rode manualmente, no arquivo baixado (localmente, antes do commit):

- [ ] Login funciona no dashboard editável.
- [ ] Adicionar um lote novo (com ID único) salva corretamente.
- [ ] Excluir um lote pede confirmação, some da tela, e **não volta** depois de
      recarregar a página.
- [ ] Tentar salvar dois lotes com o mesmo ID é bloqueado com aviso.
- [ ] Painel de edição (✎) abre, edita e devolve os campos certos pra tabela.
- [ ] Dashboard de visualização carrega os dados certos (mesma contagem de lotes que
      o editável).
- [ ] Modo TV liga, percorre os 6 passos, e os controles (◀ ⏸ ▶ ✕) funcionam.
- [ ] Nenhum erro aparece no Console do navegador (F12 → Console) durante o uso
      normal.

---

## 10. Pendências conhecidas

- [ ] Verificar domínio institucional (`hemobras.gov.br` ou subdomínio) no Resend,
      com apoio da equipe de TI, para trocar o destinatário do e-mail semanal de
      `caiosdd@gmail.com` para `caio.duarte@hemobras.gov.br`.
- [ ] Avaliar upgrade da organização para o plano Pro do Supabase (US$ 25/mês), que
      eliminaria de vez o risco de pausa por inatividade (ver seção 4.4) — hoje
      mitigado, mas não garantido, por um heartbeat externo via GitHub Actions.
- [ ] Não existe tela de restauração para os snapshots da camada 2
      (`backups_externos`) — hoje só é possível via SQL direto no Supabase.
- [ ] Sem MFA (autenticação em duas etapas) para os usuários que editam.
- [ ] Sem diferenciação de papéis entre usuários autenticados (todo mundo que loga
      tem o mesmo nível de permissão).
- [ ] Sem alertas proativos (ex.: e-mail automático se o OEE cair abaixo de um
      limite) — hoje alguém precisa abrir o dashboard pra perceber.

---

## 11. Referências rápidas

- **Projeto Supabase:** `jvunnfjzqqkrscjldfkf`
- **Repositório GitHub:** `caio-dash/embalagem-secundaria-dashboard`
- **Tabelas:** `lotes`, `kit_medico_lotes`, `backups`, `backups_externos`,
  `system_heartbeat`
- **Extensões Postgres usadas:** `pg_cron`, `pg_net`
- **Edge Functions:** `backup-semanal-email`, `keep-alive`
- **Jobs agendados (`pg_cron`, dentro do Supabase):**
  - `backup-diario-embalagem-secundaria` — `0 3 * * *`
  - `backup-semanal-email-embalagem-secundaria` — `0 7 * * 1`
- **Workflow agendado (GitHub Actions, fora do Supabase):**
  - `.github/workflows/keep-alive.yml` — `0 12 */3 * *` (a cada 3 dias)
- **Serviço de e-mail:** Resend (resend.com)
- **Segredos usados (Supabase → Edge Functions → Secrets):** `RESEND_API_KEY`,
  `CRON_SECRET`
- **Segredos usados (GitHub → Settings → Secrets → Actions):** `CRON_SECRET` (mesmo
  valor do Supabase)
