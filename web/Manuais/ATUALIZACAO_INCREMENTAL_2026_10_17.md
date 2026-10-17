# Atualização incremental — 17/10/2026

Aparelhos e armazém conservam a carga inicial e pedem alterações usando `since`. A primeira resposta inclui um cursor; sem mudanças, a resposta não contém listas. O merge aplica inclusões, alterações, remoções e movimentações; versão/sessão/geração impedem respostas antigas de sobrescrever operações recentes. Contagens usam o mesmo marcador para evitar agregações repetidas.

Migração 057 mantém um marcador por entidade/filial, não um log infinito por consulta. Gatilhos cobrem aparelhos, observações, armazém e movimentos; também invalidam o ICCID derivado no armazém e a filial anterior em transferências. Relógio transacional com trava antes das escritas evita perder transações que confirmam fora da ordem. Escritas concorrentes podem aguardar essa trava; alterações acrescentam metadados pequenos ao banco. Leituras usam snapshot consistente. Não há varredura externa adicional nem agendamento novo.

A lista de aparelhos aproveita a requisição de comunicação já existente no estoque. Armazém mantém seu polling governado atual. Demais telas recebem as mudanças na próxima atualização normal; não é push instantâneo. Cache vazio, marcador futuro ou mais de 2.000 entidades modificadas resultam em carga completa. Cache de sessão mantém expiração e isolamento atuais. Dados perdidos não são substituídos por listas vazias em erros.

Permissões de módulos, filial, RLS, CSRF e autenticação permanecem nas rotas existentes. Nenhuma consulta removida é reativada. Layout e ritmo das integrações externas inalterados.

Validação: testes Node de delta/cache/recibos/permissões; `node web/tools/incremental-reads.mjs test` valida SQL em rollback. Aplicar a migração com `deploy`, construir com `node web/tools/build-hosting.mjs`, publicar API e frontend da mesma revisão. Não reexecutar importadores. Para reversão de aplicação, o backend antigo ignora as tabelas adicionais; não apagar marcadores em uso.

## Reabertura com cache local — 17/10/2026
Aparelhos e armazém podem reaparecer após fechar a aba, usando localStorage com validade máxima de 24 horas. A sessão é validada no servidor antes de vincular o cache à identidade, às bases e às permissões atuais. Mudanças de acesso ou usuário invalidam a cópia anterior; CSRF e credenciais não são armazenados. O cursor salvo permite revalidar apenas mudanças pelos mesmos fluxos de atualização existentes. O aviso de cópia local usa o espaço já existente, sem mudança de layout.
Logout e HTTP 401 removem os snapshots. Respostas tardias e gravações de outra aba após logout não os recriam. Armazenamento indisponível, expirado ou acima do limite de 2 milhões de caracteres mantém o carregamento normal; o cache é uma otimização, não a fonte oficial. Não foram adicionadas consultas externas, rotinas ou timers.
Validação offline: reabertura com nova instância, bloqueio antes da sessão, CSRF renovado, permissões/base/usuário diferentes, delta com cursor, logout, resposta atrasada e outra aba.
