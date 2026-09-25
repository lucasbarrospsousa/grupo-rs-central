# Grupo RS Central — operação web

## Ambiente e responsabilidade pelos dados

O site usa o PostgreSQL do projeto Supabase existente, schema privado `central_homologacao`. A origem foi o backup de 24/09/2026, reconciliado com nova cópia consistente do desktop às 11:47 (Fortaleza): um aparelho atualizado e uma movimentação incorporada. O armazém foi conferido sem diferenças. Não há sincronização automática com o aplicativo desktop. Uma alteração feita no site não atualiza o banco do executável, e vice-versa.

O usuário autorizou testes de vinculação e troca somente na homologação. Os testes de escrita nas plataformas usam adaptadores simulados. SMS utiliza a ponte local autorizada em 24/09/2026. A versão 1.0 passa a ser o destino dos novos cadastros. O aplicativo desktop permanece preservado como consulta histórica; não continuar registrando nos dois sistemas. O nome interno do schema foi preservado para evitar uma migração desnecessária de credenciais e permissões. Não reexecutar importadores sobre o banco em operação.

## Hospedagem

- Site no ChatGPT: identidade persistida em `.openai/hosting.json`.
- API: função `central-api` no Supabase existente.
- SQL: papel `central_homologacao_web`, sem privilégios administrativos, com regras por filial.
- O site chama a API pelo servidor, usando segredo próprio de conexão. Senhas SQL e credenciais das plataformas não são enviadas ao navegador.
- A publicação conserva o acesso exclusivo do proprietário, conforme solicitado. O login da Central continua obrigatório.
- Nenhuma assinatura paga foi contratada por esta implementação. Limites e disponibilidade dos serviços são definidos pelos respectivos provedores.

## Funcionalidades

Estoque: pesquisa individual e por lista de séries, filtros, período, paginação, cadastro, edição, exclusão recuperável, CSV e PDF. Baixa: consulta por série, seleção e revalidação antes da alteração somente no SQL.

Vinculação: revisão explícita, operação remota registrada antes do envio, confirmação por leitura e atualização local somente depois de confirmação. Em timeout, usar Conferir sem reenviar; nunca repetir manualmente um pedido remoto incerto.

Cadastro em massa: TXT/CSV/TSV/XLSX, conferência de duplicados e conflitos, revisão e gravação transacional. XLSX aceita uma aba, até 2 MB compactados / 12 MB descompactados, 1.000 linhas e 30 colunas. Fórmulas e números que perderam precisão são rejeitados; séries devem ser texto ou ter formato numérico com os zeros iniciais.

Manutenção: atendimento e histórico versionados, filtro, PDF e troca local. Na troca, a reposição disponível passa a Instalada uma vez, com identificação da visita; o cadastro do aparelho de chegada e o vínculo remoto não são alterados automaticamente.

Rastreamento: consulta local, confirmação remota por série, histórico até sete dias, mapa de ruas, detalhes da posição, trajetória, reprodução e KML/PDF. O traçado separa intervalos acima de dez minutos; não é reconstrução comprovada das ruas percorridas. Mapa utiliza tiles OpenStreetMap sob demanda, com atribuição visível; não faz cache offline ou download em massa.

Armazém: cadastro, seleção, envio por destino, auditoria e consulta de chips. Configurações: acompanhamento da sincronização e verificações adicionais sob demanda. As falhas de consulta não são tratadas como estoque vazio.

## Validação e comandos

Em `web`, `node --test tests/*.test.mjs` executa os testes locais. `node tools/test-sql.mjs` e `node tools/test-integration-sql.mjs` usam identidades e registros descartáveis no schema de homologação. O segundo simula os serviços externos. `node tools/test-edge.mjs` testa login, isolamento, CRUD descartável e logout pela API publicada. Os scripts removem somente os registros pertencentes às identidades criadas por eles.

`node tools/migrate.mjs` aplica migrações versionadas faltantes. Não rodar importadores de backup sobre uma operação em uso sem reconciliação.

`node tools/build-hosting.mjs` prepara o checkout sanitizado em `.sites-runtime/central` e o pacote da API em `.sites-runtime/edge`. `node tools/deploy-edge.mjs` publica a API usando o token administrativo local; nunca publica o token nem a senha SQL administrativa. O token de publicação pode ser revogado após a entrega.

A publicação do Site usa o workflow do plugin Sites no checkout sanitizado. No Windows, o empacotador requer Git Bash no PATH e `TAR_OPTIONS=--force-local`. O fonte da Central permanece no repositório GitHub original; a hospedagem recebe apenas a seleção sanitizada.

