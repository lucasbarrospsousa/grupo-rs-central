# APN recebida do Configurador RS300

A rota interna do Configurador aceita `hinova.br` e `linksolutions.br`.
Clientes antigos sem o campo continuam usando Hinova. APNs desconhecidas
são recusadas antes de gravar. O cadastro e a verificação de idempotência
preservam a APN selecionada; Link participa da impressão digital do pedido,
mantendo compatibilidade com recibos anteriores de Hinova.

Autenticação, filial, versão, confirmação remota de série/chip/telefone,
conflitos e regras de Reserva/Estoque/Manutenção permanecem aplicados.
Teste local: `node --test web/tests/configurator.test.mjs` na raiz `app`.
Teste real autorizado em Imperatriz confirmou sincronização como Reserva
de um equipamento configurado com Link; dados operacionais não integram o Git.
