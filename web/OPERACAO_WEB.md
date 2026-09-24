# Grupo RS Central — operação web

## Ambiente e responsabilidade pelos dados

O site usa o PostgreSQL do projeto Supabase existente, schema privado `central_homologacao`. A origem foi o backup de 24/09/2026. Não há sincronização automática com o aplicativo desktop. Uma alteração feita no site não atualiza o banco do executável, e vice-versa.

O usuário autorizou testes de vinculação e troca somente na homologação. Os testes de escrita nas plataformas usam adaptadores simulados. SMS permanece pausado por escolha do usuário. A migração definitiva da operação requer conferir mudanças posteriores ao backup e definir o momento em que o desktop deixa de receber cadastros; não substituir a cópia SQL automaticamente.

## Hospedagem

- Site no ChatGPT: identidade persistida em `.openai/hosting.json`.
- API: função `central-api` no Supabase existente.
- SQL: papel `central_homologacao_web`, sem privilégios administrativos, com regras por filial.
- O site chama a API pelo servidor, usando segredo próprio de conexão. Senhas SQL e credenciais das plataformas não são enviadas ao navegador.
- A publicação inicial conserva o acesso privado do proprietário. O login da Central continua obrigatório.
- Nenhuma assinatura paga foi contratada por esta implementação. Limites e disponibilidade dos serviços são definidos pelos respectivos provedores.

## Funcionalidades

Estoque: pesquisa individual e por lista de séries, filtros, período, paginação, cadastro, edição, exclusão recuperável, CSV e PDF. Baixa: consulta por série, seleção e revalidação antes da alteração somente no SQL.

Vinculação: revisão explícita, operação remota registrada antes do envio, confirmação por leitura e atualização local somente depois de confirmação. Em timeout, usar Conferir sem reenviar; nunca repetir manualmente um pedido remoto incerto.

Cadastro em massa: TXT/CSV/TSV/XLSX, conferência de duplicados e conflitos, revisão e gravação transacional. XLSX aceita uma aba, até 2 MB compactados / 12 MB descompactados, 1.000 linhas e 30 colunas. Fórmulas e números que perderam precisão são rejeitados; séries devem ser texto ou ter formato numérico com os zeros iniciais.

Manutenção: atendimento e histórico versionados, filtro, PDF e troca local. Na troca, a reposição disponível passa a Instalada uma vez, com identificação da visita; o cadastro do aparelho de chegada e o vínculo remoto não são alterados automaticamente.

Rastreamento: consulta local, confirmação remota por série, histórico até sete dias, mapa de ruas, detalhes da posição, trajetória, reprodução e KML/PDF. O traçado separa intervalos acima de dez minutos; não é reconstrução comprovada das ruas percorridas. Mapa utiliza tiles OpenStreetMap sob demanda, com atribuição visível; não faz cache offline ou download em massa.

Armazém: cadastro, seleção, envio por destino, auditoria e consulta de chips. Configurações: verificações sob demanda de APIs e operadoras. As falhas de consulta não são tratadas como estoque vazio.

## Validação e comandos

Em `web`, `node --test tests/*.test.mjs` executa os testes locais. `node tools/test-sql.mjs` e `node tools/test-integration-sql.mjs` usam identidades e registros descartáveis no schema de homologação. O segundo simula os serviços externos. `node tools/test-edge.mjs` testa login, isolamento, CRUD descartável e logout pela API publicada. Os scripts removem somente os registros pertencentes às identidades criadas por eles.

`node tools/migrate.mjs` aplica migrações versionadas faltantes. Não rodar importadores de backup sobre uma operação em uso sem reconciliação.

`node tools/build-hosting.mjs` prepara o checkout sanitizado em `.sites-runtime/central` e o pacote da API em `.sites-runtime/edge`. `node tools/deploy-edge.mjs` publica a API usando o token administrativo local; nunca publica o token nem a senha SQL administrativa. O token de publicação pode ser revogado após a entrega.

A publicação do Site usa o workflow do plugin Sites no checkout sanitizado. No Windows, o empacotador requer Git Bash no PATH e `TAR_OPTIONS=--force-local`. O fonte da Central permanece no repositório GitHub original; a hospedagem recebe apenas a seleção sanitizada.

## Recuperação

As exclusões do estoque são lógicas (`deleted_at`) e auditadas. Não remover fisicamente cadastros operacionais para corrigir a tela. Operações remotas pendentes devem ser reconciliadas por leitura antes de qualquer nova tentativa. Backup de código não substitui backup do SQL. As cópias não sensíveis em Downloads não contêm banco, credenciais ou dados de clientes; a atualização local dessas cópias não comprova sincronização com OneDrive.