## Recuperação

As exclusões do estoque são lógicas (`deleted_at`) e auditadas. Não remover fisicamente cadastros operacionais para corrigir a tela. Operações remotas pendentes devem ser reconciliadas por leitura antes de qualquer nova tentativa. Backup de código não substitui backup do SQL. As cópias não sensíveis em Downloads não contêm banco, credenciais ou dados de clientes; a atualização local dessas cópias não comprova sincronização com OneDrive.

## Entrega 1.0

URL: https://grupo-rs-central.lucasbarrosp.chatgpt.site

O painel inicial lê os totais confirmados pela sincronização do servidor e exibe falhas como pendências. Atualizar plataformas relê o resultado salvo; a coleta não depende da abertura da tela. Os gráficos da filial usam os cadastros SQL e agrupam variações do nome da operadora. Cards, barras e janelas respeitam movimento reduzido.

`node tools/backup-sql.mjs` salva uma cópia privada de todas as tabelas da Central, com migrações e SHA-256. Restaura os dados em tabelas temporárias com a estrutura e restrições atuais, compara os conteúdos e desfaz a transação. Não restaura sobre produção. Credenciais, hashes de login e dados privados nesse pacote impedem sua inclusão no Git ou backup público de código. Para recuperação após desastre, aplicar as migrações num banco isolado, importar na ordem das dependências e conferir antes de qualquer troca de destino; a verificação temporária não simula indisponibilidade total do provedor.

`tools/reconcile-snapshot.mjs` é ferramenta de virada, não sincronização. Exige backup SQL recente verificado, snapshot local e baseline privados; bloqueia conflitos com edições web, remoções e operações remotas pendentes. Não executar após começar a registrar operações no site. O relatório privado registra hash e diferenças aplicadas.

SMS continua pausado. Os testes de escrita nas plataformas reais continuam não autorizados; a integração implementada exige confirmação explícita do usuário na tela, preserva pedidos incertos e oferece reconciliação por leitura. Não foi feita vinculação real de teste nesta entrega.

## Atualização automática — 24/09/2026

O Supabase executa a coleta sem navegador, sessão pessoal ou computador ligado. O ciclo cobre todos os aparelhos ativos no SQL das quatro bases, com lotes de até 50 e três consultas concorrentes. Cada execução trabalha por até 45 segundos antes de deixar o restante para a próxima chamada. O agendador acorda a cada minuto para continuar a fila. Após finalizar a fila completa, aguarda cinco minutos para iniciar outro ciclo. **Cinco minutos não é garantia de que cada aparelho será atualizado nesse prazo**: a duração da varredura depende da quantidade, latência e limites das plataformas. O aviso no site mostra o progresso real.

A coleta consulta cadastro/ICCID, localização/comunicação e operadoras Arya e Link. Confere série e ICCID exatos; não inventa online quando só existe situação cadastral. Persiste observações separadas do estoque, preserva a última resposta confirmada e registra falhas. Não dá baixa, vincula, exclui ou envia SMS automaticamente. Histórico e trajetos continuam sob demanda para o período solicitado.

Tokens expirados recebem uma renovação e uma repetição de leitura. Credencial rejeitada interrompe as tentativas dessa integração e gera aviso persistente no site. A mudança do segredo no servidor libera nova validação. Recusa de acesso após renovar a sessão também pausa a integração, com motivo diferente; falha de rede não é senha inválida. Os demais provedores continuam funcionando.

Migrações 006 e 007 adicionam fila, bloqueio de execução simultânea, observações, alertas e panorama. As funções SQL são restritas ao servidor. O endpoint interno exige segredo próprio, mantido no Vault e no ambiente da função; não aceita o login do navegador como autorização. `node tools/schedule-sync.mjs` instala/atualiza o job idempotente `central-background-sync` e habilita o intervalo de cinco minutos. Não expõe o segredo nos logs.

O PHP das plataformas diferencia `Authorization` de `authorization`. Na hospedagem, o transporte TLS usa HTTP/1 e preserva essa grafia, com validação TLS padrão, limite de resposta e timeout. As quatro APIs e os quatro portais foram conferidos na hospedagem após a correção. Referência do agendamento: https://supabase.com/docs/guides/functions/schedule-functions.

O menu lateral agora é compartilhado em todas as páginas, incluindo ícones, largura, grupos recolhíveis, seleção e rodapé. Estoque relê as observações SQL a cada minuto enquanto estiver aberto; a coleta externa continua independente.

