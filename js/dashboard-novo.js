import { db, auth } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { produtos, aoAtualizarProdutos, corProduto } from "./produtos.js";
import { fornecedores, aoAtualizarFornecedores } from "./fornecedores.js";
import { buscarCotacoesPorData, buscarCotacoesRecentes, nomeFornecedor, nomeProduto } from "./cotacoes-novo.js";
import { buscarPuxadasPorData, buscarPuxadasRecentes, resumoPuxadas } from "./puxadas.js";
import { formatarPreco, formatarLitros, hojeISO, diferencaPreco, formatarPercentual, toast, debounce } from "./utils.js";
import { souVendedor } from "./auth.js";

const inputData = document.getElementById("dash-data");
const destaqueGrid = document.getElementById("destaque-grid");
const tabelaMelhoresHoje = document.querySelector("#tabela-melhores-hoje tbody");
const selectProdutoEvolucao = document.getElementById("dash-produto-evolucao");
const totalLitrosPuxadosEl = document.getElementById("total-litros-puxados");
const fornecedorDaPuxadaEl = document.getElementById("fornecedor-da-puxada");
const precoDaPuxadaEl = document.getElementById("preco-da-puxada");
let grafico = null;

if (inputData) {
  inputData.value = hojeISO();
  inputData.addEventListener("change", montarDashboard);

  if (selectProdutoEvolucao) {
    selectProdutoEvolucao.addEventListener("change", montarGraficoEvolucao);
  }

  aoAtualizarProdutos(() => {
    if (selectProdutoEvolucao) {
      const atual = selectProdutoEvolucao.value;
      selectProdutoEvolucao.innerHTML = produtos.map((p) => `<option value="${p.id}">${p.nome}</option>`).join("");
      if (atual && produtos.some((p) => p.id === atual)) {
        selectProdutoEvolucao.value = atual;
      }
    }
    montarDashboard();
  });
  aoAtualizarFornecedores(montarDashboard);
}

export async function montarDashboard() {
  const data = inputData.value || hojeISO();
  const cotacoes = await buscarCotacoesPorData(data);

  const puxadas = await buscarPuxadasPorData(data);

  // Cards de preço do dia (S10/S500) e resumo de puxadas (litros/fornecedor/preço)
  // aparecem para todos os perfis.
  montarPrecosDia(cotacoes, puxadas);
  montarResumoPuxadas(puxadas);

  if (souVendedor()) {
    // Vendedor: só a tabela simplificada de puxadas do dia.
    montarPuxadasVendedor(puxadas);
  } else {
    // Editor / visualizador: painel completo (ranking + gráfico).
    montarTabelaMelhoresHoje(cotacoes, puxadas);
    montarGraficoEvolucao();
  }

  carregarAnotacao(data);
}

// ============================================================
// PREÇOS DO DIA (Cards simples)
// O "preço do dia" agora é calculado a partir das PUXADAS (compras
// realmente feitas), não mais a partir da melhor cotação. A melhor
// cotação continua exibida, mas só como referência secundária.
// ============================================================
function montarPrecosDia(cotacoes, puxadas) {
  if (!destaqueGrid) return;

  if (produtos.length === 0) {
    destaqueGrid.innerHTML = "";
    return;
  }

  destaqueGrid.innerHTML = produtos.map((p) => {
    const cotacoesDoProduto = cotacoes.filter((c) => c.produtoId === p.id && c.preco !== null && c.preco !== undefined);
    const melhorCotacao = cotacoesDoProduto.length > 0
      ? cotacoesDoProduto.reduce((m, c) => (c.preco < m.preco ? c : m), cotacoesDoProduto[0])
      : null;

    const puxadasDoProduto = (puxadas || []).filter((pu) => pu.produtoId === p.id && pu.preco !== null && pu.preco !== undefined && !isNaN(pu.preco));
    const resumo = resumoPuxadas(puxadasDoProduto);
    const precoDia = resumo ? resumo.referencia : null;

    if (precoDia === null) {
      return `<div class="destaque-card destaque-vazio" style="border-top:3px solid ${corProduto(p)}">
        <span class="destaque-tag"><span class="fornecedor-dot" style="background:${corProduto(p)}"></span>${p.nome}</span>
        <p class="destaque-vazio-texto">Sem compra registrada nesta data</p>
        ${melhorCotacao ? `<p class="destaque-vazio-texto">Melhor cotação: ${formatarPreco(melhorCotacao.preco)}</p>` : ""}
      </div>`;
    }

    const diff = melhorCotacao ? diferencaPreco(melhorCotacao.preco, precoDia) : null;
    const diffHtml = diff
      ? `<div class="destaque-diff ${diff.valor <= 0 ? "boa" : "ruim"}">${formatarPreco(diff.valor)} vs. cotação (${formatarPercentual(diff.percentual)})</div>`
      : "";

    return `<div class="destaque-card" style="border-top:3px solid ${corProduto(p)}">
      <span class="destaque-tag"><span class="fornecedor-dot" style="background:${corProduto(p)}"></span>${p.nome}</span>
      <div class="destaque-valor">${formatarPreco(precoDia)}</div>
      <div class="destaque-sub">Preço da puxada do dia</div>
      ${melhorCotacao ? `<div class="destaque-sub destaque-sub-secundario">Melhor cotação: ${formatarPreco(melhorCotacao.preco)}</div>` : ""}
      ${diffHtml}
    </div>`;
  }).join("");
}

