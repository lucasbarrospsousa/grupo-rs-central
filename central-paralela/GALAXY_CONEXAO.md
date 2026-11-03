# Conexão própria do Galaxy — Central paralela

Estado: sessão global de SMS do RS Gateway Mobile implantada no Worker da Central paralela. A rota legada por token continua disponível para clientes pareados por filial. A Central original permanece fora deste fluxo.

## Sessão global — Central-only

`POST /api/galaxy` sem `branch` na URL ou no corpo usa a sessão autenticada da plataforma. A sessão precisa ter permissão SMS e filiais autorizadas. O Worker consulta somente essas filiais e reúne as filas existentes, que continuam salvas no documento privado de cada filial. A filial de cada pedido é determinada pelo documento de origem do lote, não por alternância/round-robin; todo item de `jobs[]`, inclusive resumos sem payload, e todo payload incluem `branch`. Lotes permanecem juntos e a Central escolhe primeiro o pedido mais antigo entre as filas autorizadas. A conexão global grava presença no Durable Object e preserva os estados de gateway das quatro cópias de filial.

Contrato do cliente para o modo global: não enviar `currentBranch` nem `branch` no poll; usar o `branch` do payload em cada recibo (`reports: [{id, branch, device_id, state}]`) e preservar também o `device_id` estável da instalação. O resultado de cada recibo em `report_results` informa sua filial. Recibo sem filial ou com filial divergente é rejeitado. Repetições de payload continuam limitadas à mesma instalação identificada por `device_id`, somente antes de `received`; o prazo vencido vira `indeterminate` e não reenvia. O servidor não altera ou identifica um SMS como entregue sem recibo correspondente.

O RS Gateway Mobile 1.5.12 usa esta sessão global para a Central. Polls e recibos passam por `/api/galaxy` sem query de filial; o app preserva o `branch` recebido e o envia nos recibos, junto ao identificador estável da instalação. A rota legada por filial continua disponível para clientes antigos. O fluxo de Vendas SOS usa `/api/mobile-gateway` e não foi alterado. Esta revisão não fez envio real de SMS.

## Conexão legada por filial

O protocolo abaixo permanece disponível para clientes pareados por filial. Não é necessário para o modo global de sessão.

1. Administrador abre Rastreamento, escolhe filial, Integrações, Preparar conexão própria do Galaxy.
2. Guarda no cliente autorizado o endpoint HTTPS, filial e token Bearer exibidos. Nova preparação invalida o token anterior. Nunca colocar esse token no GitHub, em URL, relatório ou log.
3. Cliente envia POST /api/galaxy, Content-Type application/json, Authorization Bearer TOKEN, corpo {"action":"poll","branch":"imperatriz"}. Use intervalo de pelo menos 10 segundos, respeite 429 e não faça chamadas paralelas.
4. Resposta job:null confirma contato sem mensagem. Somente após um contato válido, a tela permite enviar SMS explicitamente. A fila confirma telefone por série na API antes de aceitar o envio e revalida o acesso do solicitante antes da entrega ao cliente.
5. Se job existir, contém id, lease, serial, phone e command. O cliente precisa persistir id ANTES de enviar o SMS e nunca repetir um id. A fila não redistribui automaticamente mensagens entregues ao cliente, mesmo após queda de conexão.
6. Confirmar com POST no mesmo endpoint e credencial: {"action":"ack","branch":"imperatriz","id":"ID","lease":"LEASE","state":"sent"}. Estados permitidos: sent, delivered, failed, indeterminate. Não reportar delivered sem confirmação da operadora. Se houver dúvida se enviou, usar indeterminate e conferir manualmente; nunca reenviar automaticamente.

Sem contato recente (120 segundos), o envio fica bloqueado. Mensagem não retirada em dez minutos expira. Usuário desativado/permissão revogada cancela pedido ainda não entregue ao cliente. Tokens ficam somente no dispositivo/ponte e hash privado no Drive. A entrega real só será testada após a conexão do dispositivo ser autorizada e concluída.

## Cliente Android operacional — 27/10/2026
A preparação genérica acima continua como referência de protocolo. O Galaxy instalado usa o adaptador android-v2 em `/api/galaxy?branch=imperatriz`, cabeçalho `x-rs-gateway`, ações poll/report e estados received/sending/sent/delivered. Credencial protegida no Android Keystore. Pareamento concluído e teste único com estado sent confirmado; não confundir com delivered ou execução do comando. Manter internet e SIM com serviço SMS, envio habilitado e funcionamento com tela apagada autorizado. Não refazer o pareamento apenas para consultar status, pois isso revoga o token anterior. O telefone funciona sem USB/PC no modo Central online. Não reutilizar simultaneamente a ponte antiga para a mesma fila.
