// Testa o CÓDIGO REAL extraído dos dois HTMLs, simulando cada cenário de falha.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..'); // raiz do repositório (um nível acima de /tests)

const CORE = fs.readFileSync(path.join(RAIZ, 'dashboard-core.js'), 'utf-8'); // agora tem carregarDadosFallback/textoStatusFallback

function extrair(arquivo, inicioMarca, fimMarca) {
  const html = fs.readFileSync(path.join(RAIZ, arquivo), 'utf-8');
  const a = html.indexOf(inicioMarca);
  const b = html.indexOf(fimMarca, a);
  if (a < 0 || b < 0) throw new Error('marcadores não encontrados em ' + arquivo);
  return CORE + '\n' + html.slice(a, b);
}

const pacoteReal = JSON.parse(fs.readFileSync(path.join(RAIZ, 'dados-fallback.json'), 'utf-8'));
const respOk = (corpo) => ({ ok: true, status: 200, json: async () => corpo });
const resp404 = { ok: false, status: 404, json: async () => ({}) };

let falhas = 0;
function confere(nome, condicao, detalhe) {
  console.log((condicao ? '  ✓ ' : '  ✗ FALHOU: ') + nome + (condicao ? '' : '  → ' + detalhe));
  if (!condicao) falhas++;
}

async function rodar(arquivo, tipo, cenario) {
  const codigo = tipo === 'viz'
    ? extrair(arquivo, 'async function carregarLotes() {', '\n\n\n// Salvaguarda')
    : extrair(arquivo, 'async function carregarLotesSupabase() {', 'if (sb) sb.auth.onAuthStateChange(');

  const log = { status: [], init: 0, kit: 0, fetchChamado: 0, saves: [], ordem: [] };
  const ctx = {
    Chart: { register: () => {} },
    parsePeriodo: () => true, // função não-compartilhada (26 diferentes); stub mínimo só pra não quebrar o teste
    document: { getElementById: () => null }, // esconderSkeletonLoading agora é real (veio do core); só precisa não quebrar
    atualizarSnapshotLotesDe: () => {},
    atualizarBannerBloqueioSalvamento: () => {},
    console: { warn() {}, error() {}, log() {} },
    setSyncStatus: (m) => log.status.push(m),
    sortLotesCronologico: () => log.ordem.push('sort'),
    initDashboard: () => { log.init++; log.ordem.push('init:' + ctx.LOTES.length); },
    esconderSkeletonLoading: () => log.ordem.push('skeleton'),
    carregarKitLotesSupabase: () => { log.kit++; },
    atualizarSnapshotLotesDe: () => {},
    salvarLotesSupabase: async (silencioso) => { log.saves.push({ silencioso, n: ctx.LOTES.length }); },
    fetch: async () => { log.fetchChamado++; return cenario.fetch(); },
    sb: cenario.sb,
    Date, Array, JSON, isNaN,
  };
  ctx.LOTES = [];
  vm.createContext(ctx);
  // "let LOTES" precisa ser reatribuível pelo código extraído → o código usa a global do contexto
  vm.runInContext(codigo, ctx);
  const entrada = tipo === 'viz' ? 'carregarLotes' : 'carregarLotesSupabase';
  await vm.runInContext(entrada + '()', ctx);
  return { log, lotes: ctx.LOTES };
}

const sbOk = { from: () => ({ select: () => ({ order: async () => ({ data: [{ dados: { id: 'X1', per: '09-13/fev' }, updated_at: 'a' }, { dados: { id: 'X2', per: '14-18/fev' }, updated_at: 'b' }], error: null }) }) }) };
const sbErro = { from: () => ({ select: () => ({ order: async () => ({ data: null, error: { message: 'JWT expirado' } }) }) }) };
const sbVazio = { from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }) };
const sbLanca = { from: () => { throw new Error('rede caiu'); } };

