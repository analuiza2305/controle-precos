import { db, auth } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { produtos, aoAtualizarProdutos } from "./produtos.js";
import { aoAtualizarFornecedores } from "./fornecedores.js";
import { buscarCotacoesPorData, nomeProduto } from "./cotacoes-novo.js";
import { buscarPuxadasPorData } from "./puxadas.js";
import { formatarPreco, hojeISO, toast, debounce } from "./utils.js";
import { souVendedor } from "./auth.js";

const inputData = document.getElementById("dash-data");
const destaqueGrid = document.getElementById("destaque-grid");

if (inputData) {
  inputData.value = hojeISO();
  inputData.addEventListener("change", montarDashboard);
  
  aoAtualizarProdutos(() => {
    montarDashboard();
  });
  aoAtualizarFornecedores(montarDashboard);
}

export async function montarDashboard() {
  const data = inputData.value || hojeISO();
  const cotacoes = await buscarCotacoesPorData(data);
  const puxadas = await buscarPuxadasPorData(data);
  
  // Vendedor: mostrar apenas preços do dia
  montarPrecosDia(cotacoes);
  
  // Vendedor: mostrar apenas suas puxadas de forma simplificada
  if (souVendedor()) {
    montarPuxadasVendedor(puxadas);
  }
  
  carregarAnotacao(data);
}

// ============================================================
// PREÇOS DO DIA (Cards simples)
// ============================================================
function montarPrecosDia(cotacoes) {
  if (!destaqueGrid) return;
  
  if (produtos.length === 0) {
    destaqueGrid.innerHTML = "";
    return;
  }

  destaqueGrid.innerHTML = produtos.map((p) => {
    const doProduto = cotacoes.filter((c) => c.produtoId === p.id && c.preco !== null && c.preco !== undefined);
    
    if (doProduto.length === 0) {
      return `<div class="destaque-card destaque-vazio">
        <span class="destaque-tag">${p.nome}</span>
        <p class="destaque-vazio-texto">Sem cotação nesta data</p>
      </div>`;
    }
    
    const melhor = doProduto.reduce((m, c) => (c.preco < m.preco ? c : m), doProduto[0]);
    
    return `<div class="destaque-card">
      <span class="destaque-tag">${p.nome}</span>
      <div class="destaque-valor">${formatarPreco(melhor.preco)}</div>
      <div class="destaque-sub">Preço do dia</div>
    </div>`;
  }).join("");
}

// ============================================================
// MINHAS PUXADAS (Tabela simplificada: só Produto + Preço)
// ============================================================
function montarPuxadasVendedor(puxadas) {
  // Tabela simplificada no dashboard
  const tabelaPuxadas = document.querySelector("#minhas-puxadas-tbody");
  
  if (!tabelaPuxadas) return;

  if (puxadas.length === 0) {
    tabelaPuxadas.innerHTML = `<tr><td colspan="2" style="color:var(--texto-fraco); text-align:center; padding:20px;">Nenhuma puxada registrada neste dia</td></tr>`;
    return;
  }

  // Agrupa puxadas por produto (para mostrar melhor)
  const porProduto = {};
  puxadas.forEach(pux => {
    const nomeProd = nomeProduto(pux.produtoId);
    if (!porProduto[nomeProd]) {
      porProduto[nomeProd] = [];
    }
    porProduto[nomeProd].push(pux);
  });

  // Renderiza tabela simplificada: Produto | Preço Puxado
  const linhas = Object.entries(porProduto).map(([nomeProd, puxadasProd]) => {
    // Pega a primeira puxada deste produto (ou agrupa se houver várias)
    const precoMedio = puxadasProd.reduce((acc, p) => acc + (p.preco || 0), 0) / puxadasProd.length;
    
    return `<tr class="linha-puxada-vendedor">
      <td data-label="Produto"><strong>${nomeProd}</strong></td>
      <td data-label="Preço Puxado" class="preco"><strong>${formatarPreco(precoMedio)}</strong></td>
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