// ============================================================
// MELHOR COTAÇÃO × PREÇO DO DIA (POR PRODUTO)
// "Melhor cotação" = menor preço disponível entre os fornecedores.
// "Preço do dia" = preço praticado nas compras (puxadas) do dia.
// ============================================================
function montarTabelaMelhoresHoje(cotacoes, puxadas) {
  if (!tabelaMelhoresHoje) return;

  if (produtos.length === 0) {
    tabelaMelhoresHoje.innerHTML = `<tr><td colspan="5" style="color:var(--texto-fraco)">Cadastre produtos para ver este ranking.</td></tr>`;
    return;
  }

  const linhas = produtos.map((p) => {
    const doProduto = cotacoes.filter((c) => c.produtoId === p.id && c.preco !== null && c.preco !== undefined);
    const puxadasDoProduto = (puxadas || []).filter((pu) => pu.produtoId === p.id && pu.preco !== null && pu.preco !== undefined && !isNaN(pu.preco));

    if (doProduto.length === 0 && puxadasDoProduto.length === 0) {
      return `<tr><td data-label="Produto">${p.nome}</td><td colspan="4" style="color:var(--texto-fraco)">Sem cotação nem compra hoje</td></tr>`;
    }

    // Melhor cotação (menor preço disponível entre os fornecedores)
    const melhor = doProduto.length > 0
      ? doProduto.reduce((m, c) => (c.preco < m.preco ? c : m), doProduto[0])
      : null;

    // Preço do dia: baseado no que foi realmente comprado (média ponderada pelas puxadas)
    const resumo = resumoPuxadas(puxadasDoProduto);
    const precoDia = resumo ? resumo.referencia : null;

    const diff = diferencaPreco(melhor?.preco, precoDia);
    const diffHtml = diff
      ? `<span style="color:${diff.valor <= 0 ? "var(--verde)" : "var(--vermelho)"}">${formatarPreco(diff.valor)} (${formatarPercentual(diff.percentual)})</span>`
      : `<span style="color:var(--texto-fraco)">—</span>`;

    return `<tr class="linha-melhor">
      <td data-label="Produto"><span class="fornecedor-dot" style="background:${corProduto(p)}"></span><strong>${p.nome}</strong></td>
      <td data-label="Melhor fornecedor">${melhor ? nomeFornecedor(melhor.fornecedorId) : "—"}</td>
      <td class="preco" data-label="Melhor cotação">${melhor ? formatarPreco(melhor.preco) : "—"}</td>
      <td class="preco" data-label="Preço do dia">${precoDia !== null ? formatarPreco(precoDia) : "—"}</td>
      <td data-label="Cotação × dia">${diffHtml}</td>
    </tr>`;
  }).join("");

  tabelaMelhoresHoje.innerHTML = linhas;
}

