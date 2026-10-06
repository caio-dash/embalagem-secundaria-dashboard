// Testa o CÓDIGO REAL do bloqueio de salvamento, extraído do HTML de verdade.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(RAIZ, 'editar.html'), 'utf-8');
const core = fs.readFileSync(path.join(RAIZ, 'dashboard-core.js'), 'utf-8');

function bloco(inicioMarca, fimMarca) {
  const a = html.indexOf(inicioMarca);
  if (a < 0) throw new Error('início não encontrado: ' + inicioMarca);
  const b = html.indexOf(fimMarca, a);
  if (b < 0) throw new Error('fim não encontrado: ' + fimMarca);
  return html.slice(a, b);
}

// Extrai uma função inteira contando chaves, a partir do texto onde ela começa
// (inclui o '{' de abertura), até a chave que fecha ela de verdade.
function funcaoCompleta(marcaInicio) {
  const a = html.indexOf(marcaInicio);
  if (a < 0) throw new Error('início não encontrado: ' + marcaInicio);
  let i = html.indexOf('{', a);
  let profundidade = 0;
  for (; i < html.length; i++) {
    if (html[i] === '{') profundidade++;
    else if (html[i] === '}') { profundidade--; if (profundidade === 0) { i++; break; } }
  }
  return html.slice(a, i);
}

const codigo = [
  core,
  bloco('// Bloqueio de salvamento: fica true', 'async function carregarKitLotesSupabase'),
  bloco('async function carregarLotesSupabase() {', "\nif (sb) sb.auth.onAuthStateChange"),
  bloco('async function salvarLotesSupabase(silencioso) {', "\nasync function registrarAuditoria"),
].join('\n');

let falhas = 0;
function confere(nome, cond, detalhe) {
  console.log((cond ? '  ✓ ' : '  ✗ FALHOU: ') + nome + (cond ? '' : '  → ' + JSON.stringify(detalhe)));
  if (!cond) falhas++;
}

function novoContexto(sb) {
  const chamadas = { alert: [], status: [], banner: { display: 'none', texto: '' }, toasts: [], escreveu: false };
  const sbComEscrita = sb.from ? sb : sb; // (mantido simples)
  const ctx = {
    console: { warn(){}, error(){}, log(){} },
    Chart: { register: () => {} },
    parsePeriodo: () => true,
    alert: (m) => chamadas.alert.push(m),
    confirm: () => true,
    setSyncStatus: (m) => chamadas.status.push(m),
    showToast: (m) => chamadas.toasts.push(m),
    sortLotesCronologico: () => {}, initDashboard: () => {},
    atualizarSnapshotLotesDe: () => {},
    existeConflitoDeEdicaoLotes: async () => false,
    criarBackup: async () => {},
    carregarDadosFallback: async () => ({ carregou: false, geradoEm: null }),
    textoStatusFallback: () => 'sem dados (offline)',
    salvarLotesSupabase: undefined, // será a função real extraída; evita erro se referenciada antes
    idsLotesParaExcluir: [],
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }), // sem dados-fallback.json neste teste
    document: {
      getElementById: (id) => ({
        style: { set display(v){ chamadas.banner.display = v; } },
        set textContent(v) { chamadas.banner.texto = v; }, get textContent(){ return chamadas.banner.texto; }
      })
    },
    sb, LOTES: [],
    Date, Array, JSON, Promise, Set,
  };
  ctx._chamadas = chamadas;
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx);
  return ctx;
}

// sb "de verdade o suficiente": from() devolve um objeto que serve tanto para
// select().order() (leitura) quanto para upsert()/delete().in() (escrita).
function sbFake({ selectData, selectError }) {
  return {
    from: (tabela) => ({
      select: () => ({ order: async () => ({ data: selectData, error: selectError || null }) }),
      upsert: async (linhas) => { global.__escreveu = true; return { error: null }; },
      delete: () => ({ in: async () => ({ error: null }) })
    }),
    auth: { getSession: async () => ({ data: { session: { user: {} } } }) }
  };
}
function sbQueLanca() { return { from: () => { throw new Error('rede caiu'); } }; }

(async () => {
  console.log('1) Carregamento OK → salvamento deve ser PERMITIDO');
  global.__escreveu = false;
  let ctx = novoContexto(sbFake({ selectData: [{ dados: { id: 'A' }, updated_at: 't' }] }));
  await vm.runInContext('carregarLotesSupabase()', ctx);
  confere('salvamentoLotesBloqueado = false', vm.runInContext('salvamentoLotesBloqueado', ctx) === false);
  confere('banner escondido', ctx._chamadas.banner.display === 'none', ctx._chamadas.banner);
  await vm.runInContext('salvarLotesSupabase()', ctx);
  confere('NÃO mostrou alert de bloqueio', ctx._chamadas.alert.length === 0, ctx._chamadas.alert);
  confere('chegou a escrever no banco (upsert)', global.__escreveu === true);

  console.log('\n2) Supabase retorna ERRO ao carregar → salvamento deve ser BLOQUEADO');
  global.__escreveu = false;
  ctx = novoContexto(sbFake({ selectData: null, selectError: { message: 'JWT expirado' } }));
  await vm.runInContext('carregarLotesSupabase()', ctx);
  confere('salvamentoLotesBloqueado = true', vm.runInContext('salvamentoLotesBloqueado', ctx) === true);
  confere('banner visível com o motivo (JWT expirado)', ctx._chamadas.banner.display === 'flex' && ctx._chamadas.banner.texto.includes('JWT expirado'), ctx._chamadas.banner);
  await vm.runInContext('salvarLotesSupabase()', ctx);
  confere('mostrou alert de bloqueio', ctx._chamadas.alert.length === 1, ctx._chamadas.alert);
  confere('NÃO chegou a escrever no banco', global.__escreveu === false);

  console.log('\n3) Banco genuinamente vazio (sem erro) → NÃO deve bloquear (estado real confirmado)');
  ctx = novoContexto(sbFake({ selectData: [] }));
  await vm.runInContext('carregarLotesSupabase()', ctx);
  confere('salvamentoLotesBloqueado = false', vm.runInContext('salvamentoLotesBloqueado', ctx) === false);
  confere('banner escondido', ctx._chamadas.banner.display === 'none', ctx._chamadas.banner);

  console.log('\n4) Exceção de rede ao carregar (sb lança) → deve BLOQUEAR');
  ctx = novoContexto(sbQueLanca());
  await vm.runInContext('carregarLotesSupabase()', ctx);
  confere('salvamentoLotesBloqueado = true', vm.runInContext('salvamentoLotesBloqueado', ctx) === true);

  console.log('\n5) Bloqueado → depois recarrega com sucesso → deve DESBLOQUEAR');
  ctx = novoContexto(sbFake({ selectData: null, selectError: { message: 'erro X' } }));
  await vm.runInContext('carregarLotesSupabase()', ctx);
  confere('bloqueado após erro', vm.runInContext('salvamentoLotesBloqueado', ctx) === true);
  ctx.sb = sbFake({ selectData: [{ dados: { id: 'A' }, updated_at: 't' }] });
  await vm.runInContext('carregarLotesSupabase()', ctx);
  confere('desbloqueado após novo carregamento OK', vm.runInContext('salvamentoLotesBloqueado', ctx) === false);
  confere('banner volta a esconder', ctx._chamadas.banner.display === 'none', ctx._chamadas.banner);

  console.log('\n' + (falhas === 0 ? '✅ TODOS OS TESTES PASSARAM' : '❌ ' + falhas + ' FALHA(S)'));
  process.exit(falhas === 0 ? 0 : 1);
})();
