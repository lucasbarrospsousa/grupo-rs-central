# Logs do sistema — Central web

## Entrega

Aba exclusiva de lucasabm, no menu lateral. Filtros por usuário, módulo, resultado, período e busca por usuário/ação/registro; paginação de 50 linhas, cards animados, detalhes com antes/depois, movimento reduzido e disposição para celular.

O servidor registra acessos, consultas e solicitações de alteração, com resultado HTTP e identidade da sessão. Gatilhos transacionais capturam alterações em equipamentos, atendimentos, itens/movimentos do armazém, usuários/permissões e operações remotas. A interface registra navegação, botões, pesquisas, filtros e início de exportações separadamente: interação não significa gravação nem download concluído. Consultas automáticas de estoque/saúde/panorama e pulsos de sessão não são ações humanas no diário HTTP.

Senhas, hashes, cookies, tokens, comandos SMS e texto livre dos formulários não são copiados. Redefinição de senha registra apenas que houve alteração. Antes/depois usa lista explícita de campos operacionais; textos livres e alterações anteriores que não tinham detalhes não são reconstruídos. Processos sem identidade humana são identificados como Sistema; Configurador utiliza sua conta de serviço.

## Retenção e segurança

Nova tabela privada system_logs: últimos 10.000 registros ou 8 MiB de conteúdo JSON, o primeiro limite alcançado. O descarte automático alcança somente essa tabela nova. A tabela audit_events original permanece integralmente preservada; seus eventos recentes foram incorporados com indicação de histórico anterior.

O painel distingue conteúdo lógico, espaço alocado com índices e tamanho do banco completo. Não presume quota nem espaço livre do plano do provedor. Não há acesso anônimo, edição ou exclusão dos logs pela API. O papel de execução só pode selecionar/inserir; manutenção da retenção usa função restrita. Detalhes de alterações são gravados na transação do cadastro. Falha na auditoria complementar HTTP sinaliza cabeçalho/aviso, sem anunciar falha de uma operação já confirmada pelo banco.

## Validação

- Regressão: 120 testes aprovados, mais um teste focado adicional para resposta HTTP 200 com resultado negativo de integração.
- API publicada: administrador HTTP 200; leitor HTTP 403. Primeira leitura medida em aproximadamente 2,9 s. Site versão 31 publicado.
- Testes unitários: redaction, exclusão de polling, autorização, datas e ordem de persistência/resposta.
- SQL em transação desfeita: autor, antes/depois, proteção de senha, limite de 10.000 e orçamento de bytes.
- API com papel real de execução em transação desfeita: 11 verificações, incluindo edição sintética, leitor bloqueado e impossibilidade de apagar logs.
- Chrome: filtros, páginas, detalhes, conteúdo escapado, falha de consulta, limpar filtros e largura móvel.
- Backup privado anterior à migração e restauração isolada após inclusão da nova tabela. Nenhum registro operacional usado como teste de edição.
- Fixture de teste antigo do armazém atualizada para declarar a permissão de escrita que já era exigida pela API.

## Operação

node tools/migrate-system-logs.mjs aplica exclusivamente a migração 18 após a 17.
node tools/test-system-logs-sql.mjs e node tools/test-system-logs-api.mjs desfazem os dados sintéticos.
node tools/build-hosting.mjs prepara o Site, API e worker de backup. node tools/deploy-backup-worker.mjs atualiza somente o código do worker existente; não muda agendamento nem credenciais.

Dados reais, imagens de clientes, credenciais e arquivos de backup SQL ficam fora do GitHub e da cópia pública de código.
