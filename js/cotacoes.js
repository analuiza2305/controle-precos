import { db } from "./firebase-config.js";
import {
  collection, doc, setDoc, deleteDoc, getDocs, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { fornecedores, fornecedoresAtivos, aoAtualizarFornecedores } from "./fornecedores.js";
import { produtos, aoAtualizarProdutos } from "./produtos.js";
import {
  toast, confirmar, formatarData, formatarPreco, hojeISO, corFornecedor,
  diferencaPreco, formatarPercentual, ehProdutoDestaque
} from "./utils.js";

const colecaoRef = collection(db, "cotacoes");

// ID determinístico evita duplicidade: 1 cotação por data+fornecedor+produto (upsert natural)
function idCotacao(data, fornecedorId, produtoId) {
  return `${data}__${fornecedorId}__${produtoId}`;
}

// `preco` = preço do dia (praticado/lançado). `precoPuxado` = preço de referência
// puxado da tabela do fornecedor, usado para medir o quanto o preço do dia se
// distanciou dele. Qualquer um dos dois pode ficar vazio; o documento só é
// removido quando os dois estão vazios.
export async function salvarCotacao(data, fornecedorId, produtoId, preco, precoPuxado) {
  const ref = doc(db, "cotacoes", idCotacao(data, fornecedorId, produtoId));
  const semPrecoDia = preco === null || preco === "" || preco === undefined || isNaN(preco);
  const semPrecoPuxado = precoPuxado === null || precoPuxado === "" || precoPuxado === undefined || isNaN(precoPuxado);

  if (semPrecoDia && semPrecoPuxado) {
    await deleteDoc(ref).catch(() => {});
    return;
  }

  await setDoc(ref, {
    data, fornecedorId, produtoId,
    preco: semPrecoDia ? null : Number(preco),
    precoPuxado: semPrecoPuxado ? null : Number(precoPuxado),
    atualizadoEm: new Date().toISOString()
  }, { merge: true });
}

export async function buscarCotacoesPorData(data) {
  const q = query(colecaoRef, where("data", "==", data));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Busca um lote recente (para histórico); filtragem fina é feita no cliente
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
// LANÇAMENTO DIÁRIO
// ============================================================
const inputData = document.getElementById("lanc-data");
const thead = document.getElementById("lancamento-thead-row");
const tbody = document.getElementById("lancamento-tbody");
const statusEl = document.getElementById("lancamento-status");
const btnSalvarTudo = document.getElementById("btn-salvar-lancamento");

inputData.value = hojeISO();
inputData.addEventListener("change", montarGradeLancamento);
aoAtualizarFornecedores(montarGradeLancamento);
aoAtualizarProdutos(montarGradeLancamento);

async function montarGradeLancamento() {
  const forns = fornecedoresAtivos();
  if (produtos.length === 0 || forns.length === 0) {
    thead.innerHTML = "<th>Produto</th>";
    tbody.innerHTML = `<tr><td style="color:var(--texto-fraco)">Cadastre ao menos um produto e um fornecedor ativo para lançar preços.</td></tr>`;
    return;
  }

  thead.innerHTML = "<th>Produto</th>" + forns.map((f) => `
    <th style="border-top:3px solid ${corFornecedor(f.id)}">
      <span class="fornecedor-dot" style="background:${corFornecedor(f.id)}"></span>${f.nome}
    </th>`).join("");

  const data = inputData.value || hojeISO();
  const existentes = await buscarCotacoesPorData(data);
  const mapa = {};
  existentes.forEach((c) => { mapa[`${c.fornecedorId}__${c.produtoId}`] = c; });

  tbody.innerHTML = produtos.map((p) => `
    <tr data-linha-produto="${p.id}" ${ehProdutoDestaque(p.nome) ? 'class="linha-produto-destaque"' : ""}>
      <td><strong>${p.nome}</strong>${ehProdutoDestaque(p.nome) ? '<span class="mini-tag-destaque">destaque</span>' : ""}</td>
      ${forns.map((f) => {
        const cot = mapa[`${f.id}__${p.id}`];
        const valorDia = cot?.preco ?? null;
        const valorPuxado = cot?.precoPuxado ?? null;
        const estado = estadoDaCelula(valorDia, valorPuxado);
        return `<td class="cel-precos">
          <div class="preco-puxado-wrap" data-estado="${estado}" data-produto="${p.id}" data-fornecedor="${f.id}">
            <div class="preco-linha">
              <input type="number" step="0.001" min="0" placeholder="0,000"
                data-tipo="dia" class="input-preco-dia ${valorDia !== null ? "preenchido" : ""}"
                value="${valorDia !== null ? valorDia : ""}">
              <button type="button" class="btn-puxado" data-acao="abrir-puxado" title="Informar preço puxado">
                Puxado<span class="btn-puxado-badge"></span>
              </button>
            </div>
            <div class="puxado-pergunta">
              <span>Puxado foi pelo mesmo valor?</span>
              <button type="button" class="btn-mini" data-resp="sim">Sim</button>
              <button type="button" class="btn-mini btn-mini-alt" data-resp="nao">Não</button>
            </div>
            <div class="puxado-valor">
              <input type="number" step="0.001" min="0" placeholder="Valor puxado"
                data-tipo="puxado" class="input-preco-puxado"
                value="${estado === "diferente" && valorPuxado !== null ? valorPuxado : ""}">
            </div>
          </div>
        </td>`;
      }).join("")}
    </tr>
  `).join("");

  destacarMenoresPrecos();
}

// Determina o "estado" visual da célula a partir dos valores salvos:
// vazio (sem puxado informado) · igual (puxado == dia) · diferente (divergência)
function estadoDaCelula(dia, puxado) {
  if (puxado === null || puxado === undefined || isNaN(puxado)) return "vazio";
  if (dia !== null && dia !== undefined && !isNaN(dia) && Number(puxado) === Number(dia)) return "igual";
  return "diferente";
}

// Realce ao vivo: enquanto o usuário digita, marca o menor preço do dia da linha (produto)
function destacarMenoresPrecos() {
  tbody.querySelectorAll("tr[data-linha-produto]").forEach((tr) => {
    const inputs = [...tr.querySelectorAll('input[data-tipo="dia"]')];
    const valores = inputs
      .map((i) => ({ input: i, valor: parseFloat(i.value) }))
      .filter((x) => !isNaN(x.valor));
    inputs.forEach((i) => i.classList.remove("menor-preco-linha"));
    if (valores.length < 2) return;
    const menor = Math.min(...valores.map((v) => v.valor));
    valores.filter((v) => v.valor === menor).forEach((v) => v.input.classList.add("menor-preco-linha"));
  });
}

tbody.addEventListener("input", (e) => {
  if (e.target.matches('input[data-tipo="dia"]')) {
    destacarMenoresPrecos();
    // Se o puxado estiver marcado como "igual", mantém os dois sincronizados
    // enquanto o usuário digita o preço do dia.
    const wrap = e.target.closest(".preco-puxado-wrap");
    if (wrap && wrap.dataset.estado === "igual") {
      wrap.querySelector('input[data-tipo="puxado"]').value = e.target.value;
    }
  }
});

// Clique no botão "Puxado" ou nas respostas Sim/Não
tbody.addEventListener("click", async (e) => {
  const btnAbrir = e.target.closest('[data-acao="abrir-puxado"]');
  if (btnAbrir) {
    const wrap = btnAbrir.closest(".preco-puxado-wrap");
    wrap.dataset.estado = "pergunta";
    return;
  }

  const btnResp = e.target.closest("[data-resp]");
  if (btnResp) {
    const wrap = btnResp.closest(".preco-puxado-wrap");
    const inputDia = wrap.querySelector('input[data-tipo="dia"]');
    const inputPuxado = wrap.querySelector('input[data-tipo="puxado"]');

    if (btnResp.dataset.resp === "sim") {
      inputPuxado.value = inputDia.value;
      wrap.dataset.estado = "igual";
      await salvarCelula(wrap);
    } else {
      inputPuxado.value = "";
      wrap.dataset.estado = "diferente";
      inputPuxado.focus();
    }
    return;
  }
});

// Salva preço do dia + preço puxado de uma célula (usado pelo blur e pelas respostas Sim/Não)
async function salvarCelula(wrap) {
  const data = inputData.value || hojeISO();
  const { produto, fornecedor } = wrap.dataset;
  const inputDia = wrap.querySelector('input[data-tipo="dia"]');
  const inputPuxado = wrap.querySelector('input[data-tipo="puxado"]');
  const preco = inputDia.value === "" ? null : parseFloat(inputDia.value);
  const precoPuxado = inputPuxado.value === "" ? null : parseFloat(inputPuxado.value);
  try {
    await salvarCotacao(data, fornecedor, produto, preco, precoPuxado);
    inputDia.classList.toggle("preenchido", preco !== null);
    wrap.dataset.estado = estadoDaCelula(preco, precoPuxado);
    statusEl.textContent = "Salvo automaticamente ✓";
    statusEl.classList.add("ok");
    setTimeout(() => { statusEl.textContent = ""; statusEl.classList.remove("ok"); }, 2200);
  } catch (err) {
    toast("Erro ao salvar preço.", "erro");
  }
}

tbody.addEventListener("blur", async (e) => {
  const input = e.target.closest('input[data-tipo]');
  if (!input) return;
  const wrap = input.closest(".preco-puxado-wrap");
  if (!wrap) return;
  await salvarCelula(wrap);
}, true);

btnSalvarTudo.addEventListener("click", async () => {
  const wraps = [...tbody.querySelectorAll(".preco-puxado-wrap")];
  const data = inputData.value || hojeISO();
  btnSalvarTudo.disabled = true;
  btnSalvarTudo.textContent = "Salvando...";
  try {
    await Promise.all(wraps.map((wrap) => {
      const inputDia = wrap.querySelector('input[data-tipo="dia"]');
      const inputPuxado = wrap.querySelector('input[data-tipo="puxado"]');
      const preco = inputDia.value === "" ? null : parseFloat(inputDia.value);
      const precoPuxado = inputPuxado.value === "" ? null : parseFloat(inputPuxado.value);
      return salvarCotacao(data, wrap.dataset.fornecedor, wrap.dataset.produto, preco, precoPuxado);
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

// ============================================================
// COMPARATIVO / RANKING
// ============================================================
const compData = document.getElementById("comp-data");
const painelComparativo = document.getElementById("painel-comparativo");
compData.value = hojeISO();
compData.addEventListener("change", montarComparativo);

export async function montarComparativo() {
  const data = compData.value || hojeISO();
  const cotacoes = await buscarCotacoesPorData(data);

  if (produtos.length === 0) {
    painelComparativo.innerHTML = `<p style="color:var(--texto-fraco)">Cadastre produtos para visualizar o comparativo.</p>`;
    return;
  }

  painelComparativo.innerHTML = montarFaixaDestaques(cotacoes, data) + produtos.map((p) => {
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
      const diff = diferencaPreco(c.preco, c.precoPuxado);
      const diffHtml = diff
        ? `<span class="${diff.valor <= 0 ? "diferenca-boa" : "diferenca-ruim"}">${formatarPreco(diff.valor)} · ${formatarPercentual(diff.percentual)}</span>`
        : `<span style="color:var(--texto-fraco)">—</span>`;
      return `<tr class="${classe}">
        <td data-label="Rank"><span class="${rankClasse}">${i + 1}º</span></td>
        <td data-label="Fornecedor"><span class="fornecedor-dot" style="background:${corFornecedor(c.fornecedorId)}"></span>${nomeFornecedor(c.fornecedorId)}</td>
        <td class="preco" data-label="Preço do dia">${formatarPreco(c.preco)}</td>
        <td class="preco" data-label="Preço puxado">${formatarPreco(c.precoPuxado)}</td>
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
          <thead><tr><th>Rank</th><th>Fornecedor</th><th>Preço do dia</th><th>Preço puxado</th><th>Dia × puxado</th><th></th></tr></thead>
          <tbody>${linhasHtml}</tbody>
        </table>
      </div>`;
  }).join("");
}

// Faixa de destaque no topo do comparativo com o melhor preço do dia para os
// produtos identificados como S10 / S500 (por nome).
function montarFaixaDestaques(cotacoes, data) {
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
    const diff = diferencaPreco(melhor.preco, melhor.precoPuxado);
    return `<div class="destaque-card">
      <span class="destaque-tag">${p.nome}</span>
      <div class="destaque-valor">${formatarPreco(melhor.preco)}</div>
      <div class="destaque-sub"><span class="fornecedor-dot" style="background:${corFornecedor(melhor.fornecedorId)}"></span>${nomeFornecedor(melhor.fornecedorId)}</div>
      ${diff ? `<div class="destaque-diff ${diff.valor <= 0 ? "boa" : "ruim"}">vs. puxado: ${formatarPreco(diff.valor)} (${formatarPercentual(diff.percentual)})</div>` : ""}
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

const primeiroDiaMes = new Date();
primeiroDiaMes.setDate(1);
histDataInicio.value = primeiroDiaMes.toISOString().slice(0, 10);
histDataFim.value = hojeISO();

aoAtualizarFornecedores(() => preencherSelect(histFornecedor, fornecedores, "Todos"));
aoAtualizarProdutos(() => preencherSelect(histProduto, produtos, "Todos"));

function preencherSelect(select, itens, textoTodos) {
  const atual = select.value;
  select.innerHTML = `<option value="">${textoTodos}</option>` + itens.map((i) => `<option value="${i.id}">${i.nome}</option>`).join("");
  select.value = atual;
}

let graficoHistorico = null;

btnFiltrarHistorico.addEventListener("click", carregarHistorico);

export async function carregarHistorico() {
  tabelaHistorico.innerHTML = `<tr><td colspan="7" style="color:var(--texto-fraco)">Carregando...</td></tr>`;
  const todas = await buscarCotacoesRecentes(2000);
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

  montarGraficoHistorico(filtradas);

  if (filtradas.length === 0) {
    tabelaHistorico.innerHTML = `<tr><td colspan="7"><div class="estado-vazio">Nenhum lançamento encontrado para os filtros selecionados.</div></td></tr>`;
    return;
  }

  tabelaHistorico.innerHTML = filtradas.map((c) => {
    const diff = diferencaPreco(c.preco, c.precoPuxado);
    const diffHtml = diff
      ? `<span class="${diff.valor <= 0 ? "diferenca-boa" : "diferenca-ruim"}">${formatarPreco(diff.valor)} · ${formatarPercentual(diff.percentual)}</span>`
      : `<span style="color:var(--texto-fraco)">—</span>`;
    return `
    <tr>
      <td class="col-data" data-label="Data">${formatarData(c.data)}</td>
      <td data-label="Fornecedor"><span class="fornecedor-dot" style="background:${corFornecedor(c.fornecedorId)}"></span>${nomeFornecedor(c.fornecedorId)}</td>
      <td data-label="Produto">${nomeProduto(c.produtoId)}</td>
      <td class="col-preco" data-label="Preço do dia">
        <input type="number" step="0.001" value="${c.preco !== null && c.preco !== undefined ? c.preco : ""}"
          data-id="${c.id}" data-tipo="dia"
          data-data="${c.data}" data-fornecedor="${c.fornecedorId}" data-produto="${c.produtoId}"
          class="input-preco-historico">
      </td>
      <td class="col-preco" data-label="Preço puxado">
        <input type="number" step="0.001" value="${c.precoPuxado !== null && c.precoPuxado !== undefined ? c.precoPuxado : ""}"
          data-id="${c.id}" data-tipo="puxado"
          data-data="${c.data}" data-fornecedor="${c.fornecedorId}" data-produto="${c.produtoId}"
          class="input-preco-historico input-preco-puxado">
      </td>
      <td data-label="Dia × puxado">${diffHtml}</td>
      <td class="col-acao somente-editor" data-label="">
        <button class="btn-icone perigo" data-excluir="${c.id}" title="Excluir">✕</button>
      </td>
    </tr>
  `;
  }).join("");
}

// Agrupa os registros filtrados por data e desenha a evolução do melhor preço
// do dia e da média do preço puxado ao longo do período consultado.
function montarGraficoHistorico(registros) {
  const canvas = document.getElementById("grafico-historico");
  const painel = document.getElementById("painel-grafico-historico");
  if (!canvas || !painel) return;

  const porData = {};
  registros.forEach((c) => {
    if (!porData[c.data]) porData[c.data] = { dia: [], puxado: [] };
    if (c.preco !== null && c.preco !== undefined && !isNaN(c.preco)) porData[c.data].dia.push(c.preco);
    if (c.precoPuxado !== null && c.precoPuxado !== undefined && !isNaN(c.precoPuxado)) porData[c.data].puxado.push(c.precoPuxado);
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

tabelaHistorico.addEventListener("change", async (e) => {
  const input = e.target.closest("input[data-tipo]");
  if (!input) return;
  const tr = input.closest("tr");
  const inputDia = tr.querySelector('input[data-tipo="dia"]');
  const inputPuxado = tr.querySelector('input[data-tipo="puxado"]');
  const { data, fornecedor, produto } = input.dataset;
  const precoDia = inputDia.value === "" ? null : parseFloat(inputDia.value);
  const precoPuxado = inputPuxado.value === "" ? null : parseFloat(inputPuxado.value);
  if (precoDia !== null && (isNaN(precoDia) || precoDia < 0)) { toast("Preço do dia inválido.", "erro"); return; }
  if (precoPuxado !== null && (isNaN(precoPuxado) || precoPuxado < 0)) { toast("Preço puxado inválido.", "erro"); return; }
  await salvarCotacao(data, fornecedor, produto, precoDia, precoPuxado);
  toast("Lançamento atualizado.", "sucesso");
  carregarHistorico();
});

tabelaHistorico.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-excluir]");
  if (!btn) return;
  const ok = await confirmar("Excluir este lançamento do histórico?");
  if (!ok) return;
  await deleteDoc(doc(db, "cotacoes", btn.dataset.excluir));
  toast("Lançamento excluído.", "sucesso");
  carregarHistorico();
});