(async () => {
  for (const [arquivo, tipo, rotulo] of [['index.html', 'viz', 'VISUALIZAÇÃO'], ['editar.html', 'edit', 'EDITÁVEL']]) {
    console.log('\n══════ ' + rotulo + ' ══════');

    let r = await rodar(arquivo, tipo, { sb: sbOk, fetch: () => respOk(pacoteReal) });
    console.log('1) Supabase OK');
    confere('usa os 2 lotes do Supabase', r.lotes.length === 2, r.lotes.length);
    confere('NÃO baixa o dados-fallback.json (caminho normal fica leve)', r.log.fetchChamado === 0, r.log.fetchChamado);

    r = await rodar(arquivo, tipo, { sb: sbErro, fetch: () => respOk(pacoteReal) });
    console.log('2) Supabase devolve erro → plano B');
    confere('carrega os 26 lotes de reserva', r.lotes.length === 26, r.lotes.length);
    confere('status mostra a data da cópia', /dados offline de \d{2}\/\d{2}\/2026/.test(r.log.status.join('|')), r.log.status.join('|'));

    r = await rodar(arquivo, tipo, { sb: sbLanca, fetch: () => respOk(pacoteReal) });
    console.log('3) Supabase lança exceção (rede) → plano B');
    confere('carrega os 26 lotes de reserva', r.lotes.length === 26, r.lotes.length);

    r = await rodar(arquivo, tipo, { sb: sbErro, fetch: () => resp404 });
    console.log('4) Supabase falha E o arquivo de reserva não existe (404)');
    confere('não quebra; lotes vazios', r.lotes.length === 0, r.lotes.length);
    confere('status avisa "sem dados"', /sem dados/.test(r.log.status.join('|')), r.log.status.join('|'));

    r = await rodar(arquivo, tipo, { sb: sbErro, fetch: () => { throw new Error('bloqueado (file://)'); } });
    console.log('5) fetch bloqueado (arquivo aberto localmente)');
    confere('não quebra; lotes vazios', r.lotes.length === 0, r.lotes.length);

    r = await rodar(arquivo, tipo, { sb: sbErro, fetch: () => respOk({ exportadoEm: '2026-09-21T07:00:00Z', lotes: pacoteReal.lotes, kitMedicoLotes: [] }) });
    console.log('6) reserva no formato do "Backup Externo" / e-mail semanal');
    confere('aceita (26 lotes)', r.lotes.length === 26, r.lotes.length);
    confere('usa a data de exportadoEm (21/09/2026)', /21\/09\/2026/.test(r.log.status.join('|')), r.log.status.join('|'));

    r = await rodar(arquivo, tipo, { sb: sbErro, fetch: () => respOk(pacoteReal.lotes) });
    console.log('7) reserva como array puro (formato antigo do lotesData)');
    confere('aceita (26 lotes)', r.lotes.length === 26, r.lotes.length);

    if (tipo === 'viz') {
      r = await rodar(arquivo, tipo, { sb: null, fetch: () => respOk(pacoteReal) });
      console.log('8) cliente Supabase indisponível (sb = null)');
      confere('carrega o plano B', r.lotes.length === 26, r.lotes.length);
      r = await rodar(arquivo, tipo, { sb: sbErro, fetch: () => respOk(pacoteReal) });
      console.log('9) ORDEM: dados prontos ANTES de desenhar o dashboard');
      confere('dashboard foi iniciado já com os 26 lotes de reserva (não com a lista vazia)', r.log.ordem.join(' > ') === 'init:26', r.log.ordem.join(' > '));
    } else {
      r = await rodar(arquivo, tipo, { sb: sbVazio, fetch: () => respOk(pacoteReal) });
      console.log('8) banco vazio → semeia com o plano B (comportamento original preservado)');
      confere('salva 1 vez, em modo silencioso, com 26 lotes', r.log.saves.length === 1 && r.log.saves[0].silencioso === true && r.log.saves[0].n === 26, JSON.stringify(r.log.saves));
      r = await rodar(arquivo, tipo, { sb: sbVazio, fetch: () => resp404 });
      console.log('9) banco vazio E sem arquivo de reserva');
      confere('NÃO tenta salvar lista vazia por cima do banco', r.log.saves.length === 0, JSON.stringify(r.log.saves));
    }
  }
  console.log('\n' + (falhas === 0 ? '✅ TODOS OS TESTES PASSARAM' : '❌ ' + falhas + ' FALHA(S)'));
  process.exit(falhas === 0 ? 0 : 1);
})();
