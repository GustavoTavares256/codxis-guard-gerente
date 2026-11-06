# Política de Privacidade — Codxis Guard

**Última atualização:** novembro de 2026

O **Codxis Guard** é uma extensão de navegador que exige a senha de um gerente antes de ações sensíveis no
PDV web da Codxis (`https://web.codxis.api.br`): cancelar venda, remover item, alterar preço e dar desconto
acima do limite.

## Resumo

- A extensão **não envia nenhum dado** para servidores, para o desenvolvedor ou para terceiros.
- Tudo o que ela guarda fica **somente no seu navegador**.
- Ela **não usa** anúncios, rastreamento, análises (analytics) nem cookies próprios.
- Ela **não vende nem compartilha** dados.

## Dados guardados no seu navegador

| Dado | Para quê | Onde fica |
|---|---|---|
| Senha do gerente e senha de administrador (somente o **hash PBKDF2-SHA256 com salt**, nunca a senha em texto) | Conferir a autorização | Armazenamento local da extensão |
| Tentativas incorretas e bloqueio temporário | Impedir tentativas repetidas | Armazenamento local da extensão |
| Registro de autorizações (data/hora, ação, produto, valor, autorizado/negado), até 5.000 itens | Auditoria; pode ser exportado em CSV por você | Armazenamento local da extensão |
| Configurações (empresa, teclas, textos de reconhecimento, cores) e o nome da última empresa vista na tela | Personalização | Armazenamento local da extensão |
| Códigos de produtos inativos (digitados ou aprendidos ao abrir a edição do produto) | Destacar produtos inativos | Armazenamento local da extensão |
| Código e quantidade dos itens da venda em andamento | Oferecer restaurá-los se a página for recarregada | Armazenamento da aba (`sessionStorage`), apagado ao fechar a aba |

## Acesso ao conteúdo das páginas

A extensão roda **apenas** em `https://web.codxis.api.br/*`. Nessas páginas ela lê o que já está na tela
(botões, lista de itens, valores, nome da empresa) para decidir quando pedir a senha e para destacar
informações. Esse conteúdo é processado **localmente** e não sai do navegador.

## Permissões

- `storage`: guardar as configurações e os dados acima no navegador.
- Acesso ao site `https://web.codxis.api.br/*`: é onde o PDV funciona e onde a extensão atua.

## Código

Todo o código está incluído no pacote da extensão. Ela **não baixa nem executa código remoto**.

## Seus controles

Você pode apagar todos os dados a qualquer momento removendo a extensão ou limpando seus dados em
`chrome://extensions` → Detalhes. O log de autorizações também pode ser apagado na página de Opções.

## Contato

Dúvidas sobre esta política: suporte.codxis@gmail.com
