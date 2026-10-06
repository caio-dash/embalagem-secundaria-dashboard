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


const codigo = [
  core,
  bloco('// Bloqueio de salvamento: fica true', 'async function carregarKitLotesSupabase'),
  bloco('async function carregarKitLotesSupabase() {', "\nfunction contarLotesPendentesInsumo"),
].join('\n');

let falhas = 0;
function confere(nome, cond, detalhe) {
  console.log((cond ? '  ✓ ' : '  ✗ FALHOU: ') + nome + (cond ? '' : '  → ' + JSON.stringify(detalhe)));
  if (!cond) falhas++;
}

function novoContexto(sb) {
  const chamadas = { alert: [], banner: { display: 'none', texto: '' }, escreveu: false };
  const ctx = {
    console: { warn(){}, error(){}, log(){} },
    Chart: { register: () => {} },
    parsePeriodo: () => true,
    alert: (m) => chamadas.alert.push(m),
    confirm: () => true,
    setKitSyncStatus: () => {},
    sortKitLotesCronologico: () => {}, renderKitSheet: () => {},
    existeConflitoDeEdicaoKit: async () => false,
    criarBackup: async () => {},
    idsKitLotesParaExcluir: [],
    document: { getElementById: () => ({
      style: { set display(v){ chamadas.banner.display = v; } },
      set textContent(v) { chamadas.banner.texto = v; }, get textContent(){ return chamadas.banner.texto; }
    }) },
    sb, KIT_LOTES: [],
    Date, Array, JSON, Promise, Set,
  };
  ctx._chamadas = chamadas;
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx);
  return ctx;
}

function sbFake({ selectData, selectError }) {
  return {
    from: () => ({
      select: () => ({ order: async () => ({ data: selectData, error: selectError || null }) }),
      upsert: async () => { global.__escreveuKit = true; return { error: null }; },
      delete: () => ({ in: async () => ({ error: null }) })
    }),
    auth: { getSession: async () => ({ data: { session: { user: {} } } }) }
  };
}

(async () => {
  console.log('1) Kit Médico — carregamento OK → salvamento PERMITIDO');
  global.__escreveuKit = false;
  let ctx = novoContexto(sbFake({ selectData: [{ dados: { id:'K1' }, updated_at:'t' }] }));
  await vm.runInContext('carregarKitLotesSupabase()', ctx);
  confere('salvamentoKitBloqueado = false', vm.runInContext('salvamentoKitBloqueado', ctx) === false);
  ctx.KIT_LOTES = [{ id: 'K1' }];
  await vm.runInContext('salvarKitLotesSupabase()', ctx);
  confere('não bloqueou', ctx._chamadas.alert.length === 0, ctx._chamadas.alert);
  confere('escreveu no banco', global.__escreveuKit === true);

  console.log('\n2) Kit Médico — erro ao carregar → BLOQUEADO');
  global.__escreveuKit = false;
  ctx = novoContexto(sbFake({ selectData: null, selectError: { message: 'timeout' } }));
  await vm.runInContext('carregarKitLotesSupabase()', ctx);
  confere('salvamentoKitBloqueado = true', vm.runInContext('salvamentoKitBloqueado', ctx) === true);
  ctx.KIT_LOTES = [{ id: 'K1' }];
  await vm.runInContext('salvarKitLotesSupabase()', ctx);
  confere('mostrou alert', ctx._chamadas.alert.length === 1, ctx._chamadas.alert);
  confere('NÃO escreveu no banco', global.__escreveuKit === false);

  console.log('\n3) Kit Médico — sb ausente (offline) → BLOQUEADO, sem crashar');
  ctx = novoContexto(null);
  await vm.runInContext('carregarKitLotesSupabase()', ctx);
  confere('salvamentoKitBloqueado = true', vm.runInContext('salvamentoKitBloqueado', ctx) === true);
  confere('motivo registrado', vm.runInContext('motivoBloqueioKit', ctx).length > 0, vm.runInContext('motivoBloqueioKit', ctx));

  console.log('\n' + (falhas === 0 ? '✅ TODOS OS TESTES PASSARAM (Kit Médico)' : '❌ ' + falhas + ' FALHA(S)'));
  process.exit(falhas === 0 ? 0 : 1);
})();
