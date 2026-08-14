import { aoLogar } from "./auth.js";
import { iniciarFornecedores } from "./fornecedores.js";
import { iniciarProdutos } from "./produtos.js";
import { montarComparativo, carregarHistorico } from "./cotacoes-novo.js";
import { montarDashboard } from "./dashboard-novo.js";
import { souVendedor, souEditor, souOperacional, papelUsuario } from "./auth.js";

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

  const papel = papelUsuario();

  // - Editor: vê TUDO e pode editar
  // - Visualizador: vê TUDO, mas só em modo leitura (inputs/botões de ação
  //   ficam desabilitados pelo CSS .modo-visualizador)
  // - Vendedor: vê APENAS o dashboard
  // - Operacional: vê o Dashboard e a página "Lançar Puxadas" (onde consegue
  //   lançar/editar puxadas normalmente); o resto do menu fica escondido

  if (papel === "vendedor") {
    // Vendedor só vê o dashboard - remove o resto do menu
    document.querySelector('[data-view="lancamento"]')?.remove();
    document.querySelector('[data-view="puxadas"]')?.remove();
    document.querySelector('[data-view="comparativo"]')?.remove();
    document.querySelector('[data-view="historico"]')?.remove();
    document.querySelector('[data-view="fornecedores"]')?.remove();
    document.querySelector('[data-view="produtos"]')?.remove();
  } else if (papel === "operacional") {
    // Operacional só vê o dashboard e "Lançar Puxadas" - remove o resto do menu
    document.querySelector('[data-view="lancamento"]')?.remove();
    document.querySelector('[data-view="comparativo"]')?.remove();
    document.querySelector('[data-view="historico"]')?.remove();
    document.querySelector('[data-view="fornecedores"]')?.remove();
    document.querySelector('[data-view="produtos"]')?.remove();
  }
  // Editor e Visualizador veem tudo - nenhuma view é removida

});