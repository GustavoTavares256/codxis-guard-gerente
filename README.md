# Codxis Guard — Senha do Gerente

Extensão para Google Chrome (Manifest V3) que **exige a senha do gerente** antes de
**remover um item** ou **cancelar uma venda** no PDV web da Codxis
(`https://web.codxis.api.br/*`).

## Funcionalidades

- Intercepta cliques e atalhos de teclado (padrão: **F7** = cancelar item, **F9** = cancelar venda).
- Também pede a senha para **alterar o preço unitário** (digitar, colar ou apagar no campo Valor Unit.) e para botões "alterar preço".
- Quando o Codxis abre o modal "Desconto maior que o limite do vendedor", o **Confirmar** exige também a senha do gerente da extensão.
- **Restaura os itens da venda após recarregar o PDV**: guarda código e quantidade (por aba) e, depois do F5, pergunta se deve reinseri-los (Enter restaura, Esc descarta). Preço, desconto, cliente e pagamentos não são restaurados.
- **Frente de caixa em abas (padrão)**: o PDV abre em duas abas em tela cheia, **Produtos** e **Pagamento**, no lugar da divisão lado a lado; **F4** volta ao layout original do sistema (e liga de novo). Desligável nas Opções. Na aba Produtos não aparece pagamento nem botão que finalize (NFC-e F1, PV F2, Financeiro, Consultar Vendas F8, Pedidos Finalizados e Trocar Tipo de Envio; F1 e F2 levam à aba Pagamento e F8 é ignorado); o total fica no topo. **Shift+F4** alterna entre as abas e **F4** volta ao layout normal. As teclas são configuráveis nas Opções.
- Nome do produto em **negrito** na lista de itens da frente de caixa e em **vermelho** quando o produto for inativo. O PDV não informa a situação na linha, então os inativos são identificados pela lista de **códigos inativos** (e/ou por um texto) configurada nas Opções; só vale nessa tela.
- **Consulta de produtos**: produtos inativos aparecem com a **linha inteira em vermelho** (fundo translúcido + faixa à esquerda; o nome continua legível). A lista não informa a situação: a extensão usa os códigos inativos das Opções (só para a empresa configurada) e aprende sozinha, por empresa, ao abrir a edição de um produto com Ativo = Não.
- Modal de autorização isolado em Shadow DOM, com foco travado na senha.
- Senhas armazenadas com **PBKDF2-SHA256** (150 mil iterações, salt aleatório) — nunca em texto puro.
- Bloqueio temporário após tentativas incorretas (3 para o gerente, 5 para o administrador).
- Log de autorizações/negações (até 5.000 registros) com exportação em **CSV**.
- Página de opções protegida por senha de administrador; regex e atalhos configuráveis.
- Só atua na tela "Realizar Venda" e na empresa configurada.

## Instalação

1. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e selecione a pasta [`extension/`](extension).
3. Clique no ícone da extensão para abrir as opções, crie a **senha de administrador** e
   depois cadastre a **senha do gerente**.

## Configuração

Em *Opções* é possível ajustar: nome da empresa, regex da tela, regex dos botões de
remover/cancelar, atalhos e modo debug (logs no console com o prefixo `[CX-Guard]`).
As alterações valem imediatamente nas abas abertas.

## Estrutura do projeto

```
codxis-guard-gerente/
├── extension/               # Pasta carregada no Chrome
│   ├── manifest.json
│   ├── background.js        # Abre a página de opções ao clicar no ícone
│   ├── scripts/
│   │   ├── common.js        # Storage, hash de senha, bloqueio, log, helpers puros
│   │   └── content.js       # Detecção da tela, interceptação e modal
│   └── options/
│       ├── options.html
│       └── options.js       # Senhas, configurações e log
├── tests/                   # Testes automatizados (node:test)
├── package.json
└── README.md
```

## Testes

Requer Node.js 18+ (sem dependências externas).

```bash
npm test         # testes unitários (senhas, bloqueio, log, helpers, manifest)
npm run check    # valida o manifest e os arquivos referenciados
```

Os testes carregam `common.js` com um `chrome.storage` falso em memória.
A interceptação no DOM (`content.js`) deve ser verificada manualmente no PDV.

## Limitações

Por rodar no navegador, a proteção pode ser contornada por quem tiver acesso ao
perfil do Chrome ou ao DevTools; ela serve como controle operacional, não como
barreira de segurança forte. A validação definitiva deve existir no servidor.