## Estoque: consulta da página e localização — 24/09/2026
A página consulta automaticamente até 10 séries visíveis, com duas consultas simultâneas, incluindo plataforma e chip. Ao mudar página/filtro, descarta a fila anterior; requisições já iniciadas podem terminar, sem redesenhar outra página. Atualiza novamente a cada minuto enquanto visível e oferece atualização manual. O ciclo geral do servidor continua independente, em cinco minutos entre ciclos. Credenciais recusadas respeitam a pausa persistida do sincronizador.
O botão de localização abre mapa OpenStreetMap com marcador, dados da última posição, zoom, centralização, cópia das coordenadas e link Maps. Ausência de posição confirmada é explicitada. Nenhuma consulta altera cadastro ou envia comandos.
Validação: 62 testes automatizados; navegador isolado em 1917×991 com dados sintéticos, consulta dos 10 itens, próxima página, mapa, atualização e reabertura sem erros JavaScript.
Consulta real somente leitura também confirmou equipamento, localização com coordenadas válidas e chip, sem pendências, em uma série de Imperatriz. Publicação privada confirmada: d7956a60892ee3fad4b2b03d55e2195ef2eed356 (fonte Sites).

### Baixa individual do estoque — regra do executável

O campo Veículo aceita a placa na própria linha. Dar baixa pede confirmação e registra a instalação no SQL da Central, preservando identificação, gravando placa em maiúsculas, situação Instalado e data. Não modifica a plataforma externa. A rota POST /api/install exige sessão, filial autorizada, CSRF, confirmação, versão atual e chave de idempotência; a transação registra auditoria. Analisar baixa continua sendo o fluxo independente de conferência de vínculos remotos.

Tipo segue src/tracker_versions.gd: GRS → V7.3.2; AAA → V7.2.2/7.1.6; XRS → V7.3.5, com normalização dos nomes antigos. Essa classificação não representa leitura de firmware.

Validação: 65 testes automatizados, fluxo sintético no navegador e cadastro temporário no SQL de homologação (gravação, releitura, repetição idempotente e rejeição de versão antiga). Nenhum aparelho operacional foi baixado nos testes.

## Ponte SMS do computador

`node web/tools/sms-bridge.mjs` mantém uma conexão de saída com o SQL e consulta o Galaxy com o certificado e o token já pareados no desktop, sem escrever na fila SQLite. A configuração privada fica em `.secrets/homologacao/sms-bridge.json`. O computador precisa permanecer ligado, com a sessão Windows iniciada, e o Gateway ativo na mesma rede. A inicialização automática usa um atalho na pasta Inicializar do usuário, executando `web/tools/run-sms-bridge.ps1` oculto. Não abre portas de entrada. Se o endereço do Galaxy mudar, atualizar a configuração privada após conferir o celular; nunca desativar a validação do certificado.

A API aceita comandos revisados somente para séries 024 de Imperatriz, conferindo o telefone novamente na plataforma. Registra a fila antes do envio. A ponte grava a tentativa antes do PUT; reinícios, timeouts e retornos ausentes geram apenas consultas ao mesmo pedido. Pedidos antigos sem marca da ponte não são enviados. Há trava de instância e índice de exclusividade por aparelho. Retornos de entrega são acompanhados por até 24 horas após a criação. A indisponibilidade não é confirmação de falha.

O painel lê o banco a cada 15 segundos; heartbeat com mais de 90 segundos é desconectado. Novos envios exigem ponte recente. Pendências incertas bloqueiam outro envio para a mesma série e exigem conferência; não há reenvio automático nem disparo em massa. Os testes de fila SQL usam uma trava que impede execução junto da ponte real. Validação realizada com gateway health real e fila/transporte sintéticos, sem disparar SMS real.

Recuperação da ponte: o inicializador resolve o Node pelo caminho instalado, sem depender do PATH do Codex. Um mutex evita supervisores duplicados. Quedas reiniciam o processo após 30 segundos; três falhas seguidas de conexão ou um ciclo travado por 180 segundos provocam reinicialização. O Galaxy indisponível é consultado novamente a cada ciclo. Credencial SQL inválida interrompe o reinício e exige correção. O estado local, sem credenciais nem mensagens, fica em `.secrets/homologacao/sms-bridge-health.json`. A janela de SMS acompanha a reconexão por até um minuto, apenas consultando saúde; não cria nem reenvia pedidos. Computador desligado, Gateway parado e credencial alterada exigem intervenção.
