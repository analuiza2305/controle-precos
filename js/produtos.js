import { db } from "./firebase-config.js";
import {
  collection, addDoc, doc, deleteDoc, onSnapshot, orderBy, query
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { toast, confirmar } from "./utils.js";

const colecaoRef = collection(db, "produtos");

export let produtos = [];
const ouvintes = [];
export function aoAtualizarProdutos(cb) { ouvintes.push(cb); }

export function iniciarProdutos() {
  const q = query(colecaoRef, orderBy("nome"));
  onSnapshot(q, (snap) => {
    produtos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderizarTabelaProdutos();
    ouvintes.forEach((cb) => cb(produtos));
  });
}

async function criarProduto(nome, categoria, unidade) {
  await addDoc(colecaoRef, { nome: nome.trim(), categoria, unidade });
}

async function excluirProduto(id) {
  await deleteDoc(doc(db, "produtos", id));
}

function renderizarTabelaProdutos() {
  const tbody = document.getElementById("tabela-produtos");
  if (!tbody) return;
  if (produtos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="color:var(--texto-fraco)">Nenhum produto cadastrado ainda.</td></tr>`;
    return;
  }
  tbody.innerHTML = produtos.map((p) => `
    <tr>
      <td data-label="Nome"><strong>${escapeHtml(p.nome)}</strong></td>
      <td data-label="Categoria">${escapeHtml(p.categoria || "-")}</td>
      <td data-label="Unidade">${escapeHtml(p.unidade || "-")}</td>
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
  const nome = input.value.trim();
  if (!nome) return;
  try {
    await criarProduto(nome, categoria, unidade);
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
