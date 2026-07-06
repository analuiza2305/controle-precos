import { db } from "./firebase-config.js";
import {
  collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, orderBy, query
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { toast, confirmar } from "./utils.js";

const colecaoRef = collection(db, "fornecedores");

// Cache em memória, mantido atualizado via onSnapshot (tempo real)
export let fornecedores = [];
const ouvintes = [];
export function aoAtualizarFornecedores(cb) { ouvintes.push(cb); }

export function iniciarFornecedores() {
  const q = query(colecaoRef, orderBy("nome"));
  onSnapshot(q, (snap) => {
    fornecedores = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderizarTabelaFornecedores();
    ouvintes.forEach((cb) => cb(fornecedores));
  });
}

export function fornecedoresAtivos() {
  return fornecedores.filter((f) => f.ativo !== false);
}

async function criarFornecedor(nome) {
  await addDoc(colecaoRef, { nome: nome.trim(), ativo: true });
}

async function alternarAtivo(id, ativoAtual) {
  await updateDoc(doc(db, "fornecedores", id), { ativo: !ativoAtual });
}

async function excluirFornecedor(id) {
  await deleteDoc(doc(db, "fornecedores", id));
}

function renderizarTabelaFornecedores() {
  const tbody = document.getElementById("tabela-fornecedores");
  if (!tbody) return;
  if (fornecedores.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="color:var(--texto-fraco)">Nenhum fornecedor cadastrado ainda.</td></tr>`;
    return;
  }
  tbody.innerHTML = fornecedores.map((f) => `
    <tr>
      <td>${escapeHtml(f.nome)}</td>
      <td><span class="selo ${f.ativo !== false ? "selo-ativo" : "selo-inativo"}">${f.ativo !== false ? "Ativo" : "Inativo"}</span></td>
      <td style="text-align:right; display:flex; gap:6px; justify-content:flex-end;" class="somente-editor">
        <button class="btn-icone" data-acao="alternar" data-id="${f.id}" data-ativo="${f.ativo !== false}" title="${f.ativo !== false ? "Desativar" : "Ativar"}">⏻</button>
        <button class="btn-icone perigo" data-acao="excluir" data-id="${f.id}" title="Excluir">✕</button>
      </td>
    </tr>
  `).join("");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

document.getElementById("form-fornecedor").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("fornecedor-nome");
  const nome = input.value.trim();
  if (!nome) return;
  try {
    await criarFornecedor(nome);
    input.value = "";
    toast("Fornecedor adicionado.", "sucesso");
  } catch (err) {
    toast("Erro ao adicionar fornecedor.", "erro");
  }
});

document.getElementById("tabela-fornecedores").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-acao]");
  if (!btn) return;
  const { acao, id } = btn.dataset;
  if (acao === "alternar") {
    const ativo = btn.dataset.ativo === "true";
    await alternarAtivo(id, ativo);
    toast(ativo ? "Fornecedor desativado." : "Fornecedor ativado.", "sucesso");
  }
  if (acao === "excluir") {
    const ok = await confirmar("Excluir este fornecedor? Cotações já lançadas serão mantidas no histórico.");
    if (!ok) return;
    await excluirFornecedor(id);
    toast("Fornecedor excluído.", "sucesso");
  }
});
