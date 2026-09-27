# SQL de homologação — 24/09/2026

## Escopo e estado

Projeto Supabase existente, schema privado `central_homologacao`, sem exposição no esquema público/Data API. O SQLite desktop permanece intocado. Esta etapa ainda não substitui o aplicativo em operação.

- Backup consistente de 24/09, integridade SQLite `ok`; hash e inventários guardados junto à cópia privada.
- Contagens de aparelhos conferidas por filial no inventário privado.
- Nomes `backups_*` convertidos por mapa explícito, sem usar placas como série. Filial de testes sem aparelhos excluída do mapa.
- Histórico de manutenção e movimentos preservado sem converter visitas antigas em novos atendimentos.
- Armazém separado importado com disponíveis/utilizados reconciliados. Configuração do scanner e credenciais não foram importadas.
- Telemetria, payloads de auditoria e estado de monitoramento automático não são importados nesta etapa.

## Acesso e execução local

Instalar dependências do `web/package.json` com pnpm. O lockfile fixa a versão.

```powershell
# Na pasta web
$env:CENTRAL_MODE='homologacao'
$env:PORT='4174'
node server.mjs
```

A aplicação escuta somente `127.0.0.1`. O modo padrão continua sendo demonstração, porta 4173, sem acesso a dados. Não expor este servidor diretamente à internet. Hospedagem pública exige HTTPS, `COOKIE_SECURE=1`, origem configurada/revisada e avaliação dos limites de infraestrutura.

O usuário local foi migrado com seu verificador de senha, sem revelar/copiar a senha em texto. No primeiro login válido, o verificador legado é substituído por scrypt com salt aleatório. A sessão é persistida no SQL, cookie HttpOnly/SameSite Strict e CSRF por sessão. Sair revoga a sessão. Os dados não são armazenados em localStorage.

Credencial administrativa é usada apenas por ferramentas de migração. O servidor usa `central_homologacao_web`, sem superusuário, criação de banco/roles ou bypass de RLS. Conexão TLS verifica o certificado oficial do Supabase; não usar `rejectUnauthorized:false`.

Arquivos necessários somente no diretório privado `.secrets/homologacao/`: senha SQL, certificado CA, credencial de runtime gerada pela migração, snapshots e inventários. Não publicar estes arquivos.

## Operações verificadas

`/api/devices?branch=...` oferece GET/POST; `/api/devices/:id?branch=...` oferece PUT/PATCH/DELETE. PUT substitui os campos editáveis; PATCH preserva os demais. DELETE faz exclusão recuperável. Cada gravação exige versão e chave de idempotência, verifica permissão/filial, grava auditoria na mesma transação. Alterar um aparelho para Instalado exige integração de vínculo e está bloqueado no CRUD genérico.

Login, sessão, logout; leitura de estoque, histórico e armazém; isolamento SQL por filial; criação/edição/exclusão de aparelhos foram testados em registros descartáveis. O SQL conserva os zeros iniciais de série e ICCID.

```powershell
node --test tests/*.test.mjs
# Teste real: somente schema de homologação; cria e remove identidades e linhas próprias
node tools/test-sql.mjs
```

## Limitações ainda abertas

- Integrações de consulta, baixa SQL e vinculação foram adicionadas em 24/09; ver INTEGRACOES.md para evidências e limites.
- SMS/gateway permanece pausado por decisão do usuário. Troca automática de aparelho e atualização do desktop permanecem fora desta entrega.
- Histórico SQL consultável; novos atendimentos podem ser registrados/editados sem executar troca automática de aparelho.
- Lucas confirmou o login com sua credencial habitual em 24/09/2026.
- A importação é uma fotografia do backup, não uma sincronização contínua com o desktop.

## Recuperação

O backup original e os snapshots permanecem preservados. Não restaurar por cima do desktop. Importações recusam destino já populado. Para reverter um teste, usar a trilha de auditoria e restaurar apenas linhas identificadas; não executar DROP/TRUNCATE genérico. Mudanças de schema são numeradas em `migrations/`. Guardar qualquer exportação operacional exclusivamente em diretório privado.

## Incidentes corrigidos nesta etapa

A renderização inicial aguardava a consulta de sessão, podendo apresentar branco durante a espera. Agora o login é desenhado antes da consulta. Reiniciar o servidor durante o teste do usuário pode gerar `Failed to fetch`; o servidor deve permanecer estável durante a validação. Erros de conexão agora têm mensagem em português; mutações não são reenviadas automaticamente.

## Validação adicional

Cadastro em massa transacional, entrada/remoção recuperável/envio de aparelhos do armazém, novos atendimentos e edição com controle de versão usam o SQL. Chips continuam exigindo a validação oficial da Arya. A suíte real cobre 33 verificações, além de 42 testes locais e 14 verificações de integração com SQL real e transporte externo simulado. Operações externas pendentes não são contadas como aprovadas.
