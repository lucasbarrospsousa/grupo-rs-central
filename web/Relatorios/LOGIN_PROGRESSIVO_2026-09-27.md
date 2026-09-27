# Carregamento por página — 27/09/2026

A autenticação e as permissões continuam obrigatórias. Após confirmar a sessão, a estrutura da interface aparece imediatamente, com placeholders enquanto os dados da página são consultados.

Visão geral/estoque/vinculação/cadastro em massa/rastreamento carregam equipamentos; manutenção usa equipamentos e histórico; armazém consulta apenas seu conjunto; SMS, configurações e usuários conservam suas consultas próprias. Requisições simultâneas iguais são reaproveitadas. Falhas têm opção de tentar novamente e não são convertidas em contagens zero. Respostas de páginas anteriores não redesenham a página atual. Invalidação após mutações impede uma resposta antiga de sobrescrever dados novos.

Validação: 13 testes locais passaram, incluindo autenticação, permissões, histórico, deduplicação, falhas, logout e troca de filial durante resposta pendente. Teste no Chrome headless com API simulada: estrutura visível em 338 ms, com equipamentos atrasados em 2.500 ms; navegação para armazém durante espera, resposta atrasada, recuperação de falha de manutenção e botão de recolher menu passaram, sem erros JavaScript não tratados. O tempo não representa latência de produção; nenhuma senha real foi usada e nenhum registro operacional foi alterado.

A consulta de equipamentos ainda retorna o conjunto da filial. Paginação no servidor não fez parte desta mudança; agora ela não bloqueia a estrutura de navegação nem dispara consultas desnecessárias de manutenção/armazém no login.