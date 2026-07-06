import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { toast } from "./utils.js";

const telaLogin = document.getElementById("tela-login");
const app = document.getElementById("app");
const formLogin = document.getElementById("form-login");
const loginErro = document.getElementById("login-erro");
const usuarioEmailEl = document.getElementById("usuario-email");
const usuarioAvatarEl = document.getElementById("usuario-avatar");
const btnLogout = document.getElementById("btn-logout");

// Papel do usuário logado: "editor" (pode lançar/editar/excluir) ou "visualizador" (só leitura).
// Por padrão, sem registro em /papeis/{email}, o acesso é somente visualização.
let papelAtual = "visualizador";

export function souEditor() {
  return papelAtual === "editor";
}

export function souVendedor() {
  return papelAtual === "vendedor";
}

export function papelUsuario() {
  return papelAtual;
}

const callbacksLogin = [];
export function aoLogar(callback) {
  callbacksLogin.push(callback);
}

formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginErro.textContent = "";
  const email = document.getElementById("login-email").value.trim();
  const senha = document.getElementById("login-senha").value;
  const btn = formLogin.querySelector("button");
  btn.disabled = true;
  btn.textContent = "Entrando...";
  try {
    await signInWithEmailAndPassword(auth, email, senha);
  } catch (err) {
    loginErro.textContent = mensagemErroAuth(err.code);
  } finally {
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
});

btnLogout.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, async (usuario) => {
  if (usuario) {
    papelAtual = "visualizador";

    try {

      const ref = doc(
        db,
        "papeis",
        (usuario.email || "").toLowerCase()
      );

      const snap = await getDoc(ref);

      if (snap.exists()) {

        papelAtual =
          snap.data().papel || "visualizador";

      }

    } catch (err) {
    }

      telaLogin.classList.add("oculto");
      app.classList.remove("oculto");
      usuarioEmailEl.textContent = usuario.email;
      usuarioAvatarEl.textContent = (usuario.email || "U").charAt(0).toUpperCase();
      aplicarModoVisualizacao();
      callbacksLogin.forEach((cb) => cb(usuario));
    } else {
      app.classList.add("oculto");
      telaLogin.classList.remove("oculto");
    }
  });

function aplicarModoVisualizacao() {

  document.body.classList.toggle(
    "modo-visualizador",
    !souEditor()
  );

  const selo = document.getElementById("selo-papel");

  if (!selo) return;

  if (souEditor()) {

    selo.textContent = "Editor";
    selo.className =
      "selo-papel selo-papel-editor";

  } else if (souVendedor()) {

    selo.textContent = "Vendedor";
    selo.className =
      "selo-papel selo-papel-visualizador";

  } else {

    selo.textContent =
      "Somente visualização";

    selo.className =
      "selo-papel selo-papel-visualizador";

  }

}

function mensagemErroAuth(codigo) {
  const mapa = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/too-many-requests": "Muitas tentativas. Tente novamente em instantes."
  };
  return mapa[codigo] || "Não foi possível entrar. Verifique os dados e tente novamente.";
}

