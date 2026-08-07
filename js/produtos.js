import { db } from "./firebase-config.js";
import {
  collection, addDoc, doc, deleteDoc, updateDoc, onSnapshot, orderBy, query
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { toast, confirmar } from "./utils.js";

const colecaoRef = collection(db, "produtos");

export let produtos = [];
const ouvintes = [];
export function aoAtualizarProdutos(cb) { ouvintes.push(cb); }

// Paleta de reserva: usada apenas quando o produto ainda não tem cor definida
// manualmente (compatibilidade com produtos cadastrados antes deste recurso).
const PALETA_PRODUTO = [
  "#1D5F91", "#0F9D58", "#C98A00", "#8E44AD",
  "#D93025", "#0E7C86", "#B8560A", "#4C6B8A"
];

// Cor de um produto: usa a cor escolhida pelo Editor (campo "cor"), com
// fallback automático (baseado no id) para produtos sem cor definida.
// Aceita tanto o id do produto quanto o objeto do produto.
export function corProduto(produtoOuId) {
  const p = typeof produtoOuId === "string"
    ? produtos.find((x) => x.id === produtoOuId)
    : produtoOuId;
  if (p && p.cor) return p.cor;
  const id = p ? p.id : produtoOuId;
  if (!id) return PALETA_PRODUTO[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETA_PRODUTO[hash % PALETA_PRODUTO.length];
}

export function iniciarProdutos() {
  const q = query(colecaoRef, orderBy("nome"));
  onSnapshot(q, (snap) => {
    produtos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderizarTabelaProdutos();
    ouvintes.forEach((cb) => cb(produtos));
  });
}

async function criarProduto(nome, categoria, unidade, cor) {
  await addDoc(colecaoRef, { nome: nome.trim(), categoria, unidade, cor: cor || null });
}

async function atualizarCorProduto(id, cor) {
  await updateDoc(doc(db, "produtos", id), { cor: cor || null });
}

async function excluirProduto(id) {
  await deleteDoc(doc(db, "produtos", id));
}

function renderizarTabelaProdutos() {
  const tbody = document.getElementById("tabela-produtos");
  if (!tbody) return;
  if (produtos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--texto-fraco)">Nenhum produto cadastrado ainda.</td></tr>`;
    return;
  }
  tbody.innerHTML = produtos.map((p) => `
    <tr>
      <td data-label="Nome"><span class="fornecedor-dot" style="background:${corProduto(p)}"></span><strong>${escapeHtml(p.nome)}</strong></td>
      <td data-label="Categoria">${escapeHtml(p.categoria || "-")}</td>
      <td data-label="Unidade">${escapeHtml(p.unidade || "-")}</td>
      <td data-label="Cor">
        <input type="color" class="input-cor-produto somente-editor" data-id="${p.id}" value="${p.cor || corProduto(p)}" title="Escolher cor do produto">
        <span class="cor-produto-somente-leitura visivel-visualizador" style="background:${corProduto(p)}"></span>
      </td>
      <td style="text-align:right;" class="somente-editor" data-label="">
        <button class="btn-icone perigo" data-id="${p.id}" title="Excluir">✕</button>
      </td>
    </tr>
  `).join("");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

document.getElementById("form-produto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("produto-nome");
  const categoria = document.getElementById("produto-categoria").value;
  const unidade = document.getElementById("produto-unidade").value;
  const corInput = document.getElementById("produto-cor");
  const nome = input.value.trim();
  if (!nome) return;
  try {
    await criarProduto(nome, categoria, unidade, corInput ? corInput.value : null);
    input.value = "";
    toast("Produto adicionado.", "sucesso");
  } catch (err) {
    toast("Erro ao adicionar produto.", "erro");
  }
});

document.getElementById("tabela-produtos").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  const ok = await confirmar("Excluir este produto? Cotações já lançadas serão mantidas no histórico.");
  if (!ok) return;
  await excluirProduto(btn.dataset.id);
  toast("Produto excluído.", "sucesso");
});

// Troca de cor de um produto já cadastrado (somente Editor vê este campo).
document.getElementById("tabela-produtos").addEventListener("change", async (e) => {
  const input = e.target.closest(".input-cor-produto");
  if (!input) return;
  try {
    await atualizarCorProduto(input.dataset.id, input.value);
    toast("Cor do produto atualizada.", "sucesso");
  } catch (err) {
    toast("Erro ao atualizar cor do produto.", "erro");
  }
});
