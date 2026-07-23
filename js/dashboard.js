import { db, auth } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { produtos, aoAtualizarProdutos } from "./produtos.js";
import { aoAtualizarFornecedores } from "./fornecedores.js";
import { buscarCotacoesPorData, buscarCotacoesRecentes, nomeFornecedor, nomeProduto } from "./cotacoes.js";
import { formatarPreco, hojeISO, diferencaPreco, formatarPercentual, ehProdutoDestaque, toast, debounce } from "./utils.js";

const inputData = document.getElementById("dash-data");
const destaqueGrid = document.getElementById("destaque-grid");
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
  montarDestaques(cotacoes, data);
  montarTabelaMelhoresHoje(cotacoes);
  montarGraficoEvolucao();
  carregarAnotacao(data);
}

// Cards de destaque com o melhor preço do dia para os produtos identificados
// como S10 / S500 (por nome do produto cadastrado).
function montarDestaques(cotacoes, data) {
  if (!destaqueGrid) return;
  const produtosDestaque = produtos.filter((p) => ehProdutoDestaque(p.nome));
  if (produtosDestaque.length === 0) { destaqueGrid.innerHTML = ""; return; }

  destaqueGrid.innerHTML = produtosDestaque.map((p) => {
    const doProduto = cotacoes.filter((c) => c.produtoId === p.id && c.preco !== null && c.preco !== undefined);
    if (doProduto.length === 0) {
      return `<div class="destaque-card destaque-vazio">
        <span class="destaque-tag">${p.nome}</span>
        <p class="destaque-vazio-texto">Sem cotação nesta data</p>
      </div>`;
    }
    // ✓ Melhor preço do dia (menor entre todos os fornecedores)
    const melhor = doProduto.reduce((m, c) => (c.preco < m.preco ? c : m), doProduto[0]);
    
    // ✓ Melhor preço puxado (menor entre todos os fornecedores, independente)
    const precosPuxados = doProduto
      .filter((c) => c.precoPuxado !== null && c.precoPuxado !== undefined && !isNaN(c.precoPuxado))
      .map((c) => c.precoPuxado);
    const melhorPuxado = precosPuxados.length > 0 ? Math.min(...precosPuxados) : null;
    
    // ✓ Compara os dois melhores valores, independentes
    const diff = diferencaPreco(melhor.preco, melhorPuxado);
    return `<div class="destaque-card">
      <span class="destaque-tag">${p.nome}</span>
      <div class="destaque-valor">${formatarPreco(melhor.preco)}</div>
      <div class="destaque-sub">${nomeFornecedor(melhor.fornecedorId)}</div>
      ${diff ? `<div class="destaque-diff ${diff.valor <= 0 ? "boa" : "ruim"}">vs. puxado: ${formatarPreco(diff.valor)} (${formatarPercentual(diff.percentual)})</div>` : ""}
    </div>`;
  }).join("");
}

