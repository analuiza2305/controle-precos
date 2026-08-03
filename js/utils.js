// ============================================================
// UTILITÁRIOS COMPARTILHADOS
// ============================================================

// Paleta fixa usada para identificar visualmente cada fornecedor em qualquer
// tela do sistema (mesma cor no lançamento, comparativo e histórico).
const PALETA_FORNECEDOR = [
  "#1D5F91", "#0F9D58", "#C98A00", "#8E44AD",
  "#D93025", "#0E7C86", "#B8560A", "#4C6B8A"
];
export function corFornecedor(id) {
  if (!id) return PALETA_FORNECEDOR[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETA_FORNECEDOR[hash % PALETA_FORNECEDOR.length];
}

export function hojeISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

export function formatarData(iso) {
  if (!iso) return "-";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function formatarPreco(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return "-";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export function formatarLitros(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return "-";
  return `${Number(valor).toLocaleString("pt-BR")} L`;
}

export function toast(mensagem, tipo = "normal") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${tipo === "erro" ? "erro" : tipo === "sucesso" ? "sucesso" : ""}`;
  el.textContent = mensagem;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

export function confirmar(texto) {
  return new Promise((resolve) => {
    const modal = document.getElementById("modal-confirmacao");
    const textoEl = document.getElementById("modal-texto");
    const btnOk = document.getElementById("modal-confirmar");
    const btnCancelar = document.getElementById("modal-cancelar");
    textoEl.textContent = texto;
    modal.classList.remove("oculto");

    function limpar(resultado) {
      modal.classList.add("oculto");
      btnOk.removeEventListener("click", onOk);
      btnCancelar.removeEventListener("click", onCancelar);
      resolve(resultado);
    }
    function onOk() { limpar(true); }
    function onCancelar() { limpar(false); }

    btnOk.addEventListener("click", onOk);
    btnCancelar.addEventListener("click", onCancelar);
  });
}

// Popup simples de texto livre (ex.: motivo/observação de uma puxada).
// Retorna a string digitada, ou null se o usuário cancelar.
export function pedirTexto(titulo, valorInicial = "") {
  return new Promise((resolve) => {
    const modal = document.getElementById("modal-motivo");
    const tituloEl = document.getElementById("modal-motivo-titulo");
    const inputEl = document.getElementById("modal-motivo-input");
    const btnOk = document.getElementById("modal-motivo-salvar");
    const btnCancelar = document.getElementById("modal-motivo-cancelar");
    tituloEl.textContent = titulo;
    inputEl.value = valorInicial;
    modal.classList.remove("oculto");
    setTimeout(() => inputEl.focus(), 50);

    function limpar(resultado) {
      modal.classList.add("oculto");
      btnOk.removeEventListener("click", onOk);
      btnCancelar.removeEventListener("click", onCancelar);
      inputEl.removeEventListener("keydown", onKeydown);
      resolve(resultado);
    }
    function onOk() {
      const valor = inputEl.value.trim();
      if (!valor) { inputEl.focus(); return; }
      limpar(valor);
    }
    function onCancelar() { limpar(null); }
    function onKeydown(e) {
      if (e.key === "Enter") { e.preventDefault(); onOk(); }
      if (e.key === "Escape") { e.preventDefault(); onCancelar(); }
    }

    btnOk.addEventListener("click", onOk);
    btnCancelar.addEventListener("click", onCancelar);
    inputEl.addEventListener("keydown", onKeydown);
  });
}

// Debounce simples, útil para inputs de lançamento (evita salvar a cada tecla)
export function debounce(fn, espera = 400) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), espera);
  };
}

// ============================================================
// COMPARATIVO PREÇO DO DIA × PREÇO PUXADO
// ============================================================

export function formatarPercentual(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return "-";
  const sinal = valor > 0 ? "+" : "";
  return `${sinal}${valor.toFixed(1)}%`;
}

// Calcula a diferença (em R$ e em %) entre o preço do dia e o preço puxado.
// Retorna null quando não há os dois valores para comparar.
export function diferencaPreco(precoDia, precoPuxado) {
  const dia = Number(precoDia);
  const puxado = Number(precoPuxado);
  if (precoDia === null || precoDia === undefined || precoDia === "" || isNaN(dia)) return null;
  if (precoPuxado === null || precoPuxado === undefined || precoPuxado === "" || isNaN(puxado) || puxado === 0) return null;
  const valor = dia - puxado;
  const percentual = (valor / puxado) * 100;
  return { valor, percentual };
}

// Identificação de produtos em destaque (Diesel S10 / S500) a partir do nome
// cadastrado, tolerando variações como "S10", "S-10", "S 10".
export function ehProdutoS10(nome) { return /\bs\W?10\b/i.test(nome || ""); }
export function ehProdutoS500(nome) { return /\bs\W?500\b/i.test(nome || ""); }
export function ehProdutoDestaque(nome) { return ehProdutoS10(nome) || ehProdutoS500(nome); }
