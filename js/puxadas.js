import { db } from "./firebase-config.js";
import {
  collection, doc, setDoc, deleteDoc, getDocs, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { fornecedores, fornecedoresAtivos, aoAtualizarFornecedores } from "./fornecedores.js";
import { produtos, aoAtualizarProdutos, corProduto } from "./produtos.js";
import { buscarCotacoesPorData } from "./cotacoes-novo.js";
import {
  toast, confirmar, formatarPreco, formatarLitros, hojeISO, corFornecedor
} from "./utils.js";

const colecaoRef = collection(db, "puxadas");

function idPuxada(data, fornecedorId, produtoId, timestamp = Date.now()) {
  return `${data}__${fornecedorId}__${produtoId}__${timestamp}`;
}

export async function salvarPuxada(data, fornecedorId, produtoId, preco, volumeLitros, justificativa, id = null) {
  if (preco === null || preco === "" || preco === undefined || isNaN(preco)) {
    toast("Preço da puxada é obrigatório.", "erro");
    return null;
  }
  if (!justificativa || justificativa.trim() === "") {
    toast("A justificativa é obrigatória.", "erro");
    return null;
  }

  const novoId = id || idPuxada(data, fornecedorId, produtoId);
  const ref = doc(db, "puxadas", novoId);
  
  await setDoc(ref, {
    data,
    fornecedorId,
    produtoId,
    preco: Number(preco),
    volumeLitros: (volumeLitros === null || volumeLitros === "" || volumeLitros === undefined || isNaN(volumeLitros))
      ? null : Number(volumeLitros),
    justificativa: justificativa.trim(),
    atualizadoEm: new Date().toISOString()
  }, { merge: true });
  
  return novoId;
}

export async function buscarPuxadasPorData(data) {
  const q = query(colecaoRef, where("data", "==", data));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function buscarPuxadasPorFornecedorProdutoData(data, fornecedorId, produtoId) {
  const q = query(
    colecaoRef,
    where("data", "==", data),
    where("fornecedorId", "==", fornecedorId),
    where("produtoId", "==", produtoId),
    orderBy("atualizadoEm", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function buscarPuxadasRecentes(max = 2000) {
  const q = query(colecaoRef, orderBy("data", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function deletarPuxada(id) {
  await deleteDoc(doc(db, "puxadas", id)).catch(() => {});
}

export function resumoPuxadas(puxadas) {
  if (!puxadas || puxadas.length === 0) return null;
  const precos = puxadas.map((p) => p.preco);
  const comVolume = puxadas.filter((p) => p.volumeLitros !== null && p.volumeLitros !== undefined && p.volumeLitros > 0);
  const volumeTotal = comVolume.reduce((s, p) => s + p.volumeLitros, 0);
  const menor = Math.min(...precos);
  const mediaSimples = precos.reduce((a, b) => a + b, 0) / precos.length;
  const mediaPonderada = comVolume.length > 0
    ? comVolume.reduce((s, p) => s + p.preco * p.volumeLitros, 0) / volumeTotal
    : null;
  return {
    quantidade: puxadas.length,
    menor,
    mediaSimples,
    referencia: mediaPonderada !== null ? mediaPonderada : mediaSimples,
    volumeTotal: volumeTotal > 0 ? volumeTotal : null
  };
}

// ============================================================
// TELA "LANÇAR PUXADAS" — versão simplificada
// Um formulário único para registrar cada compra (fornecedor,
// produto, preço, quantidade e motivo) + uma lista das compras
// do dia, com edição e exclusão. Substitui a antiga grade
// matricial (produto × fornecedor) com múltiplas linhas por célula.
// ============================================================
const inputData = document.getElementById("puxada-data");
const resumoGrid = document.getElementById("puxadas-resumo-grid");
const filtroProduto = document.getElementById("puxada-filtro-produto");
const listaTbody = document.getElementById("puxada-lista-tbody");
const statusEl = document.getElementById("puxada-status");

const formEl = document.getElementById("form-puxada");
const formTitulo = document.getElementById("puxada-form-titulo");
const selectFornecedor = document.getElementById("puxada-form-fornecedor");
const selectProduto = document.getElementById("puxada-form-produto");
const inputPreco = document.getElementById("puxada-form-preco");
const inputLitros = document.getElementById("puxada-form-litros");
const inputMotivo = document.getElementById("puxada-form-motivo");
const dicaEl = document.getElementById("puxada-form-dica");
const btnAdd = document.getElementById("btn-add-puxada");
const btnCancelarEdicao = document.getElementById("btn-cancelar-edicao-puxada");

let edicaoAtualId = null;
let cotacoesDoDiaCache = [];
let puxadasDoDiaCache = [];

if (inputData) {
  inputData.value = hojeISO();
  inputData.addEventListener("change", () => { cancelarEdicao(); carregarPuxadas(); });
  aoAtualizarFornecedores(() => { montarSelects(); carregarPuxadas(); });
  aoAtualizarProdutos(() => { montarSelects(); carregarPuxadas(); });
}

function montarSelects() {
  const forns = fornecedoresAtivos();

  if (selectFornecedor) {
    const atual = selectFornecedor.value;
    selectFornecedor.innerHTML = forns.length
      ? forns.map((f) => `<option value="${f.id}">${f.nome}</option>`).join("")
      : `<option value="">Cadastre um fornecedor</option>`;
    if (atual && forns.some((f) => f.id === atual)) selectFornecedor.value = atual;
  }

  if (selectProduto) {
    const atual = selectProduto.value;
    selectProduto.innerHTML = produtos.length
      ? produtos.map((p) => `<option value="${p.id}">${p.nome}</option>`).join("")
      : `<option value="">Cadastre um produto</option>`;
    if (atual && produtos.some((p) => p.id === atual)) selectProduto.value = atual;
  }

  if (filtroProduto) {
    const atual = filtroProduto.value;
    filtroProduto.innerHTML = `<option value="">Todos os produtos</option>` +
      produtos.map((p) => `<option value="${p.id}">${p.nome}</option>`).join("");
    if (atual) filtroProduto.value = atual;
  }

  atualizarDica();
}

function montarResumo(puxadasDoDia) {
  if (!resumoGrid) return;

  const total = puxadasDoDia.length;
  const volumeTotal = puxadasDoDia.reduce((s, p) => s + (p.volumeLitros || 0), 0);
  const resumo = resumoPuxadas(puxadasDoDia);

  resumoGrid.innerHTML = `
    <div class="resumo-card">
      <span class="resumo-icone">🚚</span>
      <div class="resumo-textos">
        <span class="resumo-label">Compras registradas (dia)</span>
        <div class="resumo-valor">${total}<span class="resumo-unidade">compra${total === 1 ? "" : "s"}</span></div>
      </div>
    </div>
    <div class="resumo-card">
      <span class="resumo-icone icone-azul">💧</span>
      <div class="resumo-textos">
        <span class="resumo-label">Volume total (dia)</span>
        <div class="resumo-valor">${formatarLitros(volumeTotal)}<span class="resumo-unidade">L</span></div>
      </div>
    </div>
    <div class="resumo-card">
      <span class="resumo-icone icone-verde">💲</span>
      <div class="resumo-textos">
        <span class="resumo-label">Preço do dia (todas as compras)</span>
        <div class="resumo-valor">${resumo ? formatarPreco(resumo.referencia) : "—"}<span class="resumo-unidade">R$ / L</span></div>
      </div>
    </div>
  `;
}

function nomeForn(id) { return fornecedores.find((f) => f.id === id)?.nome || "(removido)"; }
function nomeProd(id) { return produtos.find((p) => p.id === id)?.nome || "(removido)"; }

function montarLista() {
  if (!listaTbody) return;

  if (puxadasDoDiaCache.length === 0) {
    listaTbody.innerHTML = `<tr><td colspan="6" style="color:var(--texto-fraco); text-align:center; padding:20px;">Nenhuma compra registrada neste dia.</td></tr>`;
    return;
  }

  const alvo = filtroProduto?.value || "";
  const filtradas = alvo ? puxadasDoDiaCache.filter((p) => p.produtoId === alvo) : puxadasDoDiaCache;

  if (filtradas.length === 0) {
    listaTbody.innerHTML = `<tr><td colspan="6" style="color:var(--texto-fraco); text-align:center; padding:20px;">Nenhuma compra para este produto.</td></tr>`;
    return;
  }

  const ordenadas = [...filtradas].sort((a, b) => {
    const nomeA = nomeProd(a.produtoId), nomeB = nomeProd(b.produtoId);
    if (nomeA !== nomeB) return nomeA.localeCompare(nomeB, "pt-BR");
    return (b.atualizadoEm || "").localeCompare(a.atualizadoEm || "");
  });

  listaTbody.innerHTML = ordenadas.map((p) => `
    <tr data-id="${p.id}" style="border-left:4px solid ${corProduto(p.produtoId)}">
      <td data-label="Produto"><span class="fornecedor-dot" style="background:${corProduto(p.produtoId)}"></span><strong>${nomeProd(p.produtoId)}</strong></td>
      <td data-label="Fornecedor"><span class="fornecedor-dot" style="background:${corFornecedor(p.fornecedorId)}"></span>${nomeForn(p.fornecedorId)}</td>
      <td class="preco" data-label="Preço">${formatarPreco(p.preco)}</td>
      <td data-label="Quantidade">${p.volumeLitros ? formatarLitros(p.volumeLitros) : "—"}</td>
      <td data-label="Motivo" class="col-motivo-puxada" title="${(p.justificativa || "").replace(/"/g, "&quot;")}">${p.justificativa || "—"}</td>
      <td data-label="" class="col-acao somente-editor">
        <button type="button" class="btn-icone" data-acao="editar" title="Editar">✎</button>
        <button type="button" class="btn-icone perigo" data-acao="excluir" title="Excluir">✕</button>
      </td>
    </tr>
  `).join("");
}

async function carregarPuxadas() {
  const data = inputData.value || hojeISO();
  if (listaTbody) listaTbody.innerHTML = `<tr><td colspan="6" style="color:var(--texto-fraco)">Carregando...</td></tr>`;

  const [puxadasDoDia, cotacoesDoDia] = await Promise.all([
    buscarPuxadasPorData(data),
    buscarCotacoesPorData(data).catch(() => [])
  ]);

  puxadasDoDiaCache = puxadasDoDia;
  cotacoesDoDiaCache = cotacoesDoDia;

  montarResumo(puxadasDoDia);
  montarLista();
  atualizarDica();
}

// Mostra a melhor cotação do dia para o produto selecionado, como referência
function atualizarDica() {
  if (!dicaEl || !selectProduto) return;
  const produtoId = selectProduto.value;
  const doProduto = cotacoesDoDiaCache.filter((c) => c.produtoId === produtoId && c.preco !== null && c.preco !== undefined);
  if (!produtoId || doProduto.length === 0) {
    dicaEl.textContent = "";
    return;
  }
  const melhor = doProduto.reduce((m, c) => (c.preco < m.preco ? c : m), doProduto[0]);
  dicaEl.textContent = `Melhor cotação hoje: ${formatarPreco(melhor.preco)} (${nomeForn(melhor.fornecedorId)})`;
}

if (selectProduto) selectProduto.addEventListener("change", atualizarDica);
if (filtroProduto) filtroProduto.addEventListener("change", montarLista);

function preencherFormParaEdicao(puxada) {
  edicaoAtualId = puxada.id;
  selectFornecedor.value = puxada.fornecedorId;
  selectProduto.value = puxada.produtoId;
  inputPreco.value = puxada.preco ?? "";
  inputLitros.value = puxada.volumeLitros ?? "";
  inputMotivo.value = puxada.justificativa || "";
  formTitulo.textContent = "Editar compra";
  btnAdd.textContent = "Salvar alterações";
  btnCancelarEdicao.classList.remove("oculto");
  atualizarDica();
  formEl.scrollIntoView({ behavior: "smooth", block: "start" });
  inputPreco.focus();
}

function cancelarEdicao() {
  edicaoAtualId = null;
  formEl.reset();
  formTitulo.textContent = "Registrar compra";
  btnAdd.textContent = "+ Registrar compra";
  btnCancelarEdicao.classList.add("oculto");
  atualizarDica();
}

if (btnCancelarEdicao) {
  btnCancelarEdicao.addEventListener("click", cancelarEdicao);
}

if (formEl) {
  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = inputData.value || hojeISO();
    const fornecedorId = selectFornecedor.value;
    const produtoId = selectProduto.value;
    const preco = inputPreco.value;
    const litros = inputLitros.value;
    const motivo = inputMotivo.value;

    if (!fornecedorId || !produtoId) {
      toast("Selecione fornecedor e produto.", "erro");
      return;
    }

    btnAdd.disabled = true;
    try {
      const id = await salvarPuxada(data, fornecedorId, produtoId, preco, litros, motivo, edicaoAtualId);
      if (!id) return; // salvarPuxada já mostrou o toast de erro (preço/motivo faltando)

      toast(edicaoAtualId ? "Compra atualizada." : "Compra registrada.", "sucesso");

      const eraEdicao = !!edicaoAtualId;
      edicaoAtualId = null;
      formTitulo.textContent = "Registrar compra";
      btnAdd.textContent = "+ Registrar compra";
      btnCancelarEdicao.classList.add("oculto");

      if (eraEdicao) {
        formEl.reset();
      } else {
        // Mantém fornecedor e produto selecionados para agilizar o próximo lançamento
        inputPreco.value = "";
        inputLitros.value = "";
        inputMotivo.value = "";
        inputPreco.focus();
      }

      await carregarPuxadas();
    } finally {
      btnAdd.disabled = false;
    }
  });
}

if (listaTbody) {
  listaTbody.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    const id = tr.dataset.id;
    const puxada = puxadasDoDiaCache.find((p) => p.id === id);
    if (!puxada) return;

    if (e.target.closest('[data-acao="editar"]')) {
      preencherFormParaEdicao(puxada);
      return;
    }

    if (e.target.closest('[data-acao="excluir"]')) {
      const ok = await confirmar("Excluir esta compra?");
      if (!ok) return;
      await deletarPuxada(id);
      toast("Compra excluída.", "sucesso");
      if (edicaoAtualId === id) cancelarEdicao();
      await carregarPuxadas();
    }
  });
}
