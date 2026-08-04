import { db } from "./firebase-config.js";
import {
  collection, doc, setDoc, deleteDoc, getDocs, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { fornecedores, fornecedoresAtivos, aoAtualizarFornecedores } from "./fornecedores.js";
import { produtos, aoAtualizarProdutos } from "./produtos.js";
import { buscarCotacoesPorData } from "./cotacoes-novo.js";
import { souVendedor } from "./auth.js";
import {
  toast, confirmar, pedirTexto, formatarData, formatarPreco, formatarLitros, hojeISO, corFornecedor,
  diferencaPreco, formatarPercentual, ehProdutoDestaque
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

const inputData = document.getElementById("puxada-data");
const thead = document.getElementById("puxada-thead-row");
const tbody = document.getElementById("puxada-tbody");
const tabelaEl = document.getElementById("tabela-puxadas");
const statusEl = document.getElementById("puxada-status");
const btnSalvarTudo = document.getElementById("btn-salvar-puxadas");
const resumoGrid = document.getElementById("puxadas-resumo-grid");
const avisoEl = document.getElementById("puxada-aviso");
const avisoFechar = document.getElementById("puxada-aviso-fechar");
const filtroProduto = document.getElementById("puxada-filtro-produto");
const legendaEl = document.getElementById("puxadas-legenda");
const tabs = document.querySelectorAll(".puxadas-tab");

if (inputData) {
  inputData.value = hojeISO();
  inputData.addEventListener("change", montarGradePuxadas);
  aoAtualizarFornecedores(montarGradePuxadas);
  aoAtualizarProdutos(montarGradePuxadas);
}

// Aviso: fecha e lembra a escolha (por navegador)
if (avisoEl && avisoFechar) {
  if (localStorage.getItem("puxadaAvisoOculto") === "1") avisoEl.classList.add("oculto");
  avisoFechar.addEventListener("click", () => {
    avisoEl.classList.add("oculto");
    localStorage.setItem("puxadaAvisoOculto", "1");
  });
}

// Abas "Por produto" / "Visualização por tabela"
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("ativo"));
    tab.classList.add("ativo");
    const modo = tab.dataset.modo;
    if (tabelaEl) {
      tabelaEl.classList.toggle("vista-tabela", modo === "tabela");
      tabelaEl.classList.toggle("vista-produto", modo !== "tabela");
    }
  });
});

// Filtro por produto (mostra/esconde linhas)
if (filtroProduto) {
  filtroProduto.addEventListener("change", () => {
    const alvo = filtroProduto.value;
    if (!tbody) return;
    tbody.querySelectorAll("tr[data-linha-produto]").forEach((tr) => {
      tr.style.display = (!alvo || tr.dataset.linhaProduto === alvo) ? "" : "none";
    });
  });
}

function montarFiltroProduto() {
  if (!filtroProduto) return;
  const atual = filtroProduto.value;
  filtroProduto.innerHTML = `<option value="">Todos os produtos</option>` +
    produtos.map((p) => `<option value="${p.id}">${p.nome}</option>`).join("");
  if (atual) filtroProduto.value = atual;
}

function montarLegendaFornecedores(forns) {
  if (!legendaEl) return;
  legendaEl.innerHTML = forns.map((f) => `
    <span class="legenda-pill">
      <span class="fornecedor-dot" style="background:${corFornecedor(f.id)}"></span>${f.nome}
    </span>`).join("");
}

function montarResumoPuxadas(puxadasDoDia) {
  if (!resumoGrid) return;

  const totalPuxadas = puxadasDoDia.length;
  const volumeTotal = puxadasDoDia.reduce((s, p) => s + (p.volumeLitros || 0), 0);

  const produtoDestaque = produtos.find((p) => ehProdutoDestaque(p.nome));
  const rotuloDestaque = produtoDestaque ? produtoDestaque.nome : "destaque";
  const puxadasDestaque = produtoDestaque
    ? puxadasDoDia.filter((p) => p.produtoId === produtoDestaque.id)
    : [];

  let menor = null, maior = null;
  if (puxadasDestaque.length > 0) {
    menor = puxadasDestaque.reduce((m, p) => (p.preco < m.preco ? p : m), puxadasDestaque[0]);
    maior = puxadasDestaque.reduce((m, p) => (p.preco > m.preco ? p : m), puxadasDestaque[0]);
  }

  const nomeForn = (id) => fornecedores.find((f) => f.id === id)?.nome || "—";

  resumoGrid.innerHTML = `
    <div class="resumo-card">
      <span class="resumo-icone">🚚</span>
      <div class="resumo-textos">
        <span class="resumo-label">Total de puxadas (dia)</span>
        <div class="resumo-valor">${totalPuxadas}<span class="resumo-unidade">puxadas</span></div>
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
        <span class="resumo-label">Menor preço (${rotuloDestaque})</span>
        <div class="resumo-valor">${menor ? formatarPreco(menor.preco) : "—"}<span class="resumo-unidade">R$ / L</span></div>
        <span class="resumo-sub">${menor ? nomeForn(menor.fornecedorId) : "Sem puxadas hoje"}</span>
      </div>
    </div>
    <div class="resumo-card">
      <span class="resumo-icone icone-laranja">📈</span>
      <div class="resumo-textos">
        <span class="resumo-label">Maior preço (${rotuloDestaque})</span>
        <div class="resumo-valor">${maior ? formatarPreco(maior.preco) : "—"}<span class="resumo-unidade">R$ / L</span></div>
        <span class="resumo-sub">${maior ? nomeForn(maior.fornecedorId) : "Sem puxadas hoje"}</span>
      </div>
    </div>
  `;
}