function montarTabelaMelhoresHoje(cotacoes) {
  if (produtos.length === 0) {
    tabelaMelhoresHoje.innerHTML = `<tr><td colspan="5" style="color:var(--texto-fraco)">Cadastre produtos para ver este ranking.</td></tr>`;
    return;
  }
  const linhas = produtos.map((p) => {
    const doProduto = cotacoes.filter((c) => c.produtoId === p.id && c.preco !== null && c.preco !== undefined);
    if (doProduto.length === 0) {
      return `<tr><td data-label="Produto">${p.nome}</td><td colspan="4" style="color:var(--texto-fraco)">Sem cotação hoje</td></tr>`;
    }
    // ✓ Melhor preço do dia (menor entre todos os fornecedores)
    const melhor = doProduto.reduce((m, c) => (c.preco < m.preco ? c : m), doProduto[0]);
    
    // ✓ Melhor preço puxado (menor entre todos os fornecedores, independente)
    const precosPuxados = doProduto
      .filter((c) => c.precoPuxado !== null && c.precoPuxado !== undefined && !isNaN(c.precoPuxado))
      .map((c) => c.precoPuxado);
    const melhorPuxado = precosPuxados.length > 0 ? Math.min(...precosPuxados) : null;
    
    // ✓ Compara os dois melhores valores, independentes
    const diff = diferencaPreco(melhor.preco, melhorPuxado);
    const diffHtml = diff
      ? `<span style="color:${diff.valor <= 0 ? "var(--verde)" : "var(--vermelho)"}">${formatarPreco(diff.valor)} (${formatarPercentual(diff.percentual)})</span>`
      : `<span style="color:var(--texto-fraco)">—</span>`;
    return `<tr class="linha-melhor">
      <td data-label="Produto"><strong>${p.nome}</strong></td>
      <td data-label="Melhor fornecedor">${nomeFornecedor(melhor.fornecedorId)}</td>
      <td class="preco" data-label="Preço do dia">${formatarPreco(melhor.preco)}</td>
      <td class="preco" data-label="Preço puxado">${formatarPreco(melhorPuxado)}</td>
      <td data-label="Dia × puxado">${diffHtml}</td>
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
  const doProduto = todas.filter((c) => c.produtoId === produtoId && c.preco !== null && c.preco !== undefined);

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

// ============================================================
// ANOTAÇÕES DO DIA
// ============================================================
const textareaAnotacoes = document.getElementById("dash-anotacoes");
const anotacoesStatus = document.getElementById("anotacoes-status");
const anotacoesContador = document.getElementById("anotacoes-contador");
const btnSalvarAnotacao = document.getElementById("btn-salvar-anotacao");

let dataAnotacaoAtual = null;

async function carregarAnotacao(data) {
  if (!textareaAnotacoes) return;
  dataAnotacaoAtual = data;
  textareaAnotacoes.disabled = true;
  anotacoesStatus.textContent = "Carregando...";
  anotacoesStatus.className = "anotacoes-status";
  try {
    const snap = await getDoc(doc(db, "notas", data));
    // Evita sobrescrever se a data mudou enquanto a busca estava em andamento
    if (dataAnotacaoAtual !== data) return;
    textareaAnotacoes.value = snap.exists() ? (snap.data().texto || "") : "";
    atualizarContador();
    anotacoesStatus.textContent = snap.exists() && snap.data().atualizadoEm
      ? `Última atualização: ${new Date(snap.data().atualizadoEm).toLocaleString("pt-BR")}`
      : "";
  } catch (e) {
    anotacoesStatus.textContent = "Não foi possível carregar as anotações.";
  } finally {
    if (dataAnotacaoAtual === data) textareaAnotacoes.disabled = false;
  }
}

function atualizarContador() {
  if (!anotacoesContador) return;
  anotacoesContador.textContent = `${textareaAnotacoes.value.length}/2000`;
}

async function salvarAnotacao({ silencioso = false } = {}) {
  if (!textareaAnotacoes) return;
  const data = dataAnotacaoAtual || inputData.value || hojeISO();
  const texto = textareaAnotacoes.value.trim();
  anotacoesStatus.textContent = "Salvando...";
  anotacoesStatus.className = "anotacoes-status salvando";
  try {
    await setDoc(doc(db, "notas", data), {
      data, texto,
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: auth.currentUser?.email || null
    }, { merge: true });
    anotacoesStatus.textContent = `Salvo às ${new Date().toLocaleTimeString("pt-BR")}`;
    anotacoesStatus.className = "anotacoes-status salvo";
    if (!silencioso) toast("Observação salva.", "sucesso");
  } catch (e) {
    anotacoesStatus.textContent = "Erro ao salvar. Tente novamente.";
    anotacoesStatus.className = "anotacoes-status";
    if (!silencioso) toast("Não foi possível salvar a observação.", "erro");
  }
}

const salvarAnotacaoAutomatico = debounce(() => salvarAnotacao({ silencioso: true }), 1200);

if (textareaAnotacoes) {
  textareaAnotacoes.addEventListener("input", () => {
    atualizarContador();
    salvarAnotacaoAutomatico();
  });
}
if (btnSalvarAnotacao) {
  btnSalvarAnotacao.addEventListener("click", () => salvarAnotacao({ silencioso: false }));
}
