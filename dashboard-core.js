// ════════════════════════════════════════════════════════════════════
// dashboard-core.js — código 100% idêntico entre Dash_Visualização e
// Dash_Editável (Fase 2 da reorganização, 30/09/2026). Corrigir aqui
// corrige os dois dashboards de uma vez — não precisa mais replicar.
//
// Carregar DEPOIS do Chart.js e ANTES do script específico de cada página.
// ════════════════════════════════════════════════════════════════════

// ── Constantes, paleta de cores, plugins do Chart.js e formatadores ──
const ANO_MIN = 2026;
const ANO_MAX = new Date().getFullYear() + 2;
const MES_ORDER = gerarMesOrder(ANO_MIN, ANO_MAX);
const MES_ABREV = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const BASE_YEAR = new Date().getFullYear();
const Q_ORDER = ['Q1','Q2','Q3','Q4'];
const Q_NOMES = {Q1:'Q1 (Jan–Mar)', Q2:'Q2 (Abr–Jun)', Q3:'Q3 (Jul–Set)', Q4:'Q4 (Out–Dez)'};
const EQUIPAMENTOS = ['rot1','rot2','esteira','bla','unit'];
const EQ_NOMES = ['Rotuladora 1','Rotuladora 2','Esteira Principal','BLA','Unitizadora'];

const fNum = n => Math.round(n).toLocaleString('pt-BR');
const fPct = n => n.toFixed(1).replace('.',',') + '%';
const fPct3 = n => n.toFixed(3).replace('.',',') + '%';
const fH = h => { const hh=Math.floor(h); const mm=Math.round((h-hh)*60); return `${hh}h${String(mm).padStart(2,'0')}`; };
const clr = { line1:'#4f8ef7', line2:'#22d496', line3:'#f5a623', purple:'#9b6bff', teal:'#2ddab4',
              grid:'rgba(255,255,255,0.06)', text:'#8a94b0', red:'#f04060', green:'#22d496', amber:'#f5a623' };
const refBandPlugin = {
  id: 'refBand',
  beforeDraw(chart, args, opts) {
    if (!opts || opts.min == null || opts.max == null || opts.visible === false) return;
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.y) return;
    const yTop = scales.y.getPixelForValue(opts.max);
    const yBot = scales.y.getPixelForValue(opts.min);
    ctx.save();
    // Preenchimento mais forte para ficar bem visível atrás das barras/linhas
    ctx.fillStyle = opts.color || 'rgba(155,107,255,0.24)';
    ctx.fillRect(chartArea.left, yTop, chartArea.right - chartArea.left, yBot - yTop);
    // Bordas superior e inferior sólidas e destacadas (não só pontilhado fraco)
    ctx.setLineDash([6, 3]);
    ctx.strokeStyle = opts.borderColor || 'rgba(155,107,255,0.95)';
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.moveTo(chartArea.left, yTop); ctx.lineTo(chartArea.right, yTop);
    ctx.moveTo(chartArea.left, yBot); ctx.lineTo(chartArea.right, yBot);
    ctx.stroke();
    // Rótulo da faixa no canto superior direito da banda
    if (opts.label) {
      ctx.setLineDash([]);
      ctx.font = '600 10px Inter, sans-serif';
      ctx.fillStyle = opts.borderColor || 'rgba(200,180,255,0.95)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(opts.label, chartArea.right - 4, Math.max(yTop - 2, chartArea.top + 10));
    }
    ctx.restore();
  }
};
Chart.register(refBandPlugin);
const S_ORDER = ['S1','S2'];
const S_NOMES = { S1: 'S1 (Jan–Jun)', S2: 'S2 (Jul–Dez)' };
const DIAS_POR_MES = [31,28,31,30,31,30,31,31,30,31,30,31]; // 2026 não é bissexto
const NOMES_MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const trendSummaryPlugin = {
  id: 'trendSummary',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    chart.data.datasets.forEach((ds, i) => {
      if (!ds.trendSummary) return;
      const meta = chart.getDatasetMeta(i);
      if (!meta || meta.hidden) return;
      const data = ds.data;
      const validIdx = data.map((v, idx) => (v !== null && v !== undefined && !isNaN(v)) ? idx : null).filter(v => v !== null);
      if (!validIdx.length) return;
      const { unit = '', decimals = 1, mode = 'delta', label = '' } = ds.trendSummary;
      let texto, lastIdx;
      if (mode === 'value') {
        // Mostra o valor constante da linha (usado pela "Média") em vez de uma variação
        lastIdx = validIdx[validIdx.length - 1];
        const valor = data[lastIdx];
        texto = `${label ? label + ': ' : ''}${valor.toFixed(decimals)}${unit}`;
      } else {
        if (validIdx.length < 2) return;
        const firstIdx = validIdx[0];
        lastIdx = validIdx[validIdx.length - 1];
        const delta = data[lastIdx] - data[firstIdx];
        const seta = delta > 0.0001 ? '▲' : delta < -0.0001 ? '▼' : '►';
        texto = `${seta} ${delta > 0 ? '+' : ''}${delta.toFixed(decimals)}${unit}`;
      }
      const point = meta.data[lastIdx];
      if (!point) return;
      ctx.save();
      ctx.font = '600 10px Inter, sans-serif';
      const largura = ctx.measureText(texto).width;
      const x = Math.min(point.x + 6, chartArea.right - 4 - largura);
      const y = Math.max(chartArea.top + 8, Math.min(point.y, chartArea.bottom - 8));
      ctx.fillStyle = ds.borderColor || '#9b6bff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(texto, x, y);
      ctx.restore();
    });
  }
};
Chart.register(trendSummaryPlugin);