async function montarGradePuxadas() {
  const forns = fornecedoresAtivos();
  montarFiltroProduto();
  montarLegendaFornecedores(forns);

  if (produtos.length === 0 || forns.length === 0) {
    if (thead) thead.innerHTML = "<th>Fornecedor</th>";
    if (tbody) tbody.innerHTML = `<tr><td style="color:var(--texto-fraco)">Cadastre ao menos um produto e um fornecedor ativo para lançar puxadas.</td></tr>`;
    if (resumoGrid) resumoGrid.innerHTML = "";
    return;
  }

  if (thead) {
    thead.innerHTML = "<th>Fornecedor</th>" + forns.map((f) => `
      <th style="border-top:3px solid ${corFornecedor(f.id)}">
        <span class="fornecedor-dot" style="background:${corFornecedor(f.id)}"></span>${f.nome}
      </th>`).join("");
  }

  const data = inputData.value || hojeISO();
  const [puxadasExistentes, cotacoesDoDia] = await Promise.all([
    buscarPuxadasPorData(data),
    buscarCotacoesPorData(data).catch(() => [])
  ]);

  montarResumoPuxadas(puxadasExistentes);

  const mapa = {};
  puxadasExistentes.forEach((p) => {
    const chave = `${p.fornecedorId}__${p.produtoId}`;
    if (!mapa[chave]) mapa[chave] = [];
    mapa[chave].push(p);
  });

  if (tbody) {
    tbody.innerHTML = produtos.map((p) => {
      const destaque = ehProdutoDestaque(p.nome);
      const puxadasDoProduto = puxadasExistentes.filter((pux) => pux.produtoId === p.id);
      const resumoProduto = resumoPuxadas(puxadasDoProduto);

      // "Preço sugerido" = menor cotação lançada hoje para este produto (dado que o sistema já mostra em Lançar Preços/Dashboard)
      const cotacoesDoProduto = cotacoesDoDia.filter((c) => c.produtoId === p.id && c.preco !== null && c.preco !== undefined);
      const precoSugerido = cotacoesDoProduto.length
        ? Math.min(...cotacoesDoProduto.map((c) => c.preco))
        : null;

      return `
      <tr data-linha-produto="${p.id}" ${destaque ? 'class="linha-produto-destaque"' : ""}>
        <td class="celula-produto-info">
          <div class="produto-nome-linha">
            <strong>${p.nome}</strong>${destaque ? '<span class="mini-tag-destaque">Destaque</span>' : ""}
          </div>
          <div class="produto-info-extra">
            <div class="produto-info-item">
              <span class="produto-info-label">Preço sugerido</span>
              <span class="produto-info-valor">${precoSugerido !== null ? formatarPreco(precoSugerido) + " R$/L" : "—"}</span>
            </div>
            <div class="produto-info-item">
              <span class="produto-info-label">Saldo disponível</span>
              <span class="produto-info-valor saldo">${resumoProduto?.volumeTotal ? formatarLitros(resumoProduto.volumeTotal) + " L" : "0 L"}</span>
            </div>
          </div>
        </td>
        ${forns.map((f) => {
          const puxadas = mapa[`${f.id}__${p.id}`] || [];
          return `<td class="cel-puxadas">
            <div class="puxadas-container" data-produto="${p.id}" data-fornecedor="${f.id}">
              <div class="puxadas-lista puxadas-lista-ativa">
                ${renderLinhasPuxadas(puxadas)}
                ${souVendedor() ? "" : `<button type="button" class="btn-add-puxada-nova" data-acao="add-puxada-nova">+ Adicionar puxada</button>`}
              </div>
            </div>
          </td>`;
        }).join("")}
      </tr>`;
    }).join("");
  }
}

