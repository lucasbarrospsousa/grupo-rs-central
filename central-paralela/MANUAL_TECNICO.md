# Central paralela — login

Raiz: `Grupo RS Central/app/central-paralela`. Projeto web independente dentro do repositório existente, sem alterar o frontend da Central atual. Cloudflare Worker `central-paralela`; assets estáticos em public. Não gera EXE/instalador.

## Funcionamento
Login, sessão e logout usam a autenticação existente em central-api. Mesmos usuários ativos, validação de senha, limite de tentativas por IP, expiração e permissões. Cookie exclusivo parallel_session, HttpOnly, Secure e SameSite Strict; CSRF exigido pelo backend. Senhas nunca são salvas em localStorage nem enviadas ao Drive. A tela após login confirma acesso, sem módulos operacionais. Todas as outras rotas API são recusadas. Desligamento administrativo do backend permanece aplicável.

## Configuração
Cloudflare secret CENTRAL_BRIDGE_TOKEN: usar o segredo existente através de stdin; nunca incluir o valor em arquivo público ou Git. Não há conexão SQL direta nem chave administrativa no navegador. Publicação: `wrangler deploy --config wrangler.json` nesta pasta. Verificação estrutural: `node --check worker.mjs` e `node --check public/app.js`. Testes offline: `node --test worker.test.mjs`. Prévia: `wrangler dev --config wrangler.json`; para testes isolados, substituir fetch por respostas sintéticas, sem APIs reais.

## Drive conectado — 26/10/2026
Pasta privada exclusiva `Grupo RS Central — Projeto paralelo`, criada na conta escolhida pelo usuário. Credenciais OAuth existentes foram reutilizadas sem ampliar o escopo Google; compartilham a autorização de aplicativo dos backups atuais. Revogar essa autorização pode interromper ambas as integrações. A restrição à nova pasta é aplicada pelo código; a credencial Google não é exclusiva dessa pasta. Nenhum arquivo dos backups foi alterado.

Configuração do servidor no secret Cloudflare `DRIVE_CONFIG`, nunca em assets/Git/backup. Cópia protegida local em `.secrets/homologacao/parallel-drive.json`. `setup-drive.mjs` exige `DRIVE_EXPECTED_ACCOUNT`, confere a conta online, busca ou cria pasta identificada pelo projeto, verifica propriedade/privacidade/escrita, grava e relê JSON sintético e envia somente esse arquivo temporário à lixeira. Não executá-lo em cada abertura.

GET `/api/drive-status` consulta a sessão no backend original e exige `permissions.owner === true` antes de acessar Google. Confere conta e pasta, sem retornar tokens, ID da pasta ou e-mail. Não permite fornecer IDs arbitrários nem listar/baixar backups. Não há chamada automática do Drive ao abrir o login, nem rotina recorrente.

Validação: nove testes offline (login/proxy, isolamento de cookie, CSRF encaminhado, tamanho, conta errada, pasta compartilhada, usuário comum/anônimo, falha OAuth e administrador). Teste real de criação, gravação, leitura e limpeza de arquivo sintético passou; pasta conferida no Chrome. Nenhuma API de operadora/rastreamento foi consultada.

Esta entrega conecta armazenamento. Usuários, senhas, sessões, permissões e dados operacionais continuam no banco atual; não houve migração de PostgreSQL para Drive. A aplicação segue com somente a tela de login. Novos módulos deverão definir formatos, autorização por registro, concorrência e recuperação antes de guardar dados operacionais no Drive.

## Validação e publicação — 26/10/2026
URL publicada: https://central-paralela.sinderacode.workers.dev . Quatro testes de Worker passaram; teste funcional local com Playwright validou login inválido/válido, restauração, logout, visualização de senha e largura móvel, sem conexões externas. No publicado, página HTTP 200, sessão anônima HTTP 401 e rota operacional HTTP 404. Login com credenciais reais ainda depende da conferência do usuário; nenhuma senha de usuário foi usada nos testes.