// ── Funções utilitárias e de construção de gráficos (idênticas nos dois arquivos) ──
function abrirZoomChart(key, origEl) {
  const config = CHART_CONFIGS[key];
  const modal = document.getElementById('chartZoomModal');
  const canvas = document.getElementById('chartZoomCanvas');
  const tituloEl = document.getElementById('chartZoomTitle');
  if (!config || !modal || !canvas) return;
  if (zoomChartInstance) { zoomChartInstance.destroy(); zoomChartInstance = null; }
  if (tituloEl) {
    const painelTitulo = origEl && origEl.closest ? origEl.closest('.chart-panel')?.querySelector('.chart-title')?.textContent : '';
    tituloEl.textContent = painelTitulo || '';
  }
  modal.style.display = 'flex';
  zoomChartInstance = new Chart(canvas, {
    type: config.type,
    data: config.data,
    options: { ...(config.options || {}), maintainAspectRatio: false, responsive: true }
  });
}

function addDiaRow(tbodyId, d) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const tr = document.createElement('tr');
  d = d || {};
  tr.innerHTML = `
    <td style="padding:3px 4px"><input type="text" value="${d.d||''}" placeholder="dd/mmm ou turno" style="background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:3px 5px;font-size:11px;width:90px"></td>
    <td style="padding:3px 4px"><input type="number" value="${d.est||''}" placeholder="0" style="background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:3px 5px;font-size:11px;width:70px;text-align:right"></td>
    <td style="padding:3px 4px"><input type="number" value="${d.real||''}" placeholder="0" style="background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:3px 5px;font-size:11px;width:70px;text-align:right"></td>
    <td style="padding:3px 4px"><input type="number" value="${d.desc||0}" placeholder="0" style="background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:3px 5px;font-size:11px;width:60px;text-align:right"></td>
    <td style="padding:3px 4px"><input type="number" step="0.001" value="${d.tE!==undefined?+(d.tE*24).toFixed(3):''}" placeholder="0.000" style="background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:3px 5px;font-size:11px;width:65px;text-align:right"></td>
    <td style="padding:3px 4px"><input type="number" step="0.001" value="${d.tR!==undefined?+(d.tR*24).toFixed(3):''}" placeholder="0.000" style="background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:3px 5px;font-size:11px;width:65px;text-align:right"></td>
    <td style="padding:3px 4px"><input type="number" value="${d.efPrev!==undefined?d.efPrev:21}" style="background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:3px 5px;font-size:11px;width:50px;text-align:right"></td>
    <td style="padding:3px 4px"><input type="number" value="${d.ausP!==undefined?d.ausP:0}" style="background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:3px 5px;font-size:11px;width:50px;text-align:right"></td>
    <td style="padding:3px 4px"><input type="number" value="${d.efReal!==undefined?d.efReal:21}" style="background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:3px 5px;font-size:11px;width:50px;text-align:right"></td>
    <td style="padding:3px 4px"><button onclick="this.closest('tr').remove()" style="background:rgba(240,64,96,0.15);border:1px solid rgba(240,64,96,0.3);color:var(--red);border-radius:4px;padding:2px 7px;cursor:pointer;font-size:11px">✕</button></td>`;
  tbody.appendChild(tr);
}

function agregarGrupo(nome, ls, chaveExtra) {
  const plan = ls.reduce((a,l)=>a+l.plan,0);
  const prod = ls.reduce((a,l)=>a+l.prod,0);
  const desc = ls.reduce((a,l)=>a+l.desc,0);
  const tRealMedio = ls.length ? ls.reduce((a,l)=>a+l.tRealE4a,0)/ls.length : 0;
  const tEstMedio = ls.length ? ls.reduce((a,l)=>a+l.tEstE4,0)/ls.length : 0;
  const oeeLs = ls.filter(l=>l.oee);
  // OEE médio do grupo = média do OEE médio de cada lote (mesmos 5 equipamentos usados
  // na tabela "Comparativo entre Lotes" — antes este campo só considerava a Rotuladora 1).
  const oeeMediosPorLote = oeeLs.map(l => oeeMedioLote(l.oee)).filter(v => v !== null);
  const oeeMedia = oeeMediosPorLote.length ? oeeMediosPorLote.reduce((a,b)=>a+b,0)/oeeMediosPorLote.length : null;
  const oeeEst = oeeLs.length ? oeeLs.reduce((a,l)=>a+l.oee.esteira,0)/oeeLs.length : null;
  const oeeBla = oeeLs.length ? oeeLs.reduce((a,l)=>a+l.oee.bla,0)/oeeLs.length : null;
  return { nome, chave: chaveExtra ?? nome, lotes: ls, plan, prod, desc, tRealMedio, tEstMedio, oeeMedia, oeeEst, oeeBla, nLotes: ls.length };
}

function agregarLotesComparativo(lotesFiltrados) {
  const grupos = {};
  lotesFiltrados.forEach(l => {
    const g = grupoDoLote(l, compGranularidade);
    if (!g || !g.key) return;
    if (!grupos[g.key]) {
      grupos[g.key] = {
        label: g.label, order: g.order, nLotes: 0,
        plan: 0, prod: 0, desc: 0, desvAb: 0,
        tEstE4Soma: 0, tRealE4aSoma: 0,
        pnpSoma: 0, pnpN: 0,
        oeeSoma: 0, oeeN: 0
      };
    }
    const grp = grupos[g.key];
    grp.nLotes++;
    grp.plan += l.plan;
    grp.prod += l.prod;
    grp.desc += l.desc;
    grp.desvAb += (l.desvAb || 0);
    grp.tEstE4Soma += l.tEstE4;
    grp.tRealE4aSoma += l.tRealE4a;
    if (l.pnp !== null && l.pnp !== undefined) { grp.pnpSoma += l.pnp; grp.pnpN++; }
    const oeeM = oeeMedioLote(l.oee);
    if (oeeM !== null) { grp.oeeSoma += oeeM; grp.oeeN++; }
  });
  return Object.values(grupos).sort((a, b) => a.order - b.order).map(g => ({
    label: g.label,
    nLotes: g.nLotes,
    plan: g.plan, prod: g.prod, desc: g.desc, desvAb: g.desvAb,
    descPct: g.plan ? (g.desc / g.plan * 100) : 0,
    tEstE4: g.nLotes ? g.tEstE4Soma / g.nLotes : 0,
    tRealE4a: g.nLotes ? g.tRealE4aSoma / g.nLotes : 0,
    pnp: g.pnpN ? g.pnpSoma / g.pnpN : null,
    oeeMedio: g.oeeN ? g.oeeSoma / g.oeeN : null
  }));
}

