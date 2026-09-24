# Backups privados da Central

Escopo: schema SQL `central_homologacao`, todas as filiais, inclusive dados de usuários,
permissões internas, aparelhos, chips, visitas, movimentações, auditoria e observações.
Não é uma cópia de outros schemas/projetos, arquivos Supabase Storage ou dos segredos
de execução das integrações. O código e a configuração de publicação têm recuperação
separada. Nenhum dado operacional, chave ou arquivo criptografado entra no GitHub.

## Funcionamento

`central-backup` é uma função separada no Supabase. Um dispatcher `pg_cron` a chama
às xx:17 UTC. A rotina consulta o vencimento persistido no banco: cópia diária às
05:17 UTC (02:17 America/Fortaleza) e nova tentativa uma hora depois em falha
transitória. Fora do horário da cópia, confere o espaço e os arquivos do Drive no
máximo uma vez por hora. Não depende de computador, navegador, Codex ou login aberto.

Uma lease persistida de 15 minutos impede sobreposição. Interrupções deixam o estado
atrasado/falho visível; a próxima execução pode recuperar a lease expirada. Credencial
revogada, conta divergente, pasta compartilhada ou permissão recusada pausam a rotina
até corrigir a configuração. Um token de acesso expirado é renovado uma única vez;
não existe ciclo infinito de autenticação.

O snapshot usa REPEATABLE READ/READ ONLY e conserva zeros de séries/ICCID. Inclui
os dados das tabelas, migrações SQL, colunas/tipos, constraints, índices, funções,
sequências, políticas e triggers. Compactação gzip e AES-256-GCM com nonce aleatório,
cabeçalho autenticado e SHA-256 dos bytes cifrados. A chave de 256 bits fica separada
do Drive. O limite preventivo por snapshot descompactado é 24 MiB; excedê-lo gera
falha explícita, nunca uma cópia parcial bem-sucedida.

A rotina envia a cópia, baixa os bytes novamente, confere o hash, decifra e restaura
em tabelas temporárias. Compara todos os campos, inclusive JSON aninhado, e valida
PK/unique/check/FK. Finaliza com ROLLBACK: não substitui tabelas operacionais.
Esse teste valida dados e constraints; não equivale a simular a perda completa da
conta Supabase, das credenciais externas e do ambiente de hospedagem.

Somente após a cópia validada, remove cópias verificadas desta própria rotina com
mais de 30 dias. Sempre preserva pelo menos as duas mais recentes. A pasta deve ser
privada e pertencer ao proprietário confirmado. Arquivos alheios ou não verificados
não são apagados automaticamente. A quantidade no painel é lida do Drive, não a
quantidade histórica de execuções no banco.

## Configuração e autorização

1. `node web/tools/setup-backups.mjs`: migração 012, login SQL dedicado e arquivos
   privados em `.secrets/homologacao`. Não ativa uploads.
2. Google Cloud: projeto exclusivo de backup, API Drive ativada, OAuth Desktop.
   Salvar o JSON em `.secrets/homologacao/google-backup-client.json`.
   Usar somente escopo `drive.file` (arquivos criados/autorizados para este app).
   Não usar service account em Drive pessoal nem reutilizar a conexão do Codex.
3. Configurar OAuth em produção antes da autorização definitiva; no modo de teste,
   o Google pode expirar o refresh token em sete dias. Produção OAuth não publica
   a pasta nem o banco; o acesso continua dependendo do consentimento da conta.
4. `node web/tools/connect-backup-drive.mjs`: fluxo loopback com state e PKCE,
   conferência da conta solicitada e gravação privada do refresh token. O usuário
   realiza o consentimento. Segredos nunca são impressos.
5. `node web/tools/build-hosting.mjs`; `node web/tools/activate-backups.mjs`:
   pasta privada, secrets do servidor, worker separado, primeira cópia real na nuvem,
   restauração isolada e somente depois agendamento. Se a primeira cópia falhar,
   não considerar a rotina validada/ativada. Conferir o erro e executar novamente.
6. `node web/tools/deploy-edge.mjs` publica a API de status. Publicar o Site pelo
   fluxo Sites para disponibilizar o card. Preservar o acesso exclusivo do proprietário.

Arquivos privados: `backup-key.txt` (chave de recuperação), `backup-google.json`,
`backup-db.json`, `backup-token.txt`, `backup-config.json`. Nunca incluir esses
arquivos em logs, anexos, repositório ou pacote não sensível de código. Guardar uma
cópia da chave de recuperação em local protegido separado do Drive de backups.
Perder todas as cópias dessa chave torna os backups cifrados irrecuperáveis.

## Painel e verificações

Visão geral: último sucesso, próxima tentativa, contagem real de cópias verificadas,
bytes das cópias, cota da conta, data da conferência e últimas cinco execuções.
O espaço total é compartilhado entre Drive, Gmail e Fotos; cota desconhecida aparece
como não consultada. Backup com mais de 26 horas aparece atrasado. O card atualiza
o estado registrado a cada minuto; a informação do Drive é conferida a cada hora.
Somente usuário administrador autenticado acessa `/api/backups/status`.

Validações:
- `node --test web/tests/backups.test.mjs`: corrupção, chave incorreta, renovação,
  pausa por revogação, conta/pasta incorreta, paginação, retenção, concorrência,
  sequência upload/download/restore e estados do card.
- `node web/tools/test-backups-sql.mjs`: snapshot real somente leitura, arquivo
  privado cifrado, restauração em tabelas temporárias e testes de permissões.
- `node web/tools/verify-drive-backup.mjs`: baixa a última cópia verificada do Drive
  e repete a restauração isolada. Não realiza restauração destrutiva.

## Recuperação

Preservar primeiro o banco atual. Baixar a cópia desejada com autorização do
proprietário; obter a chave guardada separadamente. `decryptBackup` e `verifyRestore`
em `backend/backup-snapshot.mjs` permitem decifrar e conferir sem sobrescrever dados.
Restaurar inicialmente em banco isolado: reconstruir schema com as migrações e
definições do snapshot, importar os dados preservando identidades e repor sequências.
Manter sincronização, backup e SMS desativados; invalidar sessões antigas. Credenciais
e autorizações do servidor devem ser repostas de seus cofres, não do arquivo do Drive.
Somente após conferir contagens, constraints, login e fluxos funcionais autorizar a
substituição do banco operacional. Não executar automaticamente SQL de uma cópia
recebida de terceiros.

## Custos e limites

Usa o Supabase e o armazenamento gratuito já existentes. Sem contratação de cobrança
Google Cloud. Drive cheio interrompe a cópia; não compra armazenamento. Cotas e
condições gratuitas dos provedores podem mudar. A cópia diária implica perda potencial
das alterações realizadas desde o último snapshot em caso de recuperação.