function renderLinhasPuxadas(puxadas) {
  if (!puxadas || puxadas.length === 0) {
    return souVendedor()
      ? `<span class="puxada-vazia">—</span>`
      : renderLinhaPuxada(null);
  }
  return puxadas.map((p) => renderLinhaPuxada(p)).join("");
}

function escapeAttr(txt) {
  return String(txt || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function renderLinhaPuxada(p) {
  // Vendedor só visualiza: sem linha em branco pra puxada nova, sem controles de edição.
  if (souVendedor() && !p) return "";

  const preco = p && p.preco !== null && p.preco !== undefined ? p.preco : "";
  const litros = p && p.volumeLitros !== null && p.volumeLitros !== undefined ? p.volumeLitros : "";
  const justificativa = p && p.justificativa ? p.justificativa : "";
  const idPux = p?.id || "";
  const temMotivo = justificativa.trim() !== "";
  const somenteLeitura = souVendedor();

  return `<div class="puxada-linha" data-puxada-id="${idPux}" data-justificativa="${escapeAttr(justificativa)}">
    <div class="puxada-linha-topo">
      <button type="button" class="btn-icone-linha btn-obs-puxada ${temMotivo ? "tem-motivo" : ""}" data-acao="editar-motivo" title="${temMotivo ? "Ver/editar motivo" : "Adicionar motivo"}" ${somenteLeitura ? "disabled" : ""}>📝</button>
      ${idPux && !somenteLeitura ? `<button type="button" class="btn-icone-linha btn-remover-puxada" data-acao="remover-puxada" title="Remover puxada">✕</button>` : ""}
    </div>
    <div class="puxada-campos-linha">
      <div class="campo-puxada">
        <span class="campo-label">Preço (R$/L)</span>
        <input type="number" step="0.001" min="0" placeholder="Ex.: 5,85" data-campo="preco" class="input-puxada-preco" value="${preco}" ${somenteLeitura ? "readonly disabled" : ""}>
      </div>
      <div class="campo-puxada">
        <span class="campo-label">Litros</span>
        <input type="number" step="1" min="0" placeholder="Ex.: 2000" data-campo="litros" class="input-puxada-litros" value="${litros}" ${somenteLeitura ? "readonly disabled" : ""}>
      </div>
    </div>
  </div>`;
}

// Salva (ou atualiza) a puxada de uma linha específica, sem reconstruir a grade inteira.
async function salvarLinhaAtual(linha, container) {
  const { fornecedor, produto } = container.dataset;
  const data = inputData.value || hojeISO();
  const idPuxada = linha.dataset.puxadaId;
  const preco = linha.querySelector('[data-campo="preco"]').value;
  const litros = linha.querySelector('[data-campo="litros"]').value;
  const justificativa = linha.dataset.justificativa || "";

  if (preco === "" || !justificativa.trim()) return null;

  const novoId = await salvarPuxada(data, fornecedor, produto, preco, litros, justificativa, idPuxada || null);
  if (novoId) {
    linha.dataset.puxadaId = novoId;
    if (!linha.querySelector(".btn-remover-puxada")) {
      linha.querySelector(".puxada-linha-topo").insertAdjacentHTML(
        "beforeend",
        `<button type="button" class="btn-icone-linha btn-remover-puxada" data-acao="remover-puxada" title="Remover puxada">✕</button>`
      );
    }
    statusEl.textContent = "Salvo ✓";
    statusEl.classList.add("ok");
    setTimeout(() => { statusEl.textContent = ""; statusEl.classList.remove("ok"); }, 2200);
  }
  return novoId;
}

function coletarPuxadasDeContainer(container) {
  return [...container.querySelectorAll(".puxada-linha")].map((linha) => {
    const precoStr = linha.querySelector('[data-campo="preco"]').value;
    const litrosStr = linha.querySelector('[data-campo="litros"]').value;
    const justificativa = linha.dataset.justificativa || "";
    const id = linha.dataset.puxadaId;
    return {
      id: id || null,
      preco: precoStr === "" ? null : parseFloat(precoStr),
      volumeLitros: litrosStr === "" ? null : parseFloat(litrosStr),
      justificativa
    };
  }).filter((p) => p.preco !== null && !isNaN(p.preco) && p.preco >= 0);
}

if (tbody) {
  tbody.addEventListener("click", async (e) => {
    if (souVendedor()) return; // vendedor só visualiza puxadas

    const btnAdd = e.target.closest('[data-acao="add-puxada-nova"]');
    if (btnAdd) {
      const container = btnAdd.closest(".puxadas-container");
      btnAdd.insertAdjacentHTML("beforebegin", renderLinhaPuxada(null));
      container.querySelector(".puxada-linha:last-of-type .input-puxada-preco")?.focus();
      return;
    }

    const btnRemover = e.target.closest('[data-acao="remover-puxada"]');
    if (btnRemover) {
      const container = btnRemover.closest(".puxadas-container");
      const linha = btnRemover.closest(".puxada-linha");
      const idPuxada = linha.dataset.puxadaId;
      
      if (idPuxada) {
        const ok = await confirmar("Remover esta puxada?");
        if (!ok) return;
        await deletarPuxada(idPuxada);
        toast("Puxada removida.", "sucesso");
      }
      
      linha.remove();
      return;
    }

    const btnMotivo = e.target.closest('[data-acao="editar-motivo"]');
    if (btnMotivo) {
      const linha = btnMotivo.closest(".puxada-linha");
      const container = linha.closest(".puxadas-container");
      const motivo = await pedirTexto("Motivo da puxada", linha.dataset.justificativa || "");
      if (motivo === null) return; // cancelou, não mexe no que já estava salvo

      linha.dataset.justificativa = motivo;
      btnMotivo.classList.add("tem-motivo");
      btnMotivo.title = "Ver/editar motivo";

      // Se o preço já estiver preenchido, salva/atualiza na hora
      const temPreco = linha.querySelector('[data-campo="preco"]').value !== "";
      if (temPreco) await salvarLinhaAtual(linha, container);
      return;
    }
  });

  // O auto-save não reconstrói a tabela inteira, evitando perda de foco
  tbody.addEventListener("blur", async (e) => {
    if (souVendedor()) return; // vendedor só visualiza puxadas
    if (!e.target.matches('input[data-campo]')) return;
    const linha = e.target.closest(".puxada-linha");
    const container = e.target.closest(".puxadas-container");
    const idPuxada = linha.dataset.puxadaId;
    const preco = linha.querySelector('[data-campo="preco"]').value;

    if (preco === "") {
      if (idPuxada) {
        await deletarPuxada(idPuxada);
        toast("Puxada removida.", "sucesso");
      }
      linha.remove();
      return;
    }

    const temMotivo = (linha.dataset.justificativa || "").trim() !== "";
    if (!temMotivo) {
      // Só abre o popup ao sair do campo Preço, pra não duplicar ao tabular pro campo Litros
      if (e.target.dataset.campo !== "preco") return;
      const motivo = await pedirTexto("Motivo da puxada");
      if (motivo === null) {
        toast("Informe o motivo para salvar a puxada.", "erro");
        return;
      }
      linha.dataset.justificativa = motivo;
      const btnObs = linha.querySelector(".btn-obs-puxada");
      if (btnObs) { btnObs.classList.add("tem-motivo"); btnObs.title = "Ver/editar motivo"; }
    }

    await salvarLinhaAtual(linha, container);
  }, true);
}

if (btnSalvarTudo) {
  btnSalvarTudo.addEventListener("click", async () => {
    if (souVendedor()) return; // vendedor só visualiza puxadas
    const containers = [...tbody.querySelectorAll(".puxadas-container")];
    const data = inputData.value || hojeISO();
    btnSalvarTudo.disabled = true;
    btnSalvarTudo.textContent = "Salvando...";
    let semMotivo = 0;
    
    try {
      for (const container of containers) {
        const puxadas = coletarPuxadasDeContainer(container);
        const { fornecedor, produto } = container.dataset;
        
        for (const pux of puxadas) {
          if (!pux.justificativa.trim()) { semMotivo++; continue; }
          await salvarPuxada(data, fornecedor, produto, pux.preco, pux.volumeLitros, pux.justificativa, pux.id || null);
        }
      }
      
      if (semMotivo > 0) {
        toast(`${semMotivo} puxada(s) com preço mas sem motivo não foram salvas. Clique no ícone 📝 pra completar.`, "erro");
      } else {
        toast("Puxadas do dia salvas com sucesso.", "sucesso");
      }
      // Ao clicar em Salvar Tudo, recarregamos a grade toda
      montarGradePuxadas();
    } catch (err) {
      // toast já disparado internamente no salvarPuxada em caso de falta de justifiativa
    } finally {
      btnSalvarTudo.disabled = false;
      btnSalvarTudo.textContent = "💾 Salvar puxadas do dia";
    }
  });
}
