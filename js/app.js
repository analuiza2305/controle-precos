import { aoLogar } from "./auth.js";
import { iniciarFornecedores } from "./fornecedores.js";
import { iniciarProdutos } from "./produtos.js";
import { montarComparativo, carregarHistorico } from "./cotacoes.js";
import { montarDashboard } from "./dashboard.js";

const navItens = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll(".view");

navItens.forEach((btn) => {
  btn.addEventListener("click", () => mudarView(btn.dataset.view));
});

function mudarView(nomeView) {
  navItens.forEach((b) => b.classList.toggle("ativo", b.dataset.view === nomeView));
  views.forEach((v) => v.classList.toggle("oculto", v.id !== `view-${nomeView}`));

  if (nomeView === "dashboard") montarDashboard();
  if (nomeView === "comparativo") montarComparativo();
  if (nomeView === "historico") carregarHistorico();
}

// Assim que o usuário autentica, inicia os listeners em tempo real do Firestore
aoLogar(() => {
  iniciarFornecedores();
  iniciarProdutos();
  montarDashboard();
});
