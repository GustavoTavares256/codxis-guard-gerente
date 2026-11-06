# Textos para a Chrome Web Store (visibilidade: **Não listada**)

Cole cada campo no Painel do Desenvolvedor. Pacote para enviar: `dist/codxis-guard-<versão>.zip`
(gere com `npm run pack`).

## Aba "Listagem da loja"

**Nome** (máx. 45): `Codxis Guard - Senha do Gerente`

**Resumo** (máx. 132, vem do manifest):
`Exige a senha do gerente para cancelar venda, remover item, alterar preço e dar desconto no PDV web da Codxis.`

**Categoria:** Produtividade (ou "Ferramentas")  **Idioma:** Português (Brasil)

**Descrição detalhada:**

```
O Codxis Guard protege o PDV web da Codxis (web.codxis.api.br) com a senha do gerente.

Pede a senha do gerente antes de:
• Cancelar uma venda (botão ou tecla F9)
• Remover um item da venda (botão ou tecla F7)
• Alterar o preço unitário de um produto
• Confirmar um desconto acima do limite do vendedor

Também inclui:
• Registro de todas as autorizações e negações (data, ação, produto, valor), com exportação em CSV
• Bloqueio temporário após tentativas de senha incorretas
• Frente de caixa em abas (Produtos | Pagamento) em tela cheia; a tecla F4 volta ao layout original
• Restauração dos itens da venda quando a página é recarregada
• Produtos inativos destacados em vermelho na consulta de produtos
• Visual igual ao do sistema, com tema claro e escuro

Privacidade: as senhas são guardadas apenas como hash no próprio navegador. A extensão não envia
nenhum dado para servidores e só atua em web.codxis.api.br.

Extensão independente, criada para uso com o PDV web da Codxis. É preciso cadastrar a senha de
administrador e a senha do gerente na página de Opções no primeiro uso.
```

**Ícone da loja (128×128):** `extension/icons/icon128.png`

**Capturas de tela (1280×800 ou 640×400, mínimo 1):** veja `store/PUBLICAR.md`.

## Aba "Práticas de privacidade"

**Finalidade única:** Exigir a senha do gerente (e registrar a autorização) antes de ações sensíveis do
PDV web da Codxis, além de pequenos ajustes de layout desse mesmo PDV.

**Justificativa da permissão `storage`:** Guardar localmente o hash das senhas, o log de autorizações e as
configurações da extensão.

**Justificativa do acesso ao host `https://web.codxis.api.br/*`:** É o único site em que o PDV funciona. A
extensão lê os botões, a lista de itens e os valores da tela para interceptar as ações protegidas e pedir a
senha. Não há acesso a nenhum outro site.

**Código remoto:** Não. Todo o código está no pacote; não há `eval`, nem scripts externos.

**Dados do usuário (declaração):**
- Informações de autenticação: **sim** — apenas hash das senhas, guardado localmente; não é transmitido.
- Conteúdo do site / atividade do usuário: lido localmente na página do PDV; **não** é transmitido.
- Marque as três certificações: não vende dados a terceiros; não usa nem transfere dados para fins não
  relacionados à finalidade única; não usa nem transfere dados para avaliar crédito/empréstimos.

**URL da política de privacidade:**
`https://github.com/GustavoTavares256/codxis-guard-gerente/blob/main/store/PRIVACY.md`

> Atenção: o repositório precisa estar **público** para essa URL abrir para o revisor da loja.

## Aba "Distribuição"

- **Visibilidade:** Não listada (Unlisted) — só instala quem tiver o link.
- **Regiões:** Todas (ou só Brasil).
