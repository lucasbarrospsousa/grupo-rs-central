# Central paralela — Drive e Cloudflare

Raiz: Grupo RS Central/app/central-paralela. Aplicação experimental independente da Central original. Worker público: https://central-paralela.sinderacode.workers.dev . Não gera EXE ou instalador.

## Login independente — 26/10/2026
O runtime não consulta Supabase. auth.mjs lê cadastro criptografado no Drive, valida hashes scrypt ou legacy-sha256 e preserva usuários ativos, filiais e permissões copiados. auth-crypto.mjs usa AES-256-GCM com IV aleatório e contexto autenticado. A chave AUTH_DATA_KEY fica em segredo Cloudflare, separada do Drive. Nunca salvar senha em texto, hash ou token em assets, Git, relatórios públicos ou localStorage.

AuthService é um Durable Object SQLite do Cloudflare usado somente para estado temporário de segurança: hashes dos tokens de sessão, CSRF, expiração, atividade e contadores por IP/usuário. Não armazena o cadastro de usuários nem hashes de senha. Isso evita escritas concorrentes em arquivo Drive para cada acesso. O sistema depende de Drive + Cloudflare, mas não de Supabase em execução normal.

Cookie exclusivo parallel_drive_session, HttpOnly, Secure, SameSite Strict. Sessão de 12 horas no máximo e 2 horas de inatividade. CSRF e origem exigidos nas mutações. Limite de 10 tentativas/minuto por IP e por nome, armazenado com transação. Logout revoga o token no servidor. Uma tarefa de limpeza interna horária remove sessões e contadores vencidos. Sessões anteriores da Central são ignoradas. Em cada consulta de sessão, o cadastro do Drive é validado novamente; inativação, senha ou permissão alterada invalidam a sessão. Falha de Drive ou de descriptografia recusa acesso, sem fallback para outro banco.

## Importação autorizada e segredos
copy-users.mjs lê users/memberships/user_permissions em transação somente leitura na origem, exclui contas service- e grava novo arquivo criptografado versionado. Confere leitura/descriptografia antes de atualizar .secrets/homologacao/parallel-drive.json. Três usuários ativos foram copiados na implantação inicial. Chave de recuperação privada: .secrets/homologacao/parallel-auth-key.txt. Não incluída no backup público; sua perda impede descriptografar o cadastro. Não executar novamente sem intenção explícita de atualizar o retrato; mudanças da Central original não sincronizam automaticamente. Não existe tela de administração de usuários nesta etapa.

DRIVE_CONFIG contém OAuth, conta esperada, pasta privada, auth_file_id e snapshots por filial. Atualizar via stdin do Wrangler, nunca imprimir. AUTH_DATA_KEY é configurada da mesma forma. CENTRAL_BRIDGE_TOKEN não é mais usado. A autorização OAuth reaproveitada dos backups possui escopo drive.file; não foi ampliada. A restrição à pasta paralela é aplicada pelo código; o token não é exclusivo dessa pasta. Revogação da autorização Google pode interromper ambas as integrações. Backups originais permanecem intactos.

## Indicadores experimentais
copy-dashboard.mjs consulta somente o banco salvo, com identidade do administrador e filiais autorizadas; gera JSON agregado por filial: totais por situação, operadora e modelo. Não contém registros pessoais. GET /api/dashboard?branch=<id> exige módulo overview e vínculo à filial obtidos do cadastro criptografado. Indicadores vêm exclusivamente do Drive; arquivos de outra filial, compartilhados ou fora da pasta são rejeitados. O retorno identifica source, snapshot e copiedAt. Não há sincronização automática, escrita operacional ou chamada a fornecedores. A interface do dashboard ainda está em preparação visual.

GET /api/drive-status exige owner. Não retorna credenciais. setup-drive.mjs requer DRIVE_EXPECTED_ACCOUNT e serve somente para configuração inicial, testando gravação/leitura de arquivo sintético e enviando esse arquivo à lixeira. Scripts de configuração/importação são locais, fora dos assets, e não são carregados pelo Worker.

## Testes e publicação
Comandos na pasta: node --test auth.test.mjs drive.test.mjs worker.test.mjs; node test-ui.mjs (Playwright disponível); wrangler deploy --config wrangler.json. Prévia: wrangler dev --config wrangler.json. Configuração do Durable Object em wrangler.json, migração auth-v1; preservar a classe/binding para manter sessões e limites. Não alterar a Central original.

14 testes offline passaram: cifragem e adulteração, hashes, senha errada, conta inativa, limite de tentativas, sessão/CSRF/logout, expiração e alteração de permissões, privacidade Drive, isolamento por filial e bloqueio de APIs operacionais. Interface: teste sintético de entrada/saída e largura móvel. Na publicação, tentativa fictícia retornou 401 e sessão anônima 401. Nenhuma senha real foi usada; validação positiva de usuário real cabe ao titular.

## Limites do experimento
Ainda não é migração integral do banco nem prova de concorrência/transações operacionais no Drive. As primeiras medições locais da leitura validada do Drive foram 1,7–2,2 s para uma filial; agregação SQL de todas as filiais 0,64 s (operações diferentes, amostra pequena). A leitura do cadastro a cada sessão adiciona latência. Medir antes de ampliar uso. AuthService e conta Google devem permanecer disponíveis. Não tratar a cópia datada como dados ao vivo.
