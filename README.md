# Controle de Preços de Combustíveis

Sistema web para lançamento diário de cotações de combustíveis por fornecedor,
com comparação automática, ranking e dashboard de indicadores.
HTML + CSS + JavaScript puro, com Firebase Authentication e Firestore.

## Estrutura de arquivos

```
controle-combustiveis/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── firebase-config.js   ← configure suas chaves aqui
│   ├── utils.js
│   ├── auth.js
│   ├── fornecedores.js
│   ├── produtos.js
│   ├── cotacoes.js
│   ├── dashboard.js
│   └── app.js
└── firestore.rules
```

## 1. Criar o projeto no Firebase

1. Acesse https://console.firebase.google.com e crie um novo projeto.
2. No menu lateral, vá em **Build > Authentication** → aba **Sign-in method** → habilite **E-mail/senha**.
3. Em **Authentication > Users**, clique em **Add user** e crie o login de cada pessoa que vai lançar preços (não há tela de "criar conta" no sistema — isso é proposital, para controlar quem acessa).
4. Vá em **Build > Firestore Database** → **Create database** → inicie em modo produção → escolha a região mais próxima (ex.: `southamerica-east1`).
5. Ainda no Firestore, aba **Regras**, cole o conteúdo do arquivo `firestore.rules` e publique.

## 2. Conectar o app ao seu projeto

1. No console, vá em **Configurações do projeto** (ícone de engrenagem) → **Seus apps** → clique em **Web (</>)** para registrar um app.
2. Copie o objeto `firebaseConfig` gerado.
3. Abra `js/firebase-config.js` e substitua os valores de exemplo pelos seus:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

## 3. Rodar o sistema

Como o app usa módulos ES (`type="module"`) e o SDK do Firebase, ele precisa ser aberto por um servidor local (não funciona abrindo o `index.html` direto como arquivo, pelas regras de CORS do navegador). Formas simples:

- **VS Code**: instale a extensão "Live Server" e clique em "Go Live".
- **Python**: dentro da pasta do projeto, rode `python3 -m http.server 8080` e acesse `http://localhost:8080`.
- **Node**: `npx serve .`

## 4. Publicar (opcional)

