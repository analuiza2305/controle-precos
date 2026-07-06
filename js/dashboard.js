import { produtos, aoAtualizarProdutos } from "./produtos.js";
import { aoAtualizarFornecedores } from "./fornecedores.js";
import { buscarCotacoesPorData, buscarCotacoesRecentes, nomeFornecedor, nomeProduto } from "./cotacoes.js";
import { formatarPreco, hojeISO } from "./utils.js";

const inputData = document.getElementById("dash-data");
const kpiGrid = document.getElementById("kpi-grid");
const tabelaMelhoresHoje = document.querySelector("#tabela-melhores-hoje tbody");
const selectProdutoEvolucao = document.getElementById("dash-produto-evolucao");
let grafico = null;

inputData.value = hojeISO();
inputData.addEventListener("change", montarDashboard);
selectProdutoEvolucao.addEventListener("change", montarGraficoEvolucao);
aoAtualizarProdutos(() => {
  const atual = selectProdutoEvolucao.value;
  selectProdutoEvolucao.innerHTML = produtos.map((p) => `<option value="${p.id}">${p.nome}</option>`).join("");
  if (atual) selectProdutoEvolucao.value = atual;
  montarDashboard();
});
aoAtualizarFornecedores(montarDashboard);

export async function montarDashboard() {
  const data = inputData.value || hojeISO();
  const cotacoes = await buscarCotacoesPorData(data);
  montarKpis(cotacoes);
  montarTabelaMelhoresHoje(cotacoes);
  montarGraficoEvolucao();
}

function montarKpis(cotacoes) {
  if (cotacoes.length === 0) {
    kpiGrid.innerHTML = `
      <div class="painel" style="grid-column:1/-1;"><p style="margin:0; color:var(--texto-fraco);">Nenhuma cotação lançada para esta data ainda. Acesse <strong>Lançar Preços</strong> para começar.</p></div>`;
    return;
  }
  const precos = cotacoes.map((c) => c.preco);
  const min = Math.min(...precos);
  const max = Math.max(...precos);
  const media = precos.reduce((a, b) => a + b, 0) / precos.length;
  const cMin = cotacoes.find((c) => c.preco === min);
  const cMax = cotacoes.find((c) => c.preco === max);

  const posGauge = max === min ? 50 : ((media - min) / (max - min)) * 100;

  kpiGrid.innerHTML = `
    <div class="kpi-card" style="--barra-cor: var(--verde)">
      <div class="kpi-label">Melhor preço do dia</div>
      <div class="kpi-valor">${formatarPreco(min)}</div>
      <div class="kpi-sub">${nomeFornecedor(cMin.fornecedorId)} · ${nomeProduto(cMin.produtoId)}</div>
    </div>
    <div class="kpi-card" style="--barra-cor: var(--vermelho)">
      <div class="kpi-label">Maior preço do dia</div>
      <div class="kpi-valor">${formatarPreco(max)}</div>
      <div class="kpi-sub">${nomeFornecedor(cMax.fornecedorId)} · ${nomeProduto(cMax.produtoId)}</div>
    </div>
    <div class="kpi-card" style="--barra-cor: var(--ambar)">
      <div class="kpi-label">Diferença mín. × máx.</div>
      <div class="kpi-valor">${formatarPreco(max - min)}</div>
      <div class="kpi-sub">${min > 0 ? ((max - min) / min * 100).toFixed(1) : "0"}% de variação</div>
    </div>
    <div class="kpi-card" style="--barra-cor: var(--azul-acao)">
      <div class="kpi-label">Média de mercado</div>
      <div class="kpi-valor">${formatarPreco(media)}</div>
      <div class="kpi-gauge">
        <div class="kpi-gauge-fill" style="width:100%"></div>
        <div class="kpi-gauge-marker" style="left:${posGauge}%"></div>
      </div>
      <div class="kpi-sub">Baseado em ${cotacoes.length} cotação(ões)</div>
    </div>
  `;
}

function montarTabelaMelhoresHoje(cotacoes) {
  if (produtos.length === 0) {
    tabelaMelhoresHoje.innerHTML = `<tr><td colspan="4" style="color:var(--texto-fraco)">Cadastre produtos para ver este ranking.</td></tr>`;
    return;
  }
  const linhas = produtos.map((p) => {
    const doProduto = cotacoes.filter((c) => c.produtoId === p.id);
    if (doProduto.length === 0) {
      return `<tr><td>${p.nome}</td><td colspan="3" style="color:var(--texto-fraco)">Sem cotação hoje</td></tr>`;
    }
    const media = doProduto.reduce((a, c) => a + c.preco, 0) / doProduto.length;
    const melhor = doProduto.reduce((m, c) => (c.preco < m.preco ? c : m), doProduto[0]);
    const diferenca = melhor.preco - media;
    return `<tr class="linha-melhor">
      <td><strong>${p.nome}</strong></td>
      <td>${nomeFornecedor(melhor.fornecedorId)}</td>
      <td class="preco">${formatarPreco(melhor.preco)}</td>
      <td style="color:${diferenca <= 0 ? "var(--verde)" : "var(--vermelho)"}">${formatarPreco(diferenca)}</td>
    </tr>`;
  }).join("");
  tabelaMelhoresHoje.innerHTML = linhas;
}

async function montarGraficoEvolucao() {
  const produtoId = selectProdutoEvolucao.value;
  const canvas = document.getElementById("grafico-evolucao");
  if (!produtoId) {
    if (grafico) { grafico.destroy(); grafico = null; }
    return;
  }
  const todas = await buscarCotacoesRecentes(3000);
  const doProduto = todas.filter((c) => c.produtoId === produtoId);

  // Agrupa por data: guarda o melhor (menor) preço do dia e a média do dia
  const porData = {};
  doProduto.forEach((c) => {
    if (!porData[c.data]) porData[c.data] = [];
    porData[c.data].push(c.preco);
  });
  const datasOrdenadas = Object.keys(porData).sort().slice(-30); // últimos 30 dias com lançamento
  const melhores = datasOrdenadas.map((d) => Math.min(...porData[d]));
  const medias = datasOrdenadas.map((d) => porData[d].reduce((a, b) => a + b, 0) / porData[d].length);
  const labels = datasOrdenadas.map((d) => d.split("-").reverse().slice(0, 2).join("/"));

  if (grafico) grafico.destroy();
  grafico = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Melhor preço", data: melhores, borderColor: "#0F9D58", backgroundColor: "rgba(15,157,88,.1)", tension: .25, fill: true, pointRadius: 3 },
        { label: "Média de mercado", data: medias, borderColor: "#1D5F91", backgroundColor: "rgba(29,95,145,.06)", borderDash: [5, 4], tension: .25, fill: true, pointRadius: 2 }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: {
        y: { ticks: { callback: (v) => "R$ " + v.toFixed(2) } },
        x: { grid: { display: false } }
      }
    }
  });
}
