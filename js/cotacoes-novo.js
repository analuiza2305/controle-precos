import { db } from "./firebase-config.js";
import {
  collection, doc, setDoc, deleteDoc, getDocs, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { fornecedores, fornecedoresAtivos, aoAtualizarFornecedores } from "./fornecedores.js";
import { produtos, aoAtualizarProdutos } from "./produtos.js";
import {
  toast, confirmar, formatarData, formatarPreco, formatarLitros, hojeISO, corFornecedor,
  diferencaPreco, formatarPercentual, ehProdutoDestaque
} from "./utils.js";
import { buscarPuxadasPorData, resumoPuxadas as resumoPuxadasNova, deletarPuxada } from "./puxadas.js";

const colecaoRef = collection(db, "cotacoes");

// ID determinístico para cotações: 1 cotação por data+fornecedor+produto
function idCotacao(data, fornecedorId, produtoId) {
  return `${data}__${fornecedorId}__${produtoId}`;
}

// Salva apenas o preço do dia (sem puxadas)
export async function salvarCotacao(data, fornecedorId, produtoId, preco) {
  const ref = doc(db, "cotacoes", idCotacao(data, fornecedorId, produtoId));
  const semPreco = preco === null || preco === "" || preco === undefined || isNaN(preco);

  if (semPreco) {
    await deleteDoc(ref).catch(() => {});
    return;
  }

  await setDoc(ref, {
    data,
    fornecedorId,
    produtoId,
    preco: Number(preco),
    atualizadoEm: new Date().toISOString()
  }, { merge: true });
}

export async function buscarCotacoesPorData(data) {
  const q = query(colecaoRef, where("data", "==", data));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function buscarCotacoesRecentes(max = 1000) {
  const q = query(colecaoRef, orderBy("data", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function nomeFornecedor(id) {
  return fornecedores.find((f) => f.id === id)?.nome || "(removido)";
}
export function nomeProduto(id) {
  return produtos.find((p) => p.id === id)?.nome || "(removido)";
}

// ============================================================
// LANÇAMENTO DIÁRIO DE PREÇOS
// ============================================================
const inputData = document.getElementById("lanc-data");
const thead = document.getElementById("lancamento-thead-row");
const tbody = document.getElementById("lancamento-tbody");
const statusEl = document.getElementById("lancamento-status");
const btnSalvarTudo = document.getElementById("btn-salvar-lancamento");
const destaqueLancamentoEl = document.getElementById("lancamento-destaque-grid");

if (inputData) {
  inputData.value = hojeISO();
  inputData.addEventListener("change", montarGradeLancamento);
  aoAtualizarFornecedores(montarGradeLancamento);
  aoAtualizarProdutos(montarGradeLancamento);
}

async function montarGradeLancamento() {
  const forns = fornecedoresAtivos();
  if (produtos.length === 0 || forns.length === 0) {
    if (thead) thead.innerHTML = "<th>Produto</th>";
    if (tbody) tbody.innerHTML = `<tr><td style="color:var(--texto-fraco)">Cadastre ao menos um produto e um fornecedor ativo para lançar preços.</td></tr>`;
    if (destaqueLancamentoEl) destaqueLancamentoEl.innerHTML = "";
    return;
  }

  if (thead) {
    thead.innerHTML = "<th>Produto</th>" + forns.map((f) => `
      <th style="border-top:3px solid ${corFornecedor(f.id)}">
        <span class="fornecedor-dot" style="background:${corFornecedor(f.id)}"></span>${f.nome}
      </th>`).join("");
  }

  const data = inputData.value || hojeISO();
  const [existentes, puxadasDoDia] = await Promise.all([
    buscarCotacoesPorData(data),
    buscarPuxadasPorData(data).catch(() => [])
  ]);
  const mapa = {};
  existentes.forEach((c) => { mapa[`${c.fornecedorId}__${c.produtoId}`] = c; });

  if (destaqueLancamentoEl) destaqueLancamentoEl.innerHTML = montarFaixaDestaques(existentes, puxadasDoDia, data);

  if (tbody) {
    tbody.innerHTML = produtos.map((p) => `
      <tr data-linha-produto="${p.id}" ${ehProdutoDestaque(p.nome) ? 'class="linha-produto-destaque"' : ""}>
        <td><strong>${p.nome}</strong>${ehProdutoDestaque(p.nome) ? '<span class="mini-tag-destaque">destaque</span>' : ""}</td>
        ${forns.map((f) => {
          const cot = mapa[`${f.id}__${p.id}`];
          const valorDia = cot?.preco ?? null;
          return `<td class="cel-preco-dia">
            <input type="number" step="0.001" min="0" placeholder="0,000"
              class="input-preco-dia ${valorDia !== null ? "preenchido" : ""}"
              value="${valorDia !== null ? valorDia : ""}"
              data-produto="${p.id}" data-fornecedor="${f.id}">
          </td>`;
        }).join("")}
      </tr>
    `).join("");
  }

  destacarMenoresPrecos();
}

function destacarMenoresPrecos() {
  if (!tbody) return;
  tbody.querySelectorAll("tr[data-linha-produto]").forEach((tr) => {
    const inputs = [...tr.querySelectorAll('input[type="number"]')];
    const valores = inputs
      .map((i) => ({ input: i, valor: parseFloat(i.value) }))
      .filter((x) => !isNaN(x.valor));
    inputs.forEach((i) => i.classList.remove("menor-preco-linha"));
    if (valores.length < 2) return;
    const menor = Math.min(...valores.map((v) => v.valor));
    valores.filter((v) => v.valor === menor).forEach((v) => v.input.classList.add("menor-preco-linha"));
  });
}

if (tbody) {
  tbody.addEventListener("input", (e) => {
    if (e.target.matches('input[type="number"]')) destacarMenoresPrecos();
  });

  tbody.addEventListener("blur", async (e) => {
    if (e.target.tagName !== "INPUT") return;
    const { produto, fornecedor } = e.target.dataset;
    const data = inputData.value || hojeISO();
    const preco = e.target.value === "" ? null : parseFloat(e.target.value);
    
    try {
      await salvarCotacao(data, fornecedor, produto, preco);
      e.target.classList.toggle("preenchido", preco !== null);
      statusEl.textContent = "Salvo ✓";
      statusEl.classList.add("ok");
      setTimeout(() => { statusEl.textContent = ""; statusEl.classList.remove("ok"); }, 2200);
      if (destaqueLancamentoEl) {
        const [existentesAgora, puxadasAgora] = await Promise.all([buscarCotacoesPorData(data), buscarPuxadasPorData(data).catch(() => [])]);
        destaqueLancamentoEl.innerHTML = montarFaixaDestaques(existentesAgora, puxadasAgora, data);
      }
    } catch (err) {
      toast("Erro ao salvar preço.", "erro");
    }
  }, true);
}

if (btnSalvarTudo) {
  btnSalvarTudo.addEventListener("click", async () => {
    if (!tbody) return;
    const inputs = [...tbody.querySelectorAll('input[type="number"]')];
    const data = inputData.value || hojeISO();
    btnSalvarTudo.disabled = true;
    btnSalvarTudo.textContent = "Salvando...";
    try {
      await Promise.all(inputs.map((input) => {
        const preco = input.value === "" ? null : parseFloat(input.value);
        return salvarCotacao(data, input.dataset.fornecedor, input.dataset.produto, preco);
      }));
      toast("Lançamentos do dia salvos com sucesso.", "sucesso");
      montarGradeLancamento();
    } catch (err) {
      toast("Erro ao salvar lançamentos.", "erro");
    } finally {
      btnSalvarTudo.disabled = false;
      btnSalvarTudo.textContent = "Salvar lançamentos do dia";
    }
  });
}

// ============================================================
// COMPARATIVO / RANKING
// ============================================================
const compData = document.getElementById("comp-data");
const painelComparativo = document.getElementById("painel-comparativo");

if (compData) {
  compData.value = hojeISO();
  compData.addEventListener("change", montarComparativo);
}

export async function montarComparativo() {
  if (!painelComparativo) return;
  const data = compData.value || hojeISO();
  const cotacoes = await buscarCotacoesPorData(data);
  const puxadas = await buscarPuxadasPorData(data);

  if (produtos.length === 0) {
    painelComparativo.innerHTML = `<p style="color:var(--texto-fraco)">Cadastre produtos para visualizar o comparativo.</p>`;
    return;
  }

  painelComparativo.innerHTML = montarFaixaDestaques(cotacoes, puxadas, data) + produtos.map((p) => {
    const linhas = cotacoes
      .filter((c) => c.produtoId === p.id && c.preco !== null && c.preco !== undefined)
      .sort((a, b) => a.preco - b.preco);

    if (linhas.length === 0) {
      return `<div class="produto-titulo"><h3>${p.nome}</h3></div>
        <p style="color:var(--texto-fraco); margin:0 0 26px;">Nenhuma cotação lançada nesta data.</p>`;
    }

    const min = linhas[0].preco;
    const max = linhas[linhas.length - 1].preco;

    const linhasHtml = linhas.map((c, i) => {
      const classe = c.preco === min ? "linha-melhor" : c.preco === max && max !== min ? "linha-pior" : "";
      const rankClasse = i === 0 ? "rank-pos top" : "rank-pos";
      const selo = c.preco === min
        ? `<span class="selo selo-melhor">Melhor preço</span>`
        : c.preco === max && max !== min
          ? `<span class="selo selo-pior">Maior preço</span>` : "";
      
      // Puxadas deste fornecedor/produto neste dia
      const puxadasDesseForn = puxadas.filter((pux) => 
        pux.fornecedorId === c.fornecedorId && pux.produtoId === c.produtoId
      );
      const resumo = resumoPuxadasNova(puxadasDesseForn);
      const diff = diferencaPreco(c.preco, resumo?.referencia ?? null);
      const diffHtml = diff
        ? `<span class="${diff.valor <= 0 ? "diferenca-boa" : "diferenca-ruim"}">${formatarPreco(diff.valor)} · ${formatarPercentual(diff.percentual)}</span>`
        : `<span style="color:var(--texto-fraco)">—</span>`;
      const puxadasHtml = puxadasDesseForn.length
        ? `<div class="puxadas-chips">${puxadasDesseForn.map((pux) => `<span class="chip-puxada">${formatarPreco(pux.preco)}${pux.volumeLitros ? ` · ${formatarLitros(pux.volumeLitros)}` : ""}</span>`).join("")}</div>${resumo?.volumeTotal ? `<div class="litros-total">Total: ${formatarLitros(resumo.volumeTotal)}</div>` : ""}`
        : `<span style="color:var(--texto-fraco)">—</span>`;
      
      return `<tr class="${classe}">
        <td data-label="Rank"><span class="${rankClasse}">${i + 1}º</span></td>
        <td data-label="Fornecedor"><span class="fornecedor-dot" style="background:${corFornecedor(c.fornecedorId)}"></span>${nomeFornecedor(c.fornecedorId)}</td>
        <td class="preco" data-label="Preço do dia">${formatarPreco(c.preco)}</td>
        <td data-label="Puxadas do dia">${puxadasHtml}</td>
        <td data-label="Dia × puxado">${diffHtml}</td>
        <td data-label="">${selo}</td>
      </tr>`;
    }).join("");

    return `
      <div class="produto-titulo">
        <h3>${p.nome}${ehProdutoDestaque(p.nome) ? '<span class="mini-tag-destaque">destaque</span>' : ""}</h3>
        <span class="produto-titulo-tag">Variação do dia: ${formatarPreco(max - min)}</span>
      </div>
      <div class="tabela-wrap" style="margin-bottom:30px;">
        <table class="tabela">
          <thead><tr><th>Rank</th><th>Fornecedor</th><th>Preço do dia</th><th>Puxadas do dia</th><th>Dia × puxado</th><th></th></tr></thead>
          <tbody>${linhasHtml}</tbody>
        </table>
      </div>`;
  }).join("");
}

function montarFaixaDestaques(cotacoes, puxadas, data) {
  const produtosDestaque = produtos.filter((p) => ehProdutoDestaque(p.nome));
  if (produtosDestaque.length === 0) return "";

  const cards = produtosDestaque.map((p) => {
    const doProduto = cotacoes.filter((c) => c.produtoId === p.id && c.preco !== null && c.preco !== undefined);
    if (doProduto.length === 0) {
      return `<div class="destaque-card destaque-vazio">
        <span class="destaque-tag">${p.nome}</span>
        <p class="destaque-vazio-texto">Sem cotação em ${formatarData(data)}</p>
      </div>`;
    }
    
    const melhor = doProduto.reduce((m, c) => (c.preco < m.preco ? c : m), doProduto[0]);
    const puxadasDesseProduto = puxadas.filter((pux) => pux.produtoId === p.id);
    const resumo = resumoPuxadasNova(puxadasDesseProduto);
    const diff = diferencaPreco(melhor.preco, resumo?.menor ?? null);
    
    return `<div class="destaque-card">
      <span class="destaque-tag">${p.nome}</span>
      <div class="destaque-valor">${formatarPreco(melhor.preco)}</div>
      <div class="destaque-sub"><span class="fornecedor-dot" style="background:${corFornecedor(melhor.fornecedorId)}"></span>${nomeFornecedor(melhor.fornecedorId)}</div>
      ${diff ? `<div class="destaque-diff ${diff.valor <= 0 ? "boa" : "ruim"}">vs. puxado: ${formatarPreco(diff.valor)} (${formatarPercentual(diff.percentual)})</div>` : ""}
      ${resumo?.volumeTotal ? `<div class="destaque-sub">Total puxado: ${formatarLitros(resumo.volumeTotal)}</div>` : ""}
    </div>`;
  }).join("");

  return `<div class="destaque-grid">${cards}</div>`;
}

// ============================================================
// HISTÓRICO
// ============================================================
const histDataInicio = document.getElementById("hist-data-inicio");
const histDataFim = document.getElementById("hist-data-fim");
const histFornecedor = document.getElementById("hist-fornecedor");
const histProduto = document.getElementById("hist-produto");
const tabelaHistorico = document.querySelector("#tabela-historico tbody");
const btnFiltrarHistorico = document.getElementById("btn-filtrar-historico");

if (histDataInicio) {
  const primeiroDiaMes = new Date();
  primeiroDiaMes.setDate(1);
  histDataInicio.value = primeiroDiaMes.toISOString().slice(0, 10);
  histDataFim.value = hojeISO();

  aoAtualizarFornecedores(() => preencherSelect(histFornecedor, fornecedores, "Todos"));
  aoAtualizarProdutos(() => preencherSelect(histProduto, produtos, "Todos"));

  btnFiltrarHistorico.addEventListener("click", carregarHistorico);
}

function preencherSelect(select, itens, textoTodos) {
  const atual = select.value;
  select.innerHTML = `<option value="">${textoTodos}</option>` + itens.map((i) => `<option value="${i.id}">${i.nome}</option>`).join("");
  select.value = atual;
}

let graficoHistorico = null;

export async function carregarHistorico() {
  if (!tabelaHistorico) return;
  tabelaHistorico.innerHTML = `<tr><td colspan="7" style="color:var(--texto-fraco)">Carregando...</td></tr>`;
  
  const todas = await buscarCotacoesRecentes(2000);
  const todasPuxadas = await buscarPuxadasPorData("");
  
  const ini = histDataInicio.value;
  const fim = histDataFim.value;
  const fornSel = histFornecedor.value;
  const prodSel = histProduto.value;

  const filtradas = todas.filter((c) => {
    if (ini && c.data < ini) return false;
    if (fim && c.data > fim) return false;
    if (fornSel && c.fornecedorId !== fornSel) return false;
    if (prodSel && c.produtoId !== prodSel) return false;
    return true;
  }).sort((a, b) => b.data.localeCompare(a.data));

  const contador = document.getElementById("historico-contador");
  if (contador) contador.textContent = `${filtradas.length} lançamento${filtradas.length === 1 ? "" : "s"} encontrado${filtradas.length === 1 ? "" : "s"}`;

  montarGraficoHistorico(filtradas, todasPuxadas);

  if (filtradas.length === 0) {
    tabelaHistorico.innerHTML = `<tr><td colspan="7"><div class="estado-vazio">Nenhum lançamento encontrado para os filtros selecionados.</div></td></tr>`;
    return;
  }

  tabelaHistorico.innerHTML = filtradas.map((c) => {
    const puxadasDesseCot = todasPuxadas.filter((p) => 
      p.data === c.data && p.fornecedorId === c.fornecedorId && p.produtoId === c.produtoId
    );
    const resumo = resumoPuxadasNova(puxadasDesseCot);
    const diff = diferencaPreco(c.preco, resumo?.referencia ?? null);
    const diffHtml = diff
      ? `<span class="${diff.valor <= 0 ? "diferenca-boa" : "diferenca-ruim"}">${formatarPreco(diff.valor)} · ${formatarPercentual(diff.percentual)}</span>`
      : `<span style="color:var(--texto-fraco)">—</span>`;
    
    return `
    <tr data-id="${c.id}" data-data="${c.data}" data-fornecedor="${c.fornecedorId}" data-produto="${c.produtoId}">
      <td class="col-data" data-label="Data">${formatarData(c.data)}</td>
      <td data-label="Fornecedor"><span class="fornecedor-dot" style="background:${corFornecedor(c.fornecedorId)}"></span>${nomeFornecedor(c.fornecedorId)}</td>
      <td data-label="Produto">${nomeProduto(c.produtoId)}</td>
      <td class="col-preco" data-label="Preço do dia">
        <input type="number" step="0.001" value="${c.preco !== null && c.preco !== undefined ? c.preco : ""}"
          data-tipo="dia" class="input-preco-historico">
      </td>
      <td data-label="Puxadas do dia" class="col-puxadas-historico">
        ${puxadasDesseCot.map((pux) => `<span class="chip-puxada">${formatarPreco(pux.preco)}${pux.volumeLitros ? ` · ${formatarLitros(pux.volumeLitros)}` : ""}</span>`).join("")}
        ${resumo?.volumeTotal ? `<div class="litros-total">Total: ${formatarLitros(resumo.volumeTotal)}</div>` : ""}
      </td>
      <td data-label="Dia × puxado">${diffHtml}</td>
      <td class="col-acao somente-editor" data-label="">
        <button class="btn-icone perigo" data-excluir="${c.id}" title="Excluir">✕</button>
      </td>
    </tr>
  `;
  }).join("");
}

function montarGraficoHistorico(registros, todasPuxadas) {
  const canvas = document.getElementById("grafico-historico");
  const painel = document.getElementById("painel-grafico-historico");
  if (!canvas || !painel) return;

  const porData = {};
  registros.forEach((c) => {
    if (!porData[c.data]) porData[c.data] = { dia: [], puxado: [] };
    if (c.preco !== null && c.preco !== undefined && !isNaN(c.preco)) porData[c.data].dia.push(c.preco);
  });
  
  todasPuxadas.forEach((p) => {
    if (!porData[p.data]) porData[p.data] = { dia: [], puxado: [] };
    porData[p.data].puxado.push(p.preco);
  });
  
  const datas = Object.keys(porData).sort();

  if (datas.length === 0) {
    painel.classList.add("oculto");
    if (graficoHistorico) { graficoHistorico.destroy(); graficoHistorico = null; }
    return;
  }
  painel.classList.remove("oculto");

  const labels = datas.map((d) => formatarData(d));
  const melhores = datas.map((d) => (porData[d].dia.length ? Math.min(...porData[d].dia) : null));
  const puxados = datas.map((d) => (porData[d].puxado.length
    ? porData[d].puxado.reduce((a, b) => a + b, 0) / porData[d].puxado.length
    : null));

  if (graficoHistorico) graficoHistorico.destroy();
  graficoHistorico = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Melhor preço do dia", data: melhores, borderColor: "#0F9D58", backgroundColor: "rgba(15,157,88,.1)", tension: .25, fill: true, pointRadius: 3, spanGaps: true },
        { label: "Preço puxado (média)", data: puxados, borderColor: "#8E44AD", backgroundColor: "rgba(142,68,173,.08)", borderDash: [5, 4], tension: .25, fill: true, pointRadius: 2, spanGaps: true }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: {
        y: { ticks: { callback: (v) => "R$ " + v.toFixed(2), font: { size: 10 } } },
        x: { grid: { display: false }, ticks: { font: { size: 10 } } }
      }
    }
  });
}

if (tabelaHistorico) {
  tabelaHistorico.addEventListener("change", async (e) => {
    if (!e.target.matches('input[data-tipo="dia"]')) return;
    const { data, fornecedor, produto } = e.target.closest("tr").dataset;
    const precoDia = e.target.value === "" ? null : parseFloat(e.target.value);
    if (precoDia !== null && (isNaN(precoDia) || precoDia < 0)) { toast("Preço do dia inválido.", "erro"); return; }
    await salvarCotacao(data, fornecedor, produto, precoDia);
    toast("Lançamento atualizado.", "sucesso");
    carregarHistorico();
  });

  tabelaHistorico.addEventListener("click", async (e) => {
    const btnExcluir = e.target.closest("button[data-excluir]");
    if (btnExcluir) {
      const ok = await confirmar("Excluir este lançamento do histórico?");
      if (!ok) return;
      await deleteDoc(doc(db, "cotacoes", btnExcluir.dataset.excluir));
      toast("Lançamento excluído.", "sucesso");
      carregarHistorico();
    }
  });
}