O jeito mais simples é o **Firebase Hosting**, do mesmo projeto:

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # aponte a pasta pública para a raiz do projeto
firebase deploy
```

## 5. Papéis de acesso (quem edita e quem só visualiza)

> Se você já tinha publicado as regras do Firestore antes, **republique o arquivo `firestore.rules`** (aba Regras) — ele foi atualizado para checar o papel de cada pessoa antes de permitir gravação.

Por padrão, **qualquer pessoa com login criado só consegue visualizar** — dashboard, comparativo e histórico abrem normalmente, mas os botões de lançar, editar e excluir ficam escondidos e bloqueados. Existem hoje quatro papéis possíveis:

| Papel (`papel`) | O que vê | O que pode gravar |
|---|---|---|
| `editor` | Tudo (menu completo) | Tudo: fornecedores, produtos, preço do dia e puxadas |
| `operacional` | Só **Dashboard** e **Lançar Puxadas** | Só a coleção `puxadas` (adicionar, editar e excluir puxadas) |
| `vendedor` | Só o **Dashboard**, em modo leitura | Nada — só consulta suas puxadas do dia |
| *(sem documento)* → visualizador | Tudo (menu completo) | Nada — só leitura |

Isso é controlado por uma coleção no Firestore chamada `papeis`, separada das outras. Para liberar edição para alguém:

1. No **Firebase Console**, vá em **Firestore Database > Dados**.
2. Crie a coleção `papeis` (se ainda não existir).
3. Para cada pessoa, crie um documento onde:
   - **ID do documento** = o e-mail exato usado no login (ex.: `tati@empresa.com`)
   - Campo `papel` (string) = `editor`, `operacional` ou `vendedor`, conforme a tabela acima

Exemplo, pelo que você me passou:

| ID do documento (e-mail) | Campo `papel` |
|---|---|
| e-mail da Tati | `editor` |
| e-mail da Isa | `editor` |
| e-mail de quem só lança puxadas (operacional) | `operacional` |

Todo o resto — Pamella, Paula, Andrea, Alex, Marcelo — **não precisa de nenhum documento**: sem registro em `papeis`, o acesso já é automaticamente "somente visualização". Só crie as contas deles em **Authentication** (passo 1) normalmente.

Se um dia quiser trocar o papel de alguém, é só criar/editar/apagar o documento dela em `papeis` — não precisa mexer em nada no código. E como a regra fica valendo no Firestore (não só escondendo botão na tela), mesmo que alguém abra o console do navegador não consegue gravar nada além do que o papel permite.

> **Importante:** depois de mexer no `firestore.rules`, é preciso **republicar** o arquivo (Firestore Database > aba Regras, colar o conteúdo novo e publicar) — só editar o arquivo local não muda nada em produção.



1. **Fornecedores** e **Produtos**: cadastre uma vez as distribuidoras e os combustíveis acompanhados (ex.: Diesel S10, Diesel S500, Gasolina Comum, Etanol).
2. **Lançar Preços**: escolha a data (vem preenchida com hoje) e digite, para cada fornecedor e produto, o **preço do dia**. Ao lado, o botão "Puxadas" abre a lista de puxadas (cargas) recebidas daquele fornecedor no dia — pode adicionar quantas quiser com "+ puxada", cada uma com seu **preço** e, opcionalmente, o **volume em litros**. Cada campo salva sozinho ao sair dele (não precisa clicar em nada), e o botão "Salvar lançamentos do dia" garante que tudo foi gravado. Produtos identificados como Diesel S10/S500 recebem uma etiqueta "destaque".
3. **Comparativo**: mostra, para a data escolhida, uma faixa com o melhor preço do dia dos produtos S10/S500 em destaque, seguida do ranking de fornecedores por produto (do mais barato ao mais caro) com preço do dia, a lista de todas as puxadas do dia (preço + litros) e o total de litros, e a diferença entre o preço do dia e a referência das puxadas em R$ e %.
4. **Dashboard**: cards de destaque com o melhor preço do dia dos produtos S10/S500 (e a diferença vs. a menor puxada do dia, com o total de litros puxados), indicadores do dia (melhor preço, maior preço, diferença, média de mercado) e gráfico de evolução dos últimos 30 dias com lançamento para o produto selecionado.
5. **Histórico**: consulta com filtros por período, fornecedor e produto, com gráfico de evolução (melhor preço do dia × média das puxadas) do período filtrado; permite editar o preço do dia e as puxadas (preço + litros, adicionar/remover) direto na tabela, ou excluir um lançamento.

## Modelo de dados (Firestore)

| Coleção | Campos |
|---|---|
| `fornecedores` | `nome` (string), `ativo` (boolean) |
| `produtos` | `nome` (string), `categoria` (string), `unidade` (string) |
| `cotacoes` | `data` (string `AAAA-MM-DD`), `fornecedorId`, `produtoId`, `preco` (number, preço do dia), `puxadas` (array de `{ preco, volumeLitros }` — uma entrada por carga/puxada recebida do fornecedor naquele dia; `volumeLitros` é opcional), `atualizadoEm` |
| `papeis` | ID do documento = e-mail da pessoa · `papel` (`"editor"`, `"operacional"`, `"vendedor"`, ausência = somente visualização) |

> Lançamentos antigos (de antes dessa mudança) tinham um único campo `precoPuxado`. O sistema continua lendo esses documentos normalmente, tratando-os como "uma puxada só, sem volume informado" — não é preciso migrar nada manualmente. Assim que um desses lançamentos for editado (preço do dia ou puxadas), ele é convertido automaticamente para o novo formato (`puxadas`).

O ID de cada documento em `cotacoes` é gerado como `data__fornecedorId__produtoId`,
o que evita lançamentos duplicados: relançar o mesmo dia/fornecedor/produto apenas atualiza o preço.

## Próximos passos sugeridos (não incluídos nesta versão)

- **Importação via Excel/CSV**: dá para adicionar com a biblioteca `SheetJS` lendo um `.xlsx` no navegador e gravando em lote no Firestore — a estrutura de coleções já está pronta para isso.
- **Alertas de variação**: comparar o preço lançado hoje com a média dos últimos N dias e disparar um aviso visual (ou e-mail via Cloud Functions) quando a variação passar de um limite definido.
- **Perfis de acesso**: hoje qualquer usuário autenticado pode tudo; se quiser separar quem só consulta de quem lança preços, dá para adicionar um campo `papel` no perfil do usuário e refinar as regras do Firestore.
