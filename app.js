/* ============================================================
   K3 Investimentos — Painel de Performance
   Fonte: Google Sheets publicado (CSV export por aba/gid)
   ============================================================ */

const SHEET_KEY = "2PACX-1vS_nh83QnSTkoyrf8utSgJaYLet2rbixbZw7wMMnFtyefFNOAquXH5UkW-Hu2cN7EzQgOGYCGnGSKI8";
const BASE_URL = `https://docs.google.com/spreadsheets/d/e/${SHEET_KEY}/pub`;

const GIDS = {
  consolidado: "0",
  datas: "287555750",
  metasAssessor: "1776920911",
};

const REFRESH_MS = 5 * 60 * 1000; // 5 minutos

const MESES_PT = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const MESES_NOME = { 1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril", 5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto", 9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro" };

/* K3 Investimentos — cores oficiais do Manual de Identidade Visual */
const AZUL = "#1e2d54";
const DOURADO = "#d1a771";

let charts = {};

if (window.ChartDataLabels) Chart.register(window.ChartDataLabels);
Chart.defaults.color = AZUL;
Chart.defaults.font.family = "Segoe UI, Inter, Roboto, Arial, sans-serif";

/* ---------------- CSV fetch & parse ---------------- */

async function fetchCsv(gid) {
  const url = `${BASE_URL}?gid=${gid}&single=true&output=csv&_=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Falha ao buscar dados (gid ${gid}): HTTP ${res.status}`);
  const text = await res.text();
  return parseCsvToObjects(text);
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}

function parseCsvToObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = (r[i] ?? "").trim()));
    return obj;
  });
}

