# Integração Configurador RS300

POST `/internal/configurator`, servido pela Edge Function central-api, aceita
somente `preflight` e `save`. Autenticação dedicada por segredo restrito, guardado
no cofre Windows do Configurador; nenhuma senha SQL é distribuída ao aplicativo.
Identidade de serviço sem login pessoal, com permissões de operador nas quatro
bases. `tools/setup-configurator.mjs` prepara identidade e segredo privado;
`tools/deploy-edge.mjs` publica as variáveis quando o arquivo privado existe.

Pré-consulta verifica base/versão. Save exige série/ICCID/telefone confirmados
pela consulta somente leitura da plataforma. Transação aplica bloqueios de
conflito, controle de versão, auditoria, releitura e recibo idempotente. Os status
seguem as regras existentes do Configurador. A API não registra equipamentos na
plataforma: essa etapa continua sob responsabilidade do Configurador.

`node web/tools/test-configurator-sql.mjs` usa usuário e registros descartáveis,
plataforma simulada e restaura o estado original do sincronizador no finally.
Nunca usar esse teste como comprovação de configuração física ou cadastro real.
18 verificações passaram, incluindo pedidos concorrentes iguais; suite web com
59 testes aprovada. Pré-consulta HTTPS real do aplicativo também confirmada.
