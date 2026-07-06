import { aoLogar } from "./auth.js";
import { iniciarFornecedores } from "./fornecedores.js";
import { iniciarProdutos } from "./produtos.js";
import { montarComparativo, carregarHistorico } from "./cotacoes.js";
import { montarDashboard } from "./dashboard.js";
import { souVendedor } from "./auth.js";

const navItens = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll(".view");

navItens.forEach((btn) => {
  btn.addEventListener("click", () => {
    mudarView(btn.dataset.view);
    fecharMenuMobile();
  });
});

function mudarView(nomeView) {
  navItens.forEach((b) => b.classList.toggle("ativo", b.dataset.view === nomeView));
  views.forEach((v) => v.classList.toggle("oculto", v.id !== `view-${nomeView}`));

  if (nomeView === "dashboard") montarDashboard();
  if (nomeView === "comparativo") montarComparativo();
  if (nomeView === "historico") carregarHistorico();
}

// ---------- Menu gaveta (mobile) ----------
const sidebarEl = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const btnMenuAbrir = document.getElementById("btn-menu-abrir");
const btnMenuFechar = document.getElementById("btn-menu-fechar");

function abrirMenuMobile() {
  sidebarEl?.classList.add("aberta");
  sidebarOverlay?.classList.add("visivel");
}
function fecharMenuMobile() {
  sidebarEl?.classList.remove("aberta");
  sidebarOverlay?.classList.remove("visivel");
}

btnMenuAbrir?.addEventListener("click", abrirMenuMobile);
btnMenuFechar?.addEventListener("click", fecharMenuMobile);
sidebarOverlay?.addEventListener("click", fecharMenuMobile);

// Assim que o usuário autentica, inicia os listeners em tempo real do Firestore
aoLogar(() => {
  iniciarFornecedores();
  iniciarProdutos();
  montarDashboard();

  if (souVendedor()) {

  document.querySelector(
    '[data-view="lancamento"]'
  )?.remove();

  document.querySelector(
    '[data-view="fornecedores"]'
  )?.remove();

  document.querySelector(
    '[data-view="produtos"]'
  )?.remove();

}
});
