# 🎯 Mudanças Implementadas: Separação em Duas Páginas

## Resumo

A estrutura foi reorganizada para ter **duas coleções distintas no Firestore**:
- **`cotacoes`** → apenas **preços do dia** (praticados)
- **`puxadas`** → **preços de referência** (puxadas/tabelas dos fornecedores)

## Arquivos Modificados

### 📝 `index.html`
- Adicionado novo item no menu: **"Lançar Puxadas"** (ícone 📋)
- Nova seção `#view-puxadas` para a interface de puxadas
- Atualizado script imports: `cotacoes-novo.js` e `puxadas.js`

### 📄 `js/puxadas.js` (NOVO)
- Gerencia a coleção **`puxadas`** no Firestore
- Funções de salvar, buscar, deletar puxadas
- UI completamente independente para lançamento de puxadas
- Suporta múltiplas puxadas do mesmo fornecedor no mesmo dia
- Auto-save ao sair de cada input

**Funções principais:**
```javascript
salvarPuxada(data, fornecedorId, produtoId, preco, volumeLitros)
buscarPuxadasPorData(data)
buscarPuxadasPorFornecedorProdutoData(data, fornecedorId, produtoId)
deletarPuxada(id)
resumoPuxadas(puxadas) // Calcula média, menor preço, volume total
```

### 📄 `js/cotacoes-novo.js`
- **Versão simplificada** do antigo `cotacoes.js`
- Salva apenas **preço do dia** (sem puxadas embutidas)
- Integrado com a coleção `puxadas` para exibição em comparativos

**Mudanças principais:**
- Função `salvarCotacao()` recebe apenas: `data, fornecedorId, produtoId, preco`
- Remove a lógica de puxadas do lançamento
- Dashboard, Comparativo e Histórico buscam puxadas da coleção separada
- Interface de lançamento muito mais simples (só 1 campo por célula)

## Fluxo de Dados

### 📌 Página: "Lançar Preços"
1. Usuário preenche o **preço do dia** que foi praticado
2. Grid: Produto × Fornecedor
3. Salva em `cotacoes` collection
4. Auto-save ao sair do input

### 📌 Página: "Lançar Puxadas"
1. Usuário adiciona múltiplas puxadas (preço + volume opcional)
2. Grid: Produto × Fornecedor
3. Salva cada puxada em `puxadas` collection com ID único por data+fornecedor+produto+timestamp
4. Permite múltiplas puxadas do mesmo fornecedor num mesmo dia
5. Auto-save ao sair do input

### 📌 Comparativo e Dashboard
- Busca preços em `cotacoes`
- Busca puxadas em `puxadas`
- Calcula diferença: preço do dia × média das puxadas

## Estrutura do Firestore

### Coleção: `cotacoes`
```json
{
  "id": "2024-01-15__forn-001__prod-001",
  "data": "2024-01-15",
  "fornecedorId": "forn-001",
  "produtoId": "prod-001",
  "preco": 5.25,
  "atualizadoEm": "2024-01-15T14:32:00Z"
}
```

### Coleção: `puxadas`
```json
{
  "id": "2024-01-15__forn-001__prod-001__1705329120000",
  "data": "2024-01-15",
  "fornecedorId": "forn-001",
  "produtoId": "prod-001",
  "preco": 5.10,
  "volumeLitros": 1000,
  "atualizadoEm": "2024-01-15T14:32:00Z"
}
```

## Como Usar

1. **Substituir `cotacoes.js` pelo `cotacoes-novo.js`:**
   ```bash
   mv js/cotacoes.js js/cotacoes-antigo.js
   mv js/cotacoes-novo.js js/cotacoes.js
   ```

2. **Ou manter ambos** (recomendado para transição) e ajustar imports no `index.html`

3. **Criar índices no Firestore** (importante para performance):
   - Collection: `puxadas`
   - Index: `data`, `fornecedorId`, `produtoId` + `atualizadoEm DESC`

## Próximas Etapas

- [ ] Testar lançamento e busca em ambas as páginas
- [ ] Validar cálculos de média/volume nas puxadas
- [ ] Ajustar estilos CSS se necessário para as novas seções
- [ ] Migrar dados históricos (se houver) para a coleção de puxadas
- [ ] Implementar permissões de acesso (depois, conforme mencionado)

## ⚠️ Notas Importantes

- O arquivo `cotacoes.js` original é mantido para referência
- Puxadas agora são **completamente independentes** de cotações
- Permite **múltiplas puxadas por dia** para o mesmo fornecedor/produto
- Volume em litros é **opcional**
- Auto-save funciona ao desfocar do campo (blur event)

---

Ficou claro? Teste primeiro em dev e avisa se tiver alguma dúvida! 🚀