function toNum(v) {
  if (v == null) return 0;
  const s = String(v).trim();
  if (s === "" || s === "#N/D" || s === "#N/A" || s === "#DIV/0!") return 0;
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function sumBy(rows, key) {
  return rows.reduce((acc, r) => acc + toNum(r[key]), 0);
}

function avgBy(rows, key) {
  const vals = rows.map((r) => toNum(r[key]));
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/* ---------------- Month helpers ---------------- */

function monthKey(label) {
  const m = String(label).trim().match(/^([a-zç]{3})\.?\/(\d{2,4})/i);
  if (!m) return -1;
  const mon = MESES_PT[m[1].toLowerCase()];
  let yr = parseInt(m[2], 10);
  if (yr < 100) yr += 2000;
  return yr * 100 + (mon || 0);
}

function currentMonthLabel(rows) {
  let best = null, bestKey = -1;
  for (const r of rows) {
    const k = monthKey(r["Mês"]);
    if (k > bestKey) { bestKey = k; best = r["Mês"]; }
  }
  return best;
}

function monthDisplayName(label) {
  const m = String(label).trim().match(/^([a-zç]{3})\.?\/(\d{2,4})/i);
  if (!m) return label;
  const mon = MESES_PT[m[1].toLowerCase()];
  let yr = m[2].length === 2 ? "20" + m[2] : m[2];
  return `${MESES_NOME[mon] || m[1]} / ${yr}`;
}

/* ---------------- Formatting ---------------- */

const fmtInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const fmtCompact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const fmtPct = (v) => `${v >= 0 ? "" : "-"}${Math.abs(v).toFixed(0)}%`;

function fmtMoney(v) {
  const sign = v < 0 ? "-" : "";
  return `${sign}R$ ${fmtCompact.format(Math.abs(v))}`;
}

function fmtMoneyFull(v) {
  return `R$ ${fmtInt.format(v)}`;
}

function fmtNum(v) {
  return fmtInt.format(v);
}

function pct(real, meta) {
  if (!meta) return real > 0 ? 100 : 0;
  return (real / meta) * 100;
}

function deltaBadge(real, meta, invert = false) {
  if (!meta && meta !== 0) return "";
  const diff = real - meta;
  const good = invert ? diff <= 0 : diff >= 0;
  const cls = good ? "pos" : "neg";
  const arrow = good ? "▲" : "▼";
  const sign = diff >= 0 ? "+" : "";
  return `<span class="badge ${cls}">${arrow} ${sign}${fmtCompact.format(diff)} vs meta</span>`;
}

/* ---------------- Card builders ---------------- */

function bigNumberCard({ label, value, valueStr, meta, metaStr, updated, invert = false, extraBadge = "", note = "" }) {
  const hasMeta = meta !== undefined && meta !== null;
  // For "invert" metrics (lower is better, e.g. Ruptura) a meta of 0 makes a realizado/meta
  // ratio meaningless, so the progress bar is skipped and only the delta badge is shown.
  const showBar = hasMeta && !(invert && meta === 0);
  const percent = showBar ? pct(value, meta) : null;
  const barWidth = showBar ? Math.max(0, Math.min(150, percent)) : 0;
  const badge = hasMeta ? deltaBadge(value, meta, invert) : extraBadge;
  return `
    <div class="card">
      ${updated ? `<div class="updated">atualizado ${updated}</div>` : ""}
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${valueStr}</div>
      <div class="kpi-meta-row">
        ${hasMeta ? `<span>Meta: <strong style="color:var(--text)">${metaStr}</strong></span>` : ""}
        ${badge}
      </div>
      ${note ? `<div class="kpi-meta-row" style="margin-top:0.2rem;">${note}</div>` : ""}
      ${showBar ? `
        <div class="progress-track"><div class="progress-fill" style="width:${Math.min(100, barWidth)}%"></div></div>
        <div class="kpi-meta-row" style="margin-top:0.3rem;">${fmtPct(percent)} da meta atingido</div>
      ` : ""}
    </div>`;
}

function simpleNumberCard({ label, valueStr, sub = "", updated }) {
  return `
    <div class="card">
      ${updated ? `<div class="updated">atualizado ${updated}</div>` : ""}
      <div class="kpi-label">${label}</div>
      <div class="kpi-value small">${valueStr}</div>
      ${sub ? `<div class="kpi-meta-row">${sub}</div>` : ""}
    </div>`;
}

/* ---------------- Main load ---------------- */

async function loadDashboard() {
  const errorBanner = document.getElementById("errorBanner");
  errorBanner.innerHTML = "";
  try {
    const [consolidado, datas, metasAssessor] = await Promise.all([
      fetchCsv(GIDS.consolidado),
      fetchCsv(GIDS.datas),
      fetchCsv(GIDS.metasAssessor),
    ]);

    const dateMap = {};
    datas.forEach((r) => { dateMap[r["Coluna"]] = r["Data Atualização"]; });

    const monthLabel = currentMonthLabel(consolidado);
    const rows = consolidado.filter((r) => r["Mês"] === monthLabel);

    document.getElementById("monthPill").textContent = monthDisplayName(monthLabel);
    document.getElementById("dateLabel").textContent = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

    renderCaptacao(rows, metasAssessor, dateMap);
    renderKpis(rows, metasAssessor, dateMap);

    document.getElementById("footerRight").textContent = `Última sincronização: ${new Date().toLocaleTimeString("pt-BR")}`;
  } catch (err) {
    console.error(err);
    errorBanner.innerHTML = `<div class="error-banner">Não foi possível carregar os dados da planilha agora. Tentando novamente automaticamente. (${err.message})</div>`;
  } finally {
    document.getElementById("loadingOverlay").style.opacity = "0";
    setTimeout(() => (document.getElementById("loadingOverlay").style.display = "none"), 400);
  }
}

/* ---------------- View: Captação ---------------- */

function renderCaptacao(rows, metasAssessor, dateMap) {
  const capTotal = sumBy(rows, "Cap. Liq. Total");
  const capPF = sumBy(rows, "Captação PF");
  const capPJ = sumBy(rows, "Captação PJ");
  const pmeMiddle = sumBy(rows, "Cap. Onshore PME Middle");
  const corporate = sumBy(rows, "Cap. Onshore Corporate");

  const metaPF = sumBy(metasAssessor, "Meta Cap Liquida PF");
  const metaPJ = sumBy(metasAssessor, "Meta Cap Liquida PJ");
  const metaTotal = sumBy(metasAssessor, "Meta Cap Liquida Total");

  const updated = dateMap["Cap. Liq. Total"] || "";

  document.getElementById("capBigNumbers").innerHTML = [
    bigNumberCard({ label: "Captação Líquida Total", value: capTotal, valueStr: fmtMoney(capTotal), meta: metaTotal, metaStr: fmtMoney(metaTotal), updated }),
    bigNumberCard({ label: "Captação Líquida PF", value: capPF, valueStr: fmtMoney(capPF), meta: metaPF, metaStr: fmtMoney(metaPF), updated }),
    bigNumberCard({ label: "Captação Líquida PJ", value: capPJ, valueStr: fmtMoney(capPJ), meta: metaPJ, metaStr: fmtMoney(metaPJ), updated }),
  ].join("");

  // Ranking Top 10
  const ranked = rows
    .map((r) => ({ nome: r["Nome Assessor"], equipe: r["Equipe"], valor: toNum(r["Cap. Liq. Total"]) }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  document.getElementById("rankingList").innerHTML = ranked
    .map((r, i) => {
      const rankCls = i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : "";
      return `
      <div class="ranking-row">
        <div class="rank-num ${rankCls}">${i + 1}</div>
        <div>
          <div class="rank-name">${r.nome}</div>
          <div class="rank-team">${r.equipe}</div>
        </div>
        <div class="rank-value">${fmtMoney(r.valor)}</div>
      </div>`;
    })
    .join("");

  // Chart: PF vs PJ (barras — valores podem ser negativos, então rosca fica deturpada)
  renderChart("chartPfPj", "bar", {
    labels: ["PF", "PJ"],
    datasets: [{ data: [capPF, capPJ], backgroundColor: [AZUL, DOURADO], borderRadius: 8 }],
  }, {
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` ${fmtMoneyFull(ctx.raw)}` } },
      datalabels: {
        color: AZUL,
        font: { weight: "700", size: 13 },
        anchor: "end",
        align: (ctx) => (ctx.dataset.data[ctx.dataIndex] < 0 ? "bottom" : "top"),
        formatter: (v) => fmtMoney(v),
      },
    },
    scales: {
      y: { ticks: { color: "#6b7490", callback: (v) => fmtCompact.format(v) }, grid: { color: "#eef0f6" } },
      x: { ticks: { color: AZUL, font: { weight: "700" } }, grid: { display: false } },
    },
  });

  // Chart: PME/Middle vs Corporate
  renderChart("chartPjSplit", "bar", {
    labels: ["PME/Middle", "Corporate"],
    datasets: [{ data: [pmeMiddle, corporate], backgroundColor: [AZUL, DOURADO], borderRadius: 8 }],
  }, {
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` ${fmtMoneyFull(ctx.raw)}` } },
      datalabels: {
        color: AZUL,
        font: { weight: "700", size: 13 },
        anchor: "end",
        align: (ctx) => (ctx.dataset.data[ctx.dataIndex] < 0 ? "bottom" : "top"),
        formatter: (v) => fmtMoney(v),
      },
    },
    scales: {
      y: { ticks: { color: "#6b7490", callback: (v) => fmtCompact.format(v) }, grid: { color: "#eef0f6" } },
      x: { ticks: { color: AZUL, font: { weight: "700" } }, grid: { display: false } },
    },
  });
}

