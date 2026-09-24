# Integrações web — homologação, 24/09/2026

## Escopo entregue

O servidor consulta os portais e APIs de Imperatriz (`imp`), Araguaína (`arg`), Açailândia (`acl`) e Marabá (`mab`), nos respectivos subdomínios de `ogrupors.com.br`. Não há fallback para o antigo endereço de Marabá. Os caminhos e contratos seguem os serviços existentes do aplicativo desktop.

- Consulta de manutenção em todas as bases, com contagem da resposta conferida.
- Consulta exata por número de série, preservando zeros e distinguindo identificação de estoque, placa e série.
- Vínculo confrontado entre API e portal, incluindo titular; RS300 não é tratado como instalação em cliente.
- Comunicação/localização consultada após resolver a série. O endpoint de localização é filtrado pela placa confirmada e confrontado com o código do veículo. O campo oficial `localizacao` é reconhecido.
- Histórico sob demanda com titular/veículo/aparelho conferidos e período limitado a sete dias. Resultado parcial é sinalizado; falha não vira lista vazia.
- Chips Arya/Innova e Link Solutions consultados por ICCID exato. Cadastro de chip no armazém exige confirmação da Arya, conforme fluxo atual.
- Baixa altera somente a cópia SQL da Central. Reconsulta vínculo antes de cada gravação, controla versão, permissão, filial, auditoria e idempotência.
- Vinculação: revisão explícita na interface, preparação por leituras, registro durável antes do POST, confirmação remota antes de alterar o estoque SQL. Um timeout não provoca segundo POST; a pendência é resolvida por nova consulta.

## Credenciais e isolamento

Segredos ficam em `.secrets/homologacao/integrations.dpapi`, protegidos pelo Windows DPAPI CurrentUser, fora do Git e do diretório público. Foram preparados a partir da configuração autorizada do desktop, sem alterar o cofre original. A credencial é carregada apenas pelo servidor. Tokens e cookies externos permanecem em memória por sessão. HTTPS usa validação padrão; redirecionamentos não são seguidos com credenciais.

O arquivo DPAPI depende deste usuário Windows. Uma futura hospedagem exige provisionar segredos no ambiente de destino; copiar o pacote de código não transfere as credenciais. O servidor atual continua restrito a loopback, como documentado em HOMOLOGACAO_SQL.md.

A migração 004 adiciona o registro de operações externas com RLS por filial. Não modifica o banco desktop. O backup SQL é uma fotografia, não uma sincronização automática do aplicativo local.

## SMS pausado

O usuário optou por deixar SMS pendente após o Galaxy não responder. POST de SMS retorna indisponível e a interface informa a pausa. Não há envio, tentativa automática de reconexão ou reenvio em segundo plano. O adaptador do gateway está preparado, mas não é considerado validado operacionalmente.

## Evidências de validação

- Consultas reais de autenticação, manutenção, aparelho e localização: quatro bases responderam, com série do portal e coordenadas confirmadas nas amostras.
- Arya e Link: cada provedor confirmou um ICCID exato da sua própria amostra.
- Histórico: quatro bases responderam a período curto de dez minutos, sem posições nas amostras. Uma consulta adicional em Imperatriz retornou 11 posições com coordenadas, sem indicação de resultado parcial. Isso não comprova reprodução completa do mapa do desktop.
- Chrome: teste de conexão API/portal e consulta por série exibiram retorno real.
- `node --test tests/*.test.mjs`: 42 testes locais.
- `node tools/test-sql.mjs`: 33 verificações com SQL real e registros descartáveis. Consulta de chip usa resposta simulada neste teste.
- `node tools/test-integration-sql.mjs`: 14 verificações com SQL real e serviço externo simulado. Inclui permissão, vínculo alterado, baixa idempotente, timeout de POST, reconciliação sem reenvio e auditoria única. Identidades e linhas próprias são removidas ao final.

Nenhum SMS nem POST de vinculação em veículo operacional foi usado como teste. A escrita real na plataforma continua exigindo seleção e confirmação na interface; não declarar homologação operacional desse POST com base nos testes simulados.

## Limites restantes

Não declarar migração funcional integral: troca automática de aparelho em manutenção continua bloqueada; o trajeto web oferece traçado das coordenadas e KML, ainda sem mapa de ruas/satélite ou reprodução completa do desktop. Exportação PDF e apresentação avançada do histórico exigem sua etapa própria. SMS está pausado. A validação de uma vinculação real deve usar um caso operacional escolhido pelo usuário.
