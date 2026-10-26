# Central paralela — login

Raiz: `Grupo RS Central/app/central-paralela`. Projeto web independente dentro do repositório existente, sem alterar o frontend da Central atual. Cloudflare Worker `central-paralela`; assets estáticos em public. Não gera EXE/instalador.

## Funcionamento
Login, sessão e logout usam a autenticação existente em central-api. Mesmos usuários ativos, validação de senha, limite de tentativas por IP, expiração e permissões. Cookie exclusivo parallel_session, HttpOnly, Secure e SameSite Strict; CSRF exigido pelo backend. Senhas nunca são salvas em localStorage nem enviadas ao Drive. A tela após login confirma acesso, sem módulos operacionais. Todas as outras rotas API são recusadas. Desligamento administrativo do backend permanece aplicável.

## Configuração
Cloudflare secret CENTRAL_BRIDGE_TOKEN: usar o segredo existente através de stdin; nunca incluir o valor em arquivo público ou Git. Não há conexão SQL direta nem chave administrativa no navegador. Publicação: `wrangler deploy --config wrangler.json` nesta pasta. Verificação estrutural: `node --check worker.mjs` e `node --check public/app.js`. Testes offline: `node --test worker.test.mjs`. Prévia: `wrangler dev --config wrangler.json`; para testes isolados, substituir fetch por respostas sintéticas, sem APIs reais.

## Drive: pendente de autorização da conta correta
O usuário escolheu outra conta Google, diferente do conector disponível. Nenhum arquivo foi criado e nenhum dado foi migrado. Drive é armazenamento de arquivos, não substituto direto de PostgreSQL. Nesta fase usuários, senhas e permissões permanecem no banco atual.

Para habilitar o armazenamento: conectar a conta escolhida; criar pasta privada dedicada; autorizar identidade de servidor apenas nessa pasta (por exemplo conta de serviço com compartilhamento restrito); habilitar Drive API no projeto Google e disponibilizar a credencial exclusivamente como segredo Cloudflare. Depois implementar adaptador com operações explicitamente autorizadas, testar leitura/gravação de arquivo sintético e remoção desse arquivo. Não presumir que a autorização do conector ChatGPT concede autorização ao Worker. Não aceitar chaves ou tokens no formulário de login. A integração Drive NÃO está ativa nesta entrega.

Não usar Drive para replicar senhas, sessões ou permissões. Uma eventual migração do banco exige arquitetura específica e autorização separada. Não há consulta a APIs de rastreamento/operadoras nesta aplicação.

## Validação e publicação — 26/10/2026
URL publicada: https://central-paralela.sinderacode.workers.dev . Quatro testes de Worker passaram; teste funcional local com Playwright validou login inválido/válido, restauração, logout, visualização de senha e largura móvel, sem conexões externas. No publicado, página HTTP 200, sessão anônima HTTP 401 e rota operacional HTTP 404. Login com credenciais reais ainda depende da conferência do usuário; nenhuma senha de usuário foi usada nos testes.