/* ---------------- View: KPIs ---------------- */

function renderKpis(rows, metasAssessor, dateMap) {
  /* ---- Cross Sell: Seguros + Consórcio ---- */
  const r1 = sumBy(rows, "R1 Seguros");
  const r2 = sumBy(rows, "R2 Seguros");
  const metaR1 = sumBy(metasAssessor, "Meta R1 Seguros");
  const metaR2 = sumBy(metasAssessor, "Meta R2 Seguros");
  const apoliceAndamento = sumBy(rows, "Apolice em Andamento");
  const apoliceEmitida = sumBy(rows, "Apolice Emitida");
  const metaPA = sumBy(metasAssessor, "Meta PA Seguros");
  const updSeguros = dateMap["R1 Seguros"] || "";

  const reunioesConsorcio = sumBy(rows, "Reuniões Consórcio");
  const fechamentoConsorcio = sumBy(rows, "Fechamento Consórcio");
  const metaConsorcio = sumBy(metasAssessor, "Meta Consórcio");
  const updConsorcio = dateMap["Reuniões Consórcio"] || "";

  document.getElementById("crossSellBigNumbers").innerHTML = [
    bigNumberCard({
      label: "Reuniões de Seguros (R1 + R2)",
      value: r1 + r2, valueStr: fmtNum(r1 + r2),
      meta: metaR1 + metaR2, metaStr: fmtNum(metaR1 + metaR2),
      updated: updSeguros,
      note: `R1: <strong style="color:var(--text)">${fmtNum(r1)}</strong> · R2: <strong style="color:var(--text)">${fmtNum(r2)}</strong>`,
    }),
    bigNumberCard({ label: "Apólices Emitidas (P.A.)", value: apoliceEmitida, valueStr: fmtMoney(apoliceEmitida), meta: metaPA, metaStr: fmtMoney(metaPA), updated: updSeguros }),
    simpleNumberCard({ label: "Apólices em Andamento", valueStr: fmtMoney(apoliceAndamento), sub: "Projeção de fechamento", updated: updSeguros }),
    simpleNumberCard({ label: "Reuniões de Consórcio", valueStr: fmtNum(reunioesConsorcio), updated: updConsorcio }),
    bigNumberCard({ label: "Fechamentos de Consórcio", value: fechamentoConsorcio, valueStr: fmtMoney(fechamentoConsorcio), meta: metaConsorcio, metaStr: fmtMoney(metaConsorcio), updated: updConsorcio }),
  ].join("");

  /* ---- Ativações 300k+ ---- */
  const ativPF = sumBy(rows, "Ativação PF 300k+");
  const ativPJ = sumBy(rows, "Ativação PJ 300k+");
  const metaAtivPF = sumBy(metasAssessor, "Meta Ativação PF 300K +");
  const metaAtivPJ = sumBy(metasAssessor, "Meta Ativação PJ 300K +");
  const updAtivacao = dateMap["Ativação PF 300k+"] || "";

  document.getElementById("ativacaoBigNumbers").innerHTML = [
    bigNumberCard({ label: "Ativações 300k+ PF", value: ativPF, valueStr: fmtNum(ativPF), meta: metaAtivPF, metaStr: fmtNum(metaAtivPF), updated: updAtivacao }),
    bigNumberCard({ label: "Ativações 300k+ PJ", value: ativPJ, valueStr: fmtNum(ativPJ), meta: metaAtivPJ, metaStr: fmtNum(metaAtivPJ), updated: updAtivacao }),
  ].join("");

  /* ---- Índices de qualidade + NPS ---- */
  const saudeMedia = avgBy(rows, "Saúde do Cliente");
  const modeloMedia = avgBy(rows, "Modelo de Servir");
  const rupturaSoma = sumBy(rows, "Clientes em Ruptura");
  const metaSaude = avgBy(metasAssessor, "Meta Saúde do Cliente");
  const metaModelo = avgBy(metasAssessor, "Meta Modelo de Servir");
  const metaRuptura = sumBy(metasAssessor, "Meta Ruptura");
  const updQualidade = dateMap["Saúde do Cliente"] || "";

  const npsSemResposta = sumBy(rows, "NPS Sem Resposta");
  const npsRespondidos = sumBy(rows, "NPS Respondidos");
  const updNps = dateMap["NPS Respondidos"] || "";

  document.getElementById("qualidadeNpsBigNumbers").innerHTML = [
    bigNumberCard({ label: "Saúde do Cliente (média)", value: saudeMedia, valueStr: saudeMedia.toFixed(1), meta: metaSaude, metaStr: metaSaude.toFixed(1), updated: updQualidade }),
    bigNumberCard({ label: "Modelo de Servir (média)", value: modeloMedia, valueStr: modeloMedia.toFixed(1), meta: metaModelo, metaStr: metaModelo.toFixed(1), updated: updQualidade }),
    bigNumberCard({ label: "Clientes em Ruptura (soma)", value: rupturaSoma, valueStr: fmtNum(rupturaSoma), meta: metaRuptura, metaStr: fmtNum(metaRuptura), updated: updQualidade, invert: true }),
    simpleNumberCard({ label: "NPS — Sem Resposta", valueStr: fmtNum(npsSemResposta), updated: updNps }),
    simpleNumberCard({ label: "NPS — Respondidos", valueStr: fmtNum(npsRespondidos), updated: updNps }),
  ].join("");
}

/* ---------------- Chart helper ---------------- */

function renderChart(canvasId, type, data, extraOptions = {}) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(ctx, {
    type,
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      ...extraOptions,
    },
  });
}

/* ---------------- Tabs ---------------- */

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`view-${btn.dataset.view}`).classList.add("active");
  });
});

/* ---------------- Clock ---------------- */

function tickClock() {
  document.getElementById("clock").textContent = new Date().toLocaleTimeString("pt-BR");
}
setInterval(tickClock, 1000);
tickClock();

/* ---------------- Boot ---------------- */

loadDashboard();
setInterval(loadDashboard, REFRESH_MS);
