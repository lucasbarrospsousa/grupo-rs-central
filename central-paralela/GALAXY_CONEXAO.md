# Conexão própria do Galaxy — Central paralela

Estado: protocolo preparado; exige configurar/adaptar o cliente Galaxy ou sua ponte para estes endpoints. Não modificar o aplicativo ou a ponte da Central original automaticamente.

1. Administrador abre Rastreamento, escolhe filial, Integrações, Preparar conexão própria do Galaxy.
2. Guarda no cliente autorizado o endpoint HTTPS, filial e token Bearer exibidos. Nova preparação invalida o token anterior. Nunca colocar esse token no GitHub, em URL, relatório ou log.
3. Cliente envia POST /api/galaxy, Content-Type application/json, Authorization Bearer TOKEN, corpo {"action":"poll","branch":"imperatriz"}. Use intervalo de pelo menos 10 segundos, respeite 429 e não faça chamadas paralelas.
4. Resposta job:null confirma contato sem mensagem. Somente após um contato válido, a tela permite enviar SMS explicitamente. A fila confirma telefone por série na API antes de aceitar o envio e revalida o acesso do solicitante antes da entrega ao cliente.
5. Se job existir, contém id, lease, serial, phone e command. O cliente precisa persistir id ANTES de enviar o SMS e nunca repetir um id. A fila não redistribui automaticamente mensagens entregues ao cliente, mesmo após queda de conexão.
6. Confirmar com POST no mesmo endpoint e credencial: {"action":"ack","branch":"imperatriz","id":"ID","lease":"LEASE","state":"sent"}. Estados permitidos: sent, delivered, failed, indeterminate. Não reportar delivered sem confirmação da operadora. Se houver dúvida se enviou, usar indeterminate e conferir manualmente; nunca reenviar automaticamente.

Sem contato recente (120 segundos), o envio fica bloqueado. Mensagem não retirada em dez minutos expira. Usuário desativado/permissão revogada cancela pedido ainda não entregue ao cliente. Tokens ficam somente no dispositivo/ponte e hash privado no Drive. A entrega real só será testada após a conexão do dispositivo ser autorizada e concluída.