function anoDoMes(mesStr) {
  if (!mesStr) return BASE_YEAR;
  const m = String(mesStr).match(/\/(\d{2})$/);
  return m ? 2000 + (+m[1]) : BASE_YEAR;
}

function aplicarEstadoAlertasFaixa() {
  const conteudo = document.getElementById('descAlertasFaixaConteudo');
  const icone = document.getElementById('descAlertasFaixaToggleIcone');
  if (!conteudo || !icone) return;
  conteudo.style.display = alertasFaixaVisivel ? 'flex' : 'none';
  icone.textContent = alertasFaixaVisivel ? '▲ ocultar' : '▼ mostrar';
}

function autoPreencherLinha(tr) {
  const perInput = tr.querySelector('.f-per');
  const resultado = parsePeriodo(perInput.value);
  if (!resultado) {
    perInput.title = 'Formato não reconhecido — Mês/Trimestre/Dias precisam ser preenchidos manualmente. Use dd–dd/mmm ou dd/mmm–dd/mmm (ex.: 06–12/jan ou 26/fev–04/mar).';
    perInput.style.outline = '1px solid rgba(245,166,35,0.5)';
    return;
  }
  perInput.title = '';
  perInput.style.outline = '';
  tr.querySelector('.f-mes').value = resultado.mes;
  tr.querySelector('.f-q').value = resultado.q;
  tr.querySelector('.f-dias').value = resultado.dias;
}

