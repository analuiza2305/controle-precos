import { db } from "./firebase-config.js";
import {
  collection, doc, setDoc, deleteDoc, getDocs, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { fornecedores, fornecedoresAtivos, aoAtualizarFornecedores } from "./fornecedores.js";
import { produtos, aoAtualizarProdutos } from "./produtos.js";
import { toast, confirmar, formatarData, formatarPreco, hojeISO, corFornecedor } from "./utils.js";

const colecaoRef = collection(db, "cotacoes");

// ID determinístico evita duplicidade: 1 cotação por data+fornecedor+produto (upsert natural)
function idCotacao(data, fornecedorId, produtoId) {
  return `${data}__${fornecedorId}__${produtoId}`;
}

export async function salvarCotacao(data, fornecedorId, produtoId, preco) {
  const ref = doc(db, "cotacoes", idCotacao(data, fornecedorId, produtoId));
  if (preco === null || preco === "" || isNaN(preco)) {
    await deleteDoc(ref).catch(() => {});
    return;
  }
  await setDoc(ref, {
    data, fornecedorId, produtoId,
    preco: Number(preco),
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
  existentes.forEach((c) => { mapa[`${c.fornecedorId}__${c.produtoId}`] = c.preco; });

  tbody.innerHTML = produtos.map((p) => `
    <tr data-linha-produto="${p.id}">
      <td><strong>${p.nome}</strong></td>
      ${forns.map((f) => {
        const valor = mapa[`${f.id}__${p.id}`];
        return `<td><input type="number" step="0.001" min="0" placeholder="0,000"
          data-produto="${p.id}" data-fornecedor="${f.id}"
          class="${valor !== undefined ? "preenchido" : ""}"
          value="${valor !== undefined ? valor : ""}"></td>`;
      }).join("")}
    </tr>
  `).join("");

  destacarMenoresPrecos();
}

// Realce ao vivo: enquanto o usuário digita, marca o menor preço da linha (produto)
function destacarMenoresPrecos() {
  tbody.querySelectorAll("tr[data-linha-produto]").forEach((tr) => {
    const inputs = [...tr.querySelectorAll("input[data-produto]")];
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
  if (e.target.matches("input[data-produto]")) destacarMenoresPrecos();
});

tbody.addEventListener("blur", async (e) => {
  const input = e.target.closest("input[data-produto]");
  if (!input) return;
  const data = inputData.value || hojeISO();
  const { produto, fornecedor } = input.dataset;
  const preco = input.value === "" ? null : parseFloat(input.value);
  try {
    await salvarCotacao(data, fornecedor, produto, preco);
    input.classList.toggle("preenchido", preco !== null);
    statusEl.textContent = "Salvo automaticamente ✓";
    statusEl.classList.add("ok");
    setTimeout(() => { statusEl.textContent = ""; statusEl.classList.remove("ok"); }, 2200);
  } catch (err) {
    toast("Erro ao salvar preço.", "erro");
  }
}, true);

btnSalvarTudo.addEventListener("click", async () => {
  const inputs = [...tbody.querySelectorAll("input[data-produto]")];
  const data = inputData.value || hojeISO();
  btnSalvarTudo.disabled = true;
  btnSalvarTudo.textContent = "Salvando...";
  try {
    await Promise.all(inputs.map((input) => {
      const preco = input.value === "" ? null : parseFloat(input.value);
      return salvarCotacao(data, input.dataset.fornecedor, input.dataset.produto, preco);
    }));
    toast("Lançamentos do dia salvos com sucesso.", "sucesso");
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

  painelComparativo.innerHTML = produtos.map((p) => {
    const linhas = cotacoes
      .filter((c) => c.produtoId === p.id)
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
      return `<tr class="${classe}">
        <td data-label="Rank"><span class="${rankClasse}">${i + 1}º</span></td>
        <td data-label="Fornecedor"><span class="fornecedor-dot" style="background:${corFornecedor(c.fornecedorId)}"></span>${nomeFornecedor(c.fornecedorId)}</td>
        <td class="preco" data-label="Preço">${formatarPreco(c.preco)}</td>
        <td data-label="">${selo}</td>
      </tr>`;
    }).join("");

    return `
      <div class="produto-titulo">
        <h3>${p.nome}</h3>
        <span class="produto-titulo-tag">Variação do dia: ${formatarPreco(max - min)}</span>
      </div>
      <div class="tabela-wrap" style="margin-bottom:30px;">
        <table class="tabela">
          <thead><tr><th>Rank</th><th>Fornecedor</th><th>Preço</th><th></th></tr></thead>
          <tbody>${linhasHtml}</tbody>
        </table>
      </div>`;
  }).join("");
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

btnFiltrarHistorico.addEventListener("click", carregarHistorico);

export async function carregarHistorico() {
  tabelaHistorico.innerHTML = `<tr><td colspan="5" style="color:var(--texto-fraco)">Carregando...</td></tr>`;
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

  if (filtradas.length === 0) {
    tabelaHistorico.innerHTML = `<tr><td colspan="5"><div class="estado-vazio">Nenhum lançamento encontrado para os filtros selecionados.</div></td></tr>`;
    return;
  }

  tabelaHistorico.innerHTML = filtradas.map((c) => `
    <tr>
      <td class="col-data" data-label="Data">${formatarData(c.data)}</td>
      <td data-label="Fornecedor"><span class="fornecedor-dot" style="background:${corFornecedor(c.fornecedorId)}"></span>${nomeFornecedor(c.fornecedorId)}</td>
      <td data-label="Produto">${nomeProduto(c.produtoId)}</td>
      <td class="col-preco" data-label="Preço">
        <input type="number" step="0.001" value="${c.preco}" data-editar="${c.id}"
          data-data="${c.data}" data-fornecedor="${c.fornecedorId}" data-produto="${c.produtoId}"
          class="input-preco-historico">
      </td>
      <td class="col-acao somente-editor" data-label="">
        <button class="btn-icone perigo" data-excluir="${c.id}" title="Excluir">✕</button>
      </td>
    </tr>
  `).join("");
}

tabelaHistorico.addEventListener("change", async (e) => {
  const input = e.target.closest("input[data-editar]");
  if (!input) return;
  const { data, fornecedor, produto } = input.dataset;
  const novoPreco = parseFloat(input.value);
  if (isNaN(novoPreco) || novoPreco < 0) { toast("Preço inválido.", "erro"); return; }
  await salvarCotacao(data, fornecedor, produto, novoPreco);
  toast("Lançamento atualizado.", "sucesso");
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