// ============================================================
// EVOLUÇÃO DE PREÇOS (gráfico)
// ============================================================
async function montarGraficoEvolucao() {
  if (!selectProdutoEvolucao) return;
  const canvas = document.getElementById("grafico-evolucao");
  if (!canvas) return;

  const produtoId = selectProdutoEvolucao.value;
  if (!produtoId) {
    if (grafico) { grafico.destroy(); grafico = null; }
    return;
  }

  const [todas, todasPuxadas] = await Promise.all([
    buscarCotacoesRecentes(3000),
    buscarPuxadasRecentes(3000)
  ]);
  const doProduto = todas.filter((c) => c.produtoId === produtoId && c.preco !== null && c.preco !== undefined);
  const puxadasDoProduto = todasPuxadas.filter((p) => p.produtoId === produtoId && p.preco !== null && p.preco !== undefined && !isNaN(p.preco));

  const porData = {};
  doProduto.forEach((c) => {
    if (!porData[c.data]) porData[c.data] = [];
    porData[c.data].push(c.preco);
  });
  const porDataPuxada = {};
  puxadasDoProduto.forEach((p) => {
    if (!porDataPuxada[p.data]) porDataPuxada[p.data] = [];
    porDataPuxada[p.data].push(p.preco);
  });

  const datasOrdenadas = Object.keys(porData).sort().slice(-30);
  const melhores = datasOrdenadas.map((d) => Math.min(...porData[d]));
  const medias = datasOrdenadas.map((d) => porData[d].reduce((a, b) => a + b, 0) / porData[d].length);
  // Média das puxadas no mesmo dia (null quando não houve puxada, para não distorcer a linha)
  const puxadasMedias = datasOrdenadas.map((d) => {
    const valores = porDataPuxada[d];
    if (!valores || valores.length === 0) return null;
    return valores.reduce((a, b) => a + b, 0) / valores.length;
  });
  const labels = datasOrdenadas.map((d) => d.split("-").reverse().slice(0, 2).join("/"));

  if (grafico) grafico.destroy();
  grafico = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Melhor cotação", data: melhores, borderColor: "#0F9D58", backgroundColor: "rgba(15,157,88,.1)", tension: .25, fill: true, pointRadius: 3 },
        { label: "Média de cotações", data: medias, borderColor: "#1D5F91", backgroundColor: "rgba(29,95,145,.06)", borderDash: [5, 4], tension: .25, fill: true, pointRadius: 2 },
        { label: "Preço do dia (compra)", data: puxadasMedias, borderColor: "#F2B705", backgroundColor: "rgba(242,183,5,.08)", tension: .25, fill: false, pointRadius: 3, spanGaps: true }
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
// RESUMO DE PUXADAS (Total de litros / fornecedor(es) da puxada)
// ============================================================
function montarResumoPuxadas(puxadas) {
  if (!totalLitrosPuxadosEl || !fornecedorDaPuxadaEl) return;

  const resumo = resumoPuxadas(puxadas);

  totalLitrosPuxadosEl.textContent = resumo && resumo.volumeTotal
    ? `${formatarLitros(resumo.volumeTotal)} L`
    : "0 L";

  if (precoDaPuxadaEl) {
    precoDaPuxadaEl.textContent = resumo
      ? formatarPreco(resumo.referencia)
      : "-";
  }

  if (!puxadas || puxadas.length === 0) {
    fornecedorDaPuxadaEl.textContent = "-";
    return;
  }

  const idsFornecedores = [...new Set(puxadas.map((p) => p.fornecedorId))];
  const nomes = idsFornecedores.map((id) => fornecedores.find((f) => f.id === id)?.nome || "—");
  fornecedorDaPuxadaEl.textContent = nomes.join(", ") || "-";
}

// ============================================================
// MINHAS PUXADAS (Tabela simplificada: Produto + Fornecedor + Litros + Preço)
// ============================================================
function montarPuxadasVendedor(puxadas) {
  const tabelaPuxadas = document.querySelector("#minhas-puxadas-tbody");

  if (!tabelaPuxadas) return;

  if (!puxadas || puxadas.length === 0) {
    tabelaPuxadas.innerHTML = `<tr><td colspan="4" style="color:var(--texto-fraco); text-align:center; padding:20px;">Nenhuma puxada registrada neste dia</td></tr>`;
    return;
  }

  const nomeFornecedorLocal = (id) => fornecedores.find((f) => f.id === id)?.nome || "—";

  const ordenadas = [...puxadas].sort((a, b) => {
    const nomeA = nomeProduto(a.produtoId);
    const nomeB = nomeProduto(b.produtoId);
    if (nomeA !== nomeB) return nomeA.localeCompare(nomeB, "pt-BR");
    return (a.atualizadoEm || "").localeCompare(b.atualizadoEm || "");
  });

  const linhas = ordenadas.map((pux) => {
    const nomeProd = nomeProduto(pux.produtoId);
    return `<tr class="linha-puxada-vendedor" style="border-left:4px solid ${corProduto(pux.produtoId)}">
      <td data-label="Produto"><span class="fornecedor-dot" style="background:${corProduto(pux.produtoId)}"></span><strong>${nomeProd}</strong></td>
      <td data-label="Fornecedor">${nomeFornecedorLocal(pux.fornecedorId)}</td>
      <td data-label="Litros">${pux.volumeLitros ? formatarLitros(pux.volumeLitros) + " L" : "—"}</td>
      <td data-label="Preço Puxado" class="preco"><strong>${formatarPreco(pux.preco)}</strong></td>
    </tr>`;
  }).join("");

  tabelaPuxadas.innerHTML = linhas;
}

// ============================================================
// OBSERVAÇÕES DO DIA
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
