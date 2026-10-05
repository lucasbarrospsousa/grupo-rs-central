# Navegação e dados da sessão — 05/10/2026

Armazém, Painel SMS e Vinculação aparecem apenas em Imperatriz. Trocar a filial enquanto um desses módulos está aberto encaminha para um módulo disponível; não exclui funções, registros ou permissões do servidor.

Ao entrar/restaurar a sessão, dispositivos, histórico de manutenções e armazém de Imperatriz são pré-carregados em paralelo, respeitando filiais e módulos autorizados. Cada carregamento é independente. Navegar reutiliza os dados; requisições simultâneas são deduplicadas. Falhas continuam pendentes para nova tentativa ao abrir o módulo.

Dados permanecem somente na memória da sessão, separados por filial. Sair limpa o cache e descarta respostas atrasadas. Salvar/excluir/transferir e atualização manual continuam invalidando os dados afetados. Manutenções possui Atualizar histórico para conferir alterações de outras sessões. Armazém mantém sua atualização periódica enquanto aberto.

Comunicação e chips da página do estoque também são reaproveitados ao voltar: até 1 minuto para comunicação e 3 minutos para chip. As consultas periódicas existentes continuam apenas na página visível; pré-carregar os cadastros não inicia uma varredura de integrações de todos os aparelhos.

Validação: node --test web/tests/lazy-load.test.mjs web/tests/communication-flow.test.mjs; node web/tools/test-session-navigation-ui.mjs (Playwright via PLAYWRIGHT_MODULE quando fora do projeto). Dados sintéticos; nenhum cadastro ou SMS operacional nos testes.
