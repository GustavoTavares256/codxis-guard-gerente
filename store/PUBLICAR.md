# Passo a passo: publicar na Chrome Web Store (não listada)

Quem faz: **você**, com a conta Google que será dona da extensão. Leva uns 15 minutos de preenchimento;
a revisão da loja leva de algumas horas a alguns dias.

## 1. Preparar o pacote

```bash
npm test          # confere tudo
npm run pack      # gera dist/codxis-guard-<versão>.zip
```

O `.zip` tem o `manifest.json` na raiz, como a loja exige. (`npm run icons` recria os ícones, se precisar.)

## 2. Criar a conta de desenvolvedor (uma vez)

1. Acesse https://chrome.google.com/webstore/devconsole e entre com a conta Google.
2. Aceite os termos e pague a **taxa única de US$ 5**.
3. Confirme o e-mail de contato e, se pedido, a verificação em duas etapas.

## 3. Enviar a extensão

1. **Novo item** → envie o `.zip` de `dist/`.
2. **Listagem da loja:** use os textos de `store/LISTING.md` (nome, resumo, descrição, categoria, idioma).
   - Ícone: `extension/icons/icon128.png`.
   - Capturas de tela: pelo menos 1 (1280×800). Sugestões: (a) o modal "Autorização" aparecendo ao
     cancelar uma venda; (b) o PDV em abas Produtos | Pagamento; (c) a página de Opções.
     **Cuidado:** não deixe aparecer dados reais de clientes ou da empresa nas imagens.
3. **Práticas de privacidade:** copie a finalidade única, as justificativas e as declarações de
   `store/LISTING.md`. Informe a URL da política de privacidade (o repositório do GitHub precisa estar público).
4. **Distribuição:** escolha **Não listada** e as regiões.
5. **Enviar para revisão.**

## 4. Depois de aprovada

- A loja mostra o **link** da extensão: passe só para quem deve instalar. No Brave e no Chrome, é só abrir o
  link e clicar em **Adicionar**.
- Quem instalar pela loja recebe as **atualizações automaticamente**. Para lançar uma versão nova: aumente
  `version` em `extension/manifest.json`, rode `npm run pack`, envie o novo `.zip` no mesmo item e mande
  para revisão.
- A extensão instalada pela loja é **outra instalação** (outro ID) que a carregada "sem compactação": as
  senhas e configurações não passam de uma para a outra. Remova a versão de desenvolvimento e cadastre as
  senhas de novo na página de Opções.

## 5. Se a revisão recusar

Os motivos mais comuns: política de privacidade sem URL pública, capturas de tela com dados pessoais,
descrição que não bate com o que a extensão faz, ou permissão sem justificativa. O e-mail da loja diz o
motivo; ajuste o texto ou o pacote e reenvie.