function buildLoteSelector() {
  const sel = document.getElementById('loteSelector');
  sel.innerHTML = '';
  if(!LOTES.length) { sel.innerHTML = '<span style="color:var(--text3);font-size:12px">Nenhum lote cadastrado.</span>'; return; }
  LOTES.forEach((l,i) => {
    const b = document.createElement('button');
    b.className = 'lote-btn' + (i===0?' active':'');
    b.textContent = l.id.replace('261001','') || `Lote ${i+1}`;
    b.title = l.per;
    b.onclick = () => { document.querySelectorAll('.lote-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); renderLote(l); };
    sel.appendChild(b);
  });
}

function buildOEE() {
  const grid = document.getElementById('oeeEquipGrid');
  grid.innerHTML = '';
  const oeeLotes = LOTES.filter(l=>l.oee);

  if(!oeeLotes.length) {
    grid.innerHTML = '<div style="color:var(--text3);grid-column:1/-1;padding:20px;text-align:center">Nenhum lote com dados de OEE preenchidos.</div>';
    setChart('oeeEvol','chartOEEEvolucao',{type:'line',data:{labels:[],datasets:[]},options:{responsive:true,maintainAspectRatio:false}});
    document.getElementById('oeeHeatmap').innerHTML = '';
    return;
  }

  EQUIPAMENTOS.forEach((eq,i) => {
    const vals = oeeLotes.map(l=>l.oee[eq]);
    const med = vals.reduce((a,v)=>a+v,0)/vals.length;
    const min = Math.min(...vals); const max = Math.max(...vals);
    grid.innerHTML += `<div class="oee-equip">
      <div class="oee-equip-name">${EQ_NOMES[i]}</div>
      <div class="oee-gauge">
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="32" fill="none" stroke="#1f2640" stroke-width="8"/>
          <circle cx="40" cy="40" r="32" fill="none" stroke="${oeeColor(med)}" stroke-width="8"
            stroke-dasharray="${(med*2*Math.PI*32).toFixed(1)} ${(2*Math.PI*32).toFixed(1)}"
            stroke-linecap="round"/>
        </svg>
        <div class="oee-gauge-val" style="color:${oeeColor(med)}">${Math.round(med*100)}%</div>
      </div>
      <div style="font-size:11px;color:var(--text3)">Mín ${Math.round(min*100)}% · Máx ${Math.round(max*100)}%</div>
    </div>`;
  });

  // Gráfico evolução
  const labels = oeeLotes.map(l=>l.id.replace('261001','')||'—');
  setChart('oeeEvol','chartOEEEvolucao',{
    type:'line',
    data:{labels,datasets:[
      {label:'Rotuladora 1',data:oeeLotes.map(l=>+(l.oee.rot1*100).toFixed(1)),borderColor:clr.line1,backgroundColor:'transparent',tension:.3,pointRadius:4},
      {label:'Rotuladora 2',data:oeeLotes.map(l=>+(l.oee.rot2*100).toFixed(1)),borderColor:clr.purple,backgroundColor:'transparent',tension:.3,pointRadius:4,borderDash:[4,3]},
      {label:'Esteira',data:oeeLotes.map(l=>+(l.oee.esteira*100).toFixed(1)),borderColor:clr.green,backgroundColor:'transparent',tension:.3,pointRadius:4},
      {label:'BLA',data:oeeLotes.map(l=>+(l.oee.bla*100).toFixed(1)),borderColor:clr.amber,backgroundColor:'transparent',tension:.3,pointRadius:4,borderDash:[6,3]},
      {label:'Unitizadora',data:oeeLotes.map(l=>+(l.oee.unit*100).toFixed(1)),borderColor:clr.teal,backgroundColor:'transparent',tension:.3,pointRadius:4,borderDash:[2,2]},
      {label:'Meta 85% (Top 10% mundial)',data:oeeLotes.map(()=>85),borderColor:'rgba(34,212,150,0.6)',borderDash:[5,5],pointRadius:0,fill:false,trendSummary:{unit:'%',decimals:0,mode:'value',label:'Meta'}}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{
      legend:{
        display:true,
        labels:{
          color:clr.text, boxWidth:12, usePointStyle:true,
          generateLabels:(chart)=>{
            const base = Chart.defaults.plugins.legend.labels.generateLabels(chart);
            const bandOpts = chart.options.plugins.refBand;
            if (bandOpts && bandOpts.min!=null && bandOpts.max!=null) {
              base.push({ text:'Faixa média BR', fillStyle:bandOpts.color||'rgba(245,166,35,0.4)', strokeStyle:bandOpts.borderColor||'rgba(245,166,35,0.8)', lineWidth:1.5, hidden:bandOpts.visible===false, datasetIndex:-1 });
            }
            return base;
          }
        },
        onClick:(e,legendItem,legend)=>{
          const chart = legend.chart;
          if (legendItem.datasetIndex===-1) {
            const bandOpts = chart.options.plugins.refBand;
            bandOpts.visible = bandOpts.visible===false ? true : false;
            chart.update();
            return;
          }
          Chart.defaults.plugins.legend.onClick.call(legend,e,legendItem,legend);
        }
      },
      refBand:{min:60,max:70,visible:true,color:'rgba(245,166,35,0.14)',borderColor:'rgba(245,166,35,0.55)',label:'Média BR: 60%–70%'}
    },scales:{x:{grid:{color:clr.grid}},y:{grid:{color:clr.grid},min:30,max:95,ticks:{callback:v=>v+'%'}}}}
  });

  // Heatmap table
  const tbl = document.getElementById('oeeHeatmap');
  tbl.innerHTML = `<thead><tr><th>Lote</th><th>Período</th>${EQ_NOMES.map(e=>`<th style="text-align:center">${e}</th>`).join('')}</tr></thead>`;
  const tbody = document.createElement('tbody');
  oeeLotes.forEach(l => {
    const o = l.oee;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${l.id.replace('261001','')||'—'}</strong></td><td style="color:var(--text2);font-size:11px">${l.per||'—'}</td>` +
      EQUIPAMENTOS.map(eq => {
        const v = o[eq]; const pct = Math.round(v*100);
        const bg = v>=0.85?'rgba(34,212,150,0.15)':v>=0.70?'rgba(79,142,247,0.15)':v>=0.60?'rgba(245,166,35,0.15)':'rgba(240,64,96,0.15)';
        const fg = oeeColor(v);
        return `<td style="text-align:center;background:${bg}"><span style="color:${fg};font-weight:600">${pct}%</span></td>`;
      }).join('');
    tbody.appendChild(tr);
  });
  // Linha de média
  const trMed = document.createElement('tr');
  trMed.innerHTML = `<td style="color:var(--text2);font-style:italic" colspan="2">Média (${oeeLotes.length} lotes)</td>` +
    EQUIPAMENTOS.map(eq => {
      const med = oeeLotes.reduce((a,l)=>a+l.oee[eq],0)/oeeLotes.length;
      const pct = (med*100).toFixed(1);
      const fg = oeeColor(med);
      return `<td style="text-align:center;border-top:1px solid var(--border2)"><strong style="color:${fg}">${pct}%</strong></td>`;
    }).join('');
  tbody.appendChild(trMed);
  tbl.appendChild(tbody);
}

function buildVisaoPeriodo() {
  const GRUPOS = getGruposPeriodo();
  const nomes = GRUPOS.map(g=>g.nome);

  const kpiEl = document.getElementById('kpiPeriodo');
  kpiEl.innerHTML = '';
  if (!GRUPOS.length) {
    kpiEl.innerHTML = '<div style="color:var(--text3);grid-column:1/-1;padding:20px;text-align:center">Nenhum lote no período selecionado.</div>';
  }
  GRUPOS.forEach((g,i) => {
    const prev = i>0?GRUPOS[i-1]:null;
    const delta = (prev && prev.prod) ? ((g.prod-prev.prod)/prev.prod*100) : null;
    kpiEl.innerHTML += `
    <div class="kpi-card">
      <div class="kpi-label">${g.nome}</div>
      <div class="kpi-value">${fNum(g.prod)}</div>
      <div class="kpi-sub">${g.nLotes} lote${g.nLotes===1?'':'s'} · ${g.plan?fPct(g.prod/g.plan*100):'—'} aderência</div>
      ${delta!==null?`<div class="kpi-delta ${delta>=0?'pos':'neg'}">${delta>=0?'▲':'▼'} ${Math.abs(delta).toFixed(1)}% vs. período anterior</div>`:''}
    </div>
    <div class="kpi-card">
      <div class="kpi-label">${g.nome} — Descarte</div>
      <div class="kpi-value">${g.desc}</div>
      <div class="kpi-sub">${g.plan?fPct3(g.desc/g.plan*100):'—'} das unidades</div>
    </div>`;
  });

  setChart('periodoVol','chartPeriodoVol',{
    type:'bar',data:{labels:nomes,datasets:[
      {label:'Planejado',data:GRUPOS.map(g=>g.plan),backgroundColor:'rgba(79,142,247,0.3)',borderColor:clr.line1,borderWidth:1.5},
      {label:'Produzido',data:GRUPOS.map(g=>g.prod),backgroundColor:'rgba(34,212,150,0.3)',borderColor:clr.green,borderWidth:1.5}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:clr.grid}},y:{grid:{color:clr.grid},ticks:{callback:v=>fNum(v)}}}}
  });

  setChart('periodoDesc','chartPeriodoDesc',{
    type:'bar',data:{labels:nomes,datasets:[
      {label:'% Descarte',data:GRUPOS.map(g=>g.plan?+(g.desc/g.plan*100).toFixed(4):0),backgroundColor:GRUPOS.map(g=>{const p=g.plan?g.desc/g.plan*100:0;return p>0.05?'rgba(245,166,35,0.4)':'rgba(34,212,150,0.35)';}),borderColor:GRUPOS.map(g=>{const p=g.plan?g.desc/g.plan*100:0;return p>0.05?clr.amber:clr.green;}),borderWidth:1.5}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:clr.grid}},y:{grid:{color:clr.grid},ticks:{callback:v=>v.toFixed(3)+'%'}}}}
  });

  setChart('periodoTempo','chartPeriodoTempo',{
    type:'bar',data:{labels:nomes,datasets:[
      {label:'T.Est médio (h)',data:GRUPOS.map(g=>+g.tEstMedio.toFixed(1)),backgroundColor:'rgba(79,142,247,0.25)',borderColor:clr.line1,borderWidth:1.5},
      {label:'T.Real E4adj médio (h)',data:GRUPOS.map(g=>+g.tRealMedio.toFixed(1)),backgroundColor:'rgba(155,107,255,0.3)',borderColor:clr.purple,borderWidth:1.5}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:clr.grid}},y:{grid:{color:clr.grid}}}}
  });

  const oeeData = GRUPOS.map(g=>g.oeeMedia!==null && g.oeeMedia!==undefined ? +(g.oeeMedia*100).toFixed(1) : null);
  setChart('periodoOEE','chartPeriodoOEE',{
    type:'line',data:{labels:nomes,datasets:[
      {label:'OEE médio',data:oeeData,borderColor:clr.line2,backgroundColor:'rgba(34,212,150,0.08)',fill:true,tension:.3,pointRadius:5,pointBackgroundColor:oeeData.map(v=>v!==null?oeeColor2(v/100):clr.line2),spanGaps:true},
      {label:'Meta 85%',data:nomes.map(()=>85),borderColor:'rgba(245,166,35,0.6)',borderDash:[5,5],pointRadius:0,fill:false}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:clr.grid}},y:{grid:{color:clr.grid},min:0,max:100,ticks:{callback:v=>v+'%'}}}}
  });

  const tbody = document.getElementById('periodoTable');
  tbody.innerHTML = '';
  GRUPOS.forEach(g => {
    const descPct = g.plan ? g.desc/g.plan*100 : 0;
    const ader = g.plan ? g.prod/g.plan*100 : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${g.nome}</strong></td>
      <td style="color:var(--text2);font-size:11px">${g.lotes.map(l=>l.id.replace('261001','')||'—').join(', ')}</td>
      <td style="text-align:center">${g.nLotes}</td>
      <td style="text-align:right">${fNum(g.plan)}</td>
      <td style="text-align:right">${fNum(g.prod)}</td>
      <td style="text-align:right"><span class="badge ${ader>=100?'green':'amber'}">${fPct(ader)}</span></td>
      <td style="text-align:right">${g.desc}</td>
      <td style="text-align:right"><span class="badge ${descPct<0.05?'green':'amber'}">${fPct3(descPct)}</span></td>
      <td style="text-align:center">${fH(g.tRealMedio)}</td>
      <td style="text-align:center">${g.oeeMedia!==null && g.oeeMedia!==undefined ? `<span class="badge ${g.oeeMedia>=0.85?'green':g.oeeMedia>=0.70?'blue':g.oeeMedia>=0.60?'amber':'red'}">${fPct(g.oeeMedia*100)}</span>` : '<span style="color:var(--text3)">N/D</span>'}`;
    tbody.appendChild(tr);
  });
}

function calcularMedia(valores) {
  const validos = valores.filter(v => v !== null && !isNaN(v));
  if (!validos.length) return valores.map(() => null);
  const media = validos.reduce((a, b) => a + b, 0) / validos.length;
  return valores.map(() => +media.toFixed(4));
}

function calcularTendencia(valores) {
  const n = valores.length;
  if (n === 0) return [];
  const temValidos = valores.some(v => v !== null && !isNaN(v));
  if (!temValidos) return valores.map(() => null);
  const janela = Math.max(2, Math.min(5, Math.round(n * 0.25))); // ~25% dos pontos, entre 2 e 5
  const raio = Math.floor(janela / 2);
  return valores.map((_, i) => {
    const ini = Math.max(0, i - raio);
    const fim = Math.min(n - 1, i + raio);
    const vizinhos = [];
    for (let k = ini; k <= fim; k++) {
      if (valores[k] !== null && !isNaN(valores[k])) vizinhos.push(valores[k]);
    }
    if (!vizinhos.length) return null;
    return +(vizinhos.reduce((a, b) => a + b, 0) / vizinhos.length).toFixed(4);
  });
}

async function carregarDadosFallback() {
  try {
    const resp = await fetch('dados-fallback.json', { cache: 'no-cache' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const pacote = await resp.json();
    const lista = Array.isArray(pacote) ? pacote : (pacote && pacote.lotes);
    if (Array.isArray(lista) && lista.length) {
      LOTES = lista;
      return { carregou: true, geradoEm: (pacote && (pacote.geradoEm || pacote.exportadoEm)) || null };
    }
  } catch (e) {
    console.warn('Dados de reserva (dados-fallback.json) indisponíveis:', e);
  }
  return { carregou: false, geradoEm: null };
}

function compCustomMesChange(qual) {
  popularDias(qual === 'de' ? 'compDeDia' : 'compAteDia', qual === 'de' ? 'compDeMes' : 'compAteMes', qual === 'de' ? 'compDeAno' : 'compAteAno');
}

function compFiltroConcClick(el) {
  document.querySelectorAll('#compFiltroConc .lote-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  compFiltroConc = el.dataset.conc;
  buildComparativo();
}

function construirPlotInsumo(itensFiltrados, ins) {
  if (descGranularidade === 'lote') {
    return itensFiltrados.map(({ d, l }) => {
      const planMed = l ? l.plan : null;
      const qtd = d[ins.key] ?? null;
      const planejadoInsumo = planMed ? planMed * ins.prop : null;
      const pct = (planejadoInsumo && qtd !== null) ? (qtd / planejadoInsumo * 100) : null;
      return { label: d.lote.replace('261001', ''), pct, qtd, nLotes: 1 };
    });
  }
  const grupos = {};
  itensFiltrados.forEach(({ d, l }) => {
    if (!l) return; // sem lote correspondente — sem data conhecida, não é possível agrupar por período
    const g = grupoDoLote(l, descGranularidade);
    if (!g || !g.key) return;
    if (!grupos[g.key]) grupos[g.key] = { label: g.label, order: g.order, descartado: 0, planejado: 0, nLotes: 0 };
    const qtd = d[ins.key] ?? null;
    if (qtd !== null && l.plan) {
      grupos[g.key].descartado += qtd;
      grupos[g.key].planejado += l.plan * ins.prop;
      grupos[g.key].nLotes++;
    }
  });
  return Object.values(grupos).sort((a, b) => a.order - b.order).map(g => ({
    label: g.label,
    pct: g.planejado > 0 ? (g.descartado / g.planejado * 100) : null,
    qtd: g.nLotes ? g.descartado : null,
    nLotes: g.nLotes
  }));
}

function customMesChange(qual) {
  popularDias(qual==='de'?'cDeDia':'cAteDia', qual==='de'?'cDeMes':'cAteMes', qual==='de'?'cDeAno':'cAteAno');
}

function descCustomMesChange(qual) {
  popularDias(qual === 'de' ? 'descDeDia' : 'descAteDia', qual === 'de' ? 'descDeMes' : 'descAteMes', qual === 'de' ? 'descDeAno' : 'descAteAno');
}

function descFiltroClick(el) {
  document.querySelectorAll('#descFiltroConc .lote-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  descFiltroConc = el.dataset.conc;
  buildDescarte();
}

function diasNoMes(mesIdx, ano) {
  if (mesIdx === 1) return (ano%4===0&&(ano%100!==0||ano%400===0)) ? 29 : 28;
  return DIAS_POR_MES[mesIdx];
}

function esconderSkeletonLoading() {
  const el = document.getElementById('skeletonOverlay');
  if (!el) return;
  el.classList.add('skel-escondido');
  setTimeout(() => el.remove(), 400);
}

function exportarChartCSV(chartKey, nomeArquivo) {
  const chart = CHARTS[chartKey];
  if (!chart || !chart.data) return;
  const labels = chart.data.labels || [];
  const datasets = chart.data.datasets || [];
  if (!labels.length || !datasets.length) return;
  const cab = ['Rótulo', ...datasets.map(ds => ds.label || 'Série')];
  const linhas = [cab];
  labels.forEach((lab, i) => {
    const linha = [lab];
    datasets.forEach(ds => {
      const v = ds.data ? ds.data[i] : null;
      if (v === null || v === undefined) linha.push('');
      else if (typeof v === 'number') linha.push(v.toFixed(4).replace(/\.?0+$/, '').replace('.', ',') || '0');
      else linha.push(String(v));
    });
    linhas.push(linha);
  });
  const csv = linhas.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (nomeArquivo || chartKey) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (typeof showToast === 'function') showToast('💾 CSV exportado');
}

function exportarDescarteCSV(key) {
  const item = DESCARTE_CACHE[key];
  const ins = INSUMOS_META.find(m => m.key === key);
  if (!item || !ins) return;
  const cab = descGranularidade === 'lote'
    ? ['Lote', '% Descarte', 'Qtd. descartada']
    : ['Período', '% Descarte', 'Qtd. descartada', 'Nº de lotes'];
  const linhas = [cab];
  item.plot.forEach(p => {
    const linha = [p.label, p.pct !== null ? p.pct.toFixed(4).replace('.', ',') : '', p.qtd ?? ''];
    if (descGranularidade !== 'lote') linha.push(p.nLotes ?? '');
    linhas.push(linha);
  });
  const csv = linhas.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `descarte_${key}_${descGranularidade}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('💾 CSV exportado: ' + ins.label);
}

function exportarKitLotesCSV() {
  if (!KIT_LOTES.length) return;
  const cab = ['Lote', 'Período', 'Mês', 'Trimestre', 'Dias', 'Planejado', 'Produzido', 'PNP (h)', 'Desv. Abertos'];
  const linhas = [cab, ...KIT_LOTES.map(l => [
    l.id || '', l.per || '', l.mes || '', l.q || '', l.dias ?? '',
    l.plan ?? '', l.prod ?? '',
    l.pnp !== null && l.pnp !== undefined ? l.pnp : '', l.desvAb ?? ''
  ])];
  const csv = linhas.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kit_medico_lotes.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (typeof showToast === 'function') showToast('💾 CSV exportado');
}

function fecharZoomChart() {
  const modal = document.getElementById('chartZoomModal');
  if (modal) modal.style.display = 'none';
  if (zoomChartInstance) { zoomChartInstance.destroy(); zoomChartInstance = null; }
}

function filtrarLotesPorIntervalo(de, ate) {
  return LOTES.filter(l => {
    if (compFiltroConc !== 'all' && (l.conc || '') !== compFiltroConc) return false;
    const r = perToDateRange(l.per, anoDoMes(l.mes));
    if (!r) {
      const idx = MES_ORDER.indexOf(l.mes);
      const iDe = de.getMonth() + (de.getFullYear() - ANO_MIN) * 12;
      const iAte = ate.getMonth() + (ate.getFullYear() - ANO_MIN) * 12;
      return idx >= iDe && idx <= iAte;
    }
    return r.inicio <= ate && r.fim >= de;
  }).sort((a, b) => {
    const ra = perToDateRange(a.per, anoDoMes(a.mes)), rb = perToDateRange(b.per, anoDoMes(b.mes));
    if (ra && rb) return ra.inicio - rb.inicio;
    if (ra) return -1;
    if (rb) return 1;
    return 0;
  });
}

function gerarMesOrder(anoMin, anoMax) {
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const arr = [];
  for (let a = anoMin; a <= anoMax; a++) {
    nomes.forEach(m => arr.push(m + '/' + String(a).slice(-2)));
  }
  return arr;
}

function gerarSparklineSVG(valores, corPonto) {
  const w = 64, h = 22, pad = 3;
  const vals = valores.filter(v => v !== null && v !== undefined && !isNaN(v));
  if (vals.length < 2) return '<span style="color:var(--text3);font-size:10px">—</span>';
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = (max - min) || 1;
  const n = valores.length;
  const pontos = valores.map((v, i) => {
    const x = pad + (n === 1 ? 0 : (i / (n - 1)) * (w - 2 * pad));
    const y = (v === null || v === undefined || isNaN(v)) ? null : h - pad - ((v - min) / range) * (h - 2 * pad);
    return { x, y };
  });
  const segmentos = [];
  let atual = [];
  pontos.forEach(p => {
    if (p.y === null) { if (atual.length > 1) segmentos.push(atual); atual = []; }
    else atual.push(p);
  });
  if (atual.length > 1) segmentos.push(atual);
  const linhas = segmentos.map(seg => `<polyline points="${seg.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="#9b6bff" stroke-width="1.5"/>`).join('');
  const ultimoValido = [...pontos].reverse().find(p => p.y !== null);
  const dot = ultimoValido ? `<circle cx="${ultimoValido.x.toFixed(1)}" cy="${ultimoValido.y.toFixed(1)}" r="2.2" fill="${corPonto}"/>` : '';
  return `<svg width="${w}" height="${h}" style="display:block;overflow:visible">${linhas}${dot}</svg>`;
}

function getDataCustom(prefixo) {
  const dia  = +document.getElementById(prefixo+'Dia').value  || 1;
  const mes  = +document.getElementById(prefixo+'Mes').value;  // 0-based
  const ano  = +document.getElementById(prefixo+'Ano').value  || BASE_YEAR;
  return new Date(ano, mes, dia);
}

function getGruposPeriodo() {
  if (visaoPeriodoTipo === 'trimestral') return getQuartis();
  if (visaoPeriodoTipo === 'semestral')  return getSemestres();
  if (visaoPeriodoTipo === 'personalizado') {
    const de  = getDataCustom('cDe');
    const ate = getDataCustom('cAte');
    if (de > ate) return [];
    // Agrupa os lotes filtrados por mês (mantém granularidade mensal)
    const filtrados = lotesNoPeriodoData(de, ate);
    const groups = {};
    filtrados.forEach(l => { (groups[l.mes] = groups[l.mes] || []).push(l); });
    return Object.keys(groups)
      .sort((a,b)=>MES_ORDER.indexOf(a)-MES_ORDER.indexOf(b))
      .map(mes => agregarGrupo(mes, groups[mes]));
  }
  return getMeses();
}

function getMeses() {
  const groups = {};
  LOTES.forEach(l => { (groups[l.mes] = groups[l.mes] || []).push(l); });
  return Object.keys(groups).sort((a,b) => {
    const ia = MES_ORDER.indexOf(a), ib = MES_ORDER.indexOf(b);
    return (ia===-1?999:ia) - (ib===-1?999:ib);
  }).map(mes => agregarGrupo(mes, groups[mes]));
}

function getPersonalizado(mesDe, mesAte) {
  const iDe = MES_ORDER.indexOf(mesDe), iAte = MES_ORDER.indexOf(mesAte);
  if (iDe === -1 || iAte === -1 || iDe > iAte) return [];
  const groups = {};
  LOTES.forEach(l => {
    const idx = MES_ORDER.indexOf(l.mes);
    if (idx < iDe || idx > iAte) return;
    (groups[l.mes] = groups[l.mes] || []).push(l);
  });
  return Object.keys(groups).sort((a,b)=>MES_ORDER.indexOf(a)-MES_ORDER.indexOf(b))
    .map(mes => agregarGrupo(mes, groups[mes]));
}

function grupoDoLote(l, granularidade) {
  if (granularidade === 'mensal') {
    return { key: l.mes, label: l.mes, order: MES_ORDER.indexOf(l.mes) };
  }
  const ano = anoDoMes(l.mes);
  if (granularidade === 'trimestral') {
    // Chave inclui o ano para não misturar, por exemplo, Q1 de 2026 com Q1 de 2027
    return { key: l.q + '-' + ano, label: (Q_NOMES[l.q] || l.q) + ' ' + ano, order: ano*10 + Q_ORDER.indexOf(l.q) };
  }
  if (granularidade === 'semestral') {
    const s = semestreDoMes(l.mes);
    return { key: s + '-' + ano, label: (S_NOMES[s] || s) + ' ' + ano, order: ano*10 + S_ORDER.indexOf(s) };
  }
  return null;
}

function indiceMes(abrev) {
  return MES_ABREV.indexOf(abrev.toLowerCase().trim().slice(0,3));
}

function oeeClass(v) { if(v===undefined||v===null) return ''; if(v>=0.85) return 'good'; if(v>=0.60) return 'warn'; return 'bad'; }

function oeeColor(v) {
  // Escala calibrada por referências de mercado: <60% abaixo da média BR,
  // 60–70% média das farmacêuticas no Brasil, 70–85% acima da média BR,
  // ≥85% patamar mundial (top 10% das farmacêuticas globalmente).
  if (v >= 0.85) return clr.green;
  if (v >= 0.70) return clr.line1;
  if (v >= 0.60) return clr.amber;
  return clr.red;
}

function oeeColor2(v01) { return oeeColor(v01); }

function oeeMedioLote(oee) {
  if (!oee) return null;
  const vals = [oee.rot1, oee.rot2, oee.esteira, oee.bla, oee.unit].filter(v => v !== null && v !== undefined);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function perToDateRange(per, anoRef) {
  const ano = anoRef || BASE_YEAR;
  const p = parsePeriodo(per);
  if (!p) return null;
  const s = per.trim().replace(/–/g,'-');
  let m = s.match(/^(\d{1,2})\/([a-zA-Z]{3,})-(\d{1,2})\/([a-zA-Z]{3,})$/);
  let d1, mi1, d2, mi2, ano2;
  if (m) {
    d1=+m[1]; mi1=indiceMes(m[2]); d2=+m[3]; mi2=indiceMes(m[4]);
  } else {
    m = s.match(/^(\d{1,2})-(\d{1,2})\/([a-zA-Z]{3,})$/);
    if (!m) return null;
    d1=+m[1]; d2=+m[2]; mi1=mi2=indiceMes(m[3]);
  }
  ano2 = mi2 < mi1 ? ano+1 : ano;
  return { inicio: new Date(ano, mi1, d1), fim: new Date(ano2, mi2, d2) };
}

function periodoAnterior(de, ate) {
  const duracaoMs = ate.getTime() - de.getTime();
  const anteAte = new Date(de.getTime() - 24 * 60 * 60 * 1000);
  const anteDe = new Date(anteAte.getTime() - duracaoMs);
  return { de: anteDe, ate: anteAte };
}

function popularDias(diaSelId, mesSelId, anoSelId) {
  const diaEl = document.getElementById(diaSelId);
  const mesEl = document.getElementById(mesSelId);
  const anoEl = document.getElementById(anoSelId);
  if (!diaEl || !mesEl || !anoEl) return;
  const mesIdx = +mesEl.value;
  const ano = +anoEl.value;
  const nDias = diasNoMes(mesIdx, ano);
  const antDia = +diaEl.value || 1;
  diaEl.innerHTML = Array.from({length:nDias},(_,i)=>`<option value="${i+1}">${String(i+1).padStart(2,'0')}</option>`).join('');
  diaEl.value = Math.min(antDia, nDias);
}

function rebuildDashboard() {
  sortLotesCronologico();
  buildLoteSelector();
  renderLote(LOTES[0]);
  updateNavBadge();
  atualizarBadgePendentes();
  atualizarRotulosAno();

  const activeSection = document.querySelector('.section.active')?.id;
  if(activeSection==='sec-comparativo') buildComparativo();
  if(activeSection==='sec-periodo') buildVisaoPeriodo();
  if(activeSection==='sec-oee') buildOEE();
  if(activeSection==='sec-descarte') buildDescarte();

  showToast();
}

function renderKpiDelta(elId, atual, anterior, favoravel) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (anterior === null || anterior === undefined || atual === null) {
    el.textContent = 'sem dado do período anterior';
    el.className = 'kpi-delta neutral';
    return;
  }
  if (anterior === 0) {
    el.textContent = atual === 0 ? '► estável vs. período anterior' : '▲ novo (período anterior sem dado)';
    el.className = 'kpi-delta neutral';
    return;
  }
  const variacaoPct = ((atual - anterior) / Math.abs(anterior)) * 100;
  if (Math.abs(variacaoPct) < 0.05) {
    el.textContent = '► estável vs. período anterior';
    el.className = 'kpi-delta neutral';
    return;
  }
  const subiu = variacaoPct > 0;
  const seta = subiu ? '▲' : '▼';
  const favoravelResultado = favoravel === 'alta' ? subiu : !subiu;
  el.className = 'kpi-delta ' + (favoravelResultado ? 'pos' : 'neg');
  el.textContent = `${seta} ${Math.abs(variacaoPct).toFixed(1).replace('.', ',')}% vs. período anterior`;
}

function setChart(key, canvasId, config) {
  if(CHARTS[key]) { CHARTS[key].destroy(); delete CHARTS[key]; }
  const el = document.getElementById(canvasId);
  if(!el) return;
  CHARTS[key] = new Chart(el, config);
  CHART_CONFIGS[key] = config;
  el.style.cursor = 'zoom-in';
  el.title = 'Clique para ampliar';
  el.onclick = () => abrirZoomChart(key, el);
}

function setCompGranularidade(tipo, el) {
  compGranularidade = tipo;
  document.querySelectorAll('#compGranSelector .lote-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  buildComparativo();
}

function setDescGranularidade(tipo, el) {
  descGranularidade = tipo;
  document.querySelectorAll('#descGranSelector .lote-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  buildDescarte();
}

function setTipoPeriodo(tipo, el) {
  visaoPeriodoTipo = tipo;
  document.querySelectorAll('#periodoTipoSelector .lote-btn').forEach(b=>b.classList.remove('active'));
  if (el) el.classList.add('active');
  const cr = document.getElementById('periodoCustomRange');
  cr.style.display = tipo === 'personalizado' ? 'flex' : 'none';
  if (tipo === 'personalizado') inicializarCustomRange();
  buildVisaoPeriodo();
}

function showToast(mensagem) {
  const t = document.getElementById('toast');
  if (mensagem) t.textContent = mensagem;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=>t.classList.remove('show'), 2600);
}

function sortKitLotesCronologico() {
  KIT_LOTES.sort((a, b) => {
    const ra = perToDateRange(a.per, anoDoMes(a.mes)), rb = perToDateRange(b.per, anoDoMes(b.mes));
    if (ra && rb) return ra.inicio - rb.inicio;
    if (ra) return -1;
    if (rb) return 1;
    return 0;
  });
}

function sortLotesCronologico() {
  LOTES.sort((a, b) => {
    const ra = perToDateRange(a.per, anoDoMes(a.mes)), rb = perToDateRange(b.per, anoDoMes(b.mes));
    if (ra && rb) return ra.inicio - rb.inicio;
    if (ra) return -1;
    if (rb) return 1;
    return 0;
  });
}

function textoStatusFallback(fb) {
  if (!fb.carregou) return 'sem dados (offline)';
  const d = fb.geradoEm ? new Date(fb.geradoEm) : null;
  return (d && !isNaN(d)) ? 'dados offline de ' + d.toLocaleDateString('pt-BR') : 'dados offline';
}

function toggleAlertasFaixa() {
  alertasFaixaVisivel = !alertasFaixaVisivel;
  aplicarEstadoAlertasFaixa();
}

function toggleDiasRow(btn) {
  // data-target no botão "▼ Dias" já aponta para uid + '_dias'
  const targetId = btn.dataset.target;
  const trDias = targetId ? document.getElementById(targetId) : null;
  if (!trDias) return;
  const open = trDias.classList.toggle('open');
  btn.textContent = (open ? '▲' : '▼') + ' Dias';
}

function toggleInsRow(btn) {
  const id = btn.dataset.target;
  const row = document.getElementById(id);
  if (!row) return;
  const open = row.classList.toggle('open');
  btn.textContent = (open ? '▲' : '▼') + ' Insumos';
}

function updateNavBadge() {
  const totalProd = LOTES.reduce((a,l)=>a+l.prod,0);
  const meses = getMeses();
  const range = meses.length ? `${meses[0].nome}–${meses[meses.length-1].nome}` : '—';
  document.getElementById('navBadge').textContent = `${range} · ${LOTES.length} lote${LOTES.length===1?'':'s'} · ${fNum(totalProd)} un.`;
}
