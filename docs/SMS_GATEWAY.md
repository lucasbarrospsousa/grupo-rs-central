# Gateway SMS Android — primeira versão

Escopo: somente Imperatriz. Projeto do telefone separado em `Sidera Code/RS SMS Gateway`. O botão SMS usa exclusivamente o telefone quando pareado; erro ao verificar a configuração bloqueia envio, sem fallback silencioso.

## Operação

### Painel de retorno do celular

Abrir **Painel SMS** na navegação lateral. Os atalhos **Acompanhar SMS** no estoque e nas configurações levam à mesma página, sem janela sobreposta. A antiga interface de volume, consumo e recuperação foi retirada da navegação e seus dois construtores visuais foram removidos; dados históricos e rotinas de envio existentes foram preservados. Abrir a página não dispara mais a consulta antiga de recuperação.

Após confirmar um novo pedido, aparece somente o aviso compacto **Solicitação enviada**, esclarecendo que foi registrada na fila. O botão **Painel SMS** abre a página; **Agora não** fecha o aviso sem mudar de aba. Registrar na fila não é confirmação de envio pelo Android. Nenhum comando é criado novamente ao abrir o painel.

O aviso tem layout próprio de 520 × 250, fundo branco arredondado, ícone de envelope sobre azul claro, título destacado e ação principal azul. Entrada suave respeita movimento reduzido; botões usam o comportamento animado do sistema. Captura visual revisada no shell real em 1917 × 1022; navegação pelo botão, ausência de abertura automática da página e isolamento por filial verificados com dados sintéticos. Nenhum SMS foi enviado nesses testes.

A página exibe os últimos 100 pedidos, cards animados de andamento, enviados (incluindo entregues), entregas e atenção, além do estado da conexão e do modo diagnóstico. A tabela distingue cada etapa; selecionar a linha mostra o comando e a orientação adequada. O detalhe técnico e a validade estão na dica do quadro de detalhes. Fora de Imperatriz, a página informa o limite do gateway sem exibir históricos de outra base.

O ciclo do gateway consulta automaticamente um recibo por vez, em rodízio, a cada ciclo de aproximadamente dez segundos, além de reconciliar a fila. Com vários pedidos ou rede lenta, a atualização individual pode levar mais tempo. Pedidos enviados podem evoluir para entregues; indeterminados podem receber confirmação tardia de envio, entrega ou falha. Esse acompanhamento só executa GET: não recria UUID nem reenvia SMS. A API existente do Android 0.3.0 já fornece esses estados; não é necessária nova instalação no telefone.

A tabela SQLite `acknowledgements`, no banco separado da fila, preserva quando o Central observou cada retorno e o horário informado pelo telefone quando válido. O horário exibido na lista é o recebimento do estado pelo Central, não uma estimativa do envio. Histórico anterior sem evidência temporal aparece com travessão. Conexão indisponível não apaga confirmações já salvas nem transforma automaticamente um envio em falha. O painel não permite enviar, reenviar ou cancelar; essas operações permanecem nos fluxos de confirmação existentes.

Validação desta revisão: 13 cenários distintos de fila, incluindo persistência dos retornos, consulta tardia sem retransmissão, rejeição de conteúdo divergente, ausência de regressão de estado e saúde sem exposição de credencial. Testes renderizados em 1917 × 1022 revisados; formulário e confirmação de SMS existentes também passaram. Pacote exportado validado com teste de contrato e painel renderizado; consulta de recibos continua mesmo sem pedido aguardando envio. Consulta HTTPS somente GET ao Galaxy confirmou retornos reais anteriores como delivered e registrou as evidências em banco temporário isolado; fila operacional inalterada e nenhum SMS novo. Teste de novo SMS real e atualização do executável operacional ainda pendentes de confirmação específica.

### Card de mensagem livre — protocolo 2

Revisão de abertura e aparência: o card é mostrado antes de qualquer espera por configuração ou consulta. O telefone local `chip_phone` aparece imediatamente, sem +55, com DDD; a consulta exata continua obrigatória para liberar envio e pode atualizar o campo se o usuário não o editou. Texto e destinatário editados durante a espera são preservados. Erros mantêm os botões bloqueados, sem fallback silencioso. O formato internacional é mantido apenas no protocolo interno, sem alterar o cadastro. Fechar durante a consulta é seguro. A confirmação usa tema claro e textos em português.

Teste sintético de latência: atrasos de 300 ms em cada etapa, card visível antes das respostas, abertura síncrona inferior a 250 ms no ambiente de teste; não representa medição da API real. Testados também falha de consulta, fechamento pendente e preservação de rascunho. Capturas renderizadas revisadas para formulário e confirmação; sem SMS real nesta revisão.

Cards de aparelho, gateway e prévia usam `card_hover_motion.gd`, compartilhado com o sistema: elevação suave com retorno, sem deslocar o layout, respeitando a opção de movimento reduzido. O teste verifica ampliação e retorno dos três cards. O contêiner do formulário impede que o cálculo transitório de quebra de texto amplie a janela para além da tela ao abrir ou voltar da confirmação. Validação visual com o tema real herdado e resolução 1917 × 1022.

O painel compacto mede 1000 × 660 (antes 1160 × 740). Ao abrir ou voltar da revisão, desliza 24 px até o centro em 0,32 s e revela o conteúdo em 0,22 s. A opção de movimento reduzido desativa essa entrada. O teste verifica posição inicial/final, opacidade final e tamanho. A janela solicita fundo transparente para não pintar cantos escuros fora do contorno arredondado. Estado de consulta pendente usa cor informativa, não vermelha.

A confirmação também solicita transparência nos cantos e usa três cards animados: aparelho, destinatário e comando. APN/gateway ficam no card do comando; custo, possível alteração e vencimento continuam visíveis em aviso separado. A ação principal é azul. Entrada suave e retorno dos cards testados por propriedades e captura renderizada. Os callbacks de confirmação/cancelamento e o conteúdo da fila não foram alterados; cancelar não envia nem apaga o rascunho.

Ao clicar em SMS, o card consulta o aparelho e preenche o telefone. O campo de mensagem começa vazio. A prévia lateral acompanha o telefone e o texto. O botão azul com avião abre a revisão do comando personalizado; o atalho **SMS padrão** ignora alterações nesses campos e usa o telefone consultado e o comando de configuração. Ambos exigem confirmação antes da fila.

Editar o telefone altera apenas o destinatário daquele pedido, não o cadastro. Pedidos v2 registram `command_mode`, `source_phone_snapshot`, `apn_snapshot` e `standard_command_snapshot`. A revalidação compara esses dados de origem, sem substituir o texto personalizado nem o destinatário confirmado. Pedidos v1 existentes continuam compatíveis. Atualizar o Android para 0.2.0 antes de usar mensagens personalizadas.

Limite atual: texto simples ASCII, sem quebras de linha, de 1 a 160 caracteres. O telefone também bloqueia divisão em múltiplos SMS. Cancelar a revisão mantém o rascunho e não cria pedido. Alterações do cadastro durante espera exigem nova confirmação.

Validação adicional: 13 cenários distintos de fila (incluindo regressões v1), teste renderizado do card com edição do destinatário, prévia, envio rápido e ausência de envio antes da confirmação. Um comando personalizado autorizado individualmente recebeu recibo de entrega via Galaxy. Isso não comprova execução do comando pelo rastreador. Dados do teste real permanecem na área protegida, fora do Git.

Em Configurações SMS, abrir **Gateway SMS Android • parear / fila**. Informar HTTPS/IP privado exibido no celular, conferir SHA256 e usar o código temporário. Mudança de IP preserva o certificado. Trocar a identidade de telefone com fila ativa é bloqueado.

No botão SMS, o Central consulta exatamente a série, rejeita duplicidade e exige telefone/APN online. Exibe série, telefone, APN, comando e gateway antes da confirmação. A fila SQLite separada do estoque mantém UUID e vencimento imutável de 7200 segundos desde a confirmação. Serviço Python executa fora da thread de interface. Nenhuma mudança de cadastro ou vínculo é necessária.

Pedidos aguardam se o telefone estiver indisponível. Antes da primeira transmissão, reconsulta telefone/APN e compara o status local vigente. Mudança exige nova confirmação. Consulta que falha não usa dados locais silenciosamente. Um pedido por ciclo, com reconciliação pelo mesmo UUID antes de retransmitir pacote.

O histórico distingue aguardando, recebido, enviando, enviado, entregue, falhou, expirado, cancelado e indeterminado. Recebido não significa enviado. Recibo de rede não comprova configuração aplicada. Atualizar histórico também consulta recibos dos envios recentes. Cancelamento de pedido já transmitido exige resposta do telefone.

## Segurança

`user://sms_gateway.sqlite` contém a fila e a credencial protegida por Windows DPAPI. Não compartilhar esse banco. `tools/sms_gateway_service.py` é empacotado e extraído para execução local. Certificado SHA256 é conferido antes de enviar credenciais ou comandos. API apenas HTTPS/IP privado, sem redirecionamentos automáticos. Não abrir portas no roteador.

No Android, o modo diagnóstico começa com envio desligado. O usuário seleciona o chip e concede permissões; serviço em primeiro plano tem notificação. Intenção persistida antes da chamada SMS; processo interrompido/timeout não provoca reenvio automático de resultado indeterminado. Mensagens multipart são bloqueadas.

## Evidências de homologação — 16/09/2026

- Backup consistente do banco de todas as bases antes das alterações, integrity_check e foreign_key_check aprovados; fonte versionada também preservada em área protegida.
- Nove testes Python da fila, seis cenários de consulta exata, regressão Multioperadora e diálogo renderizado, com bases temporárias isoladas.
- Testes do pacote exportado aprovados, incluindo ausência de bancos/cofres no pacote e presença do serviço Python.
- No Galaxy A24/Android 16: HTTPS/pin, pareamento, UUID repetido, conflito 409, token inválido, expiração, diagnóstico, cancelamento, reinício, tela bloqueada e reconexão Wi-Fi.
- Um único SMS autorizado individualmente, transmitido pelo serviço de fila ao telefone, recebeu recibo de entrega. Envio real desligado após o teste. Não foram enviados comandos aos outros equipamentos.
- Ainda não validado: aplicação do comando no rastreador, chip fisicamente ausente, falha real da operadora e interação completa pelo executável operacional (sujeita à atualização autorizada). A matriz completa não deve ser anunciada como concluída.

## Testes e implantação

Executar `tests/sms_gateway_queue_test.py` com Python 3.12. Executar os scripts `tests/sms_gateway_target_test.gd` e `tests/sms_gateway_dialog_test.gd` pelo executor `tools/test_offline.ps1`; usar `-Rendered` para inspeção visual. Para pacote exportado, usar `-Package` e `tests/package_contract_test.gd`.

Não publicar filas, APKs de teste, chaves, credenciais ou relatórios operacionais. Android publicado separadamente em https://github.com/rayrangrupors-sudo/rs-sms-gateway (privado). Antes de substituir o executável principal, perguntar **posso atualizar agora?** e aguardar. Preservar a versão anterior e atualizar o mesmo caminho.
# Consulta de telefone — correção de 16/09/2026

O compositor diferencia consulta do aparelho de conectividade do gateway. Falhas
encerram o indicador de consulta e permitem consultar novamente sem perder a mensagem.
Quando o telefone está vazio na API, a validação de SMS consulta o portal configurado:
exige uma única série exata e ICCID não vazio idêntico ao da API. O telefone da API
já preenchido não é substituído; telefone local nunca é fallback automático.
A origem complementar aparece no compositor. A fila usa a mesma revalidação;
o cadastro remoto não é atualizado por essa consulta. Consulta real somente de leitura
confirmou esse cenário; não foram enviados SMS nesta correção.

Após consulta confirmada no compositor, telefone e ICCID válidos são sincronizados
no SQLite local por uma operação transacional restrita à filial, SKU e IMEI exatos.
Não insere aparelhos nem altera placa, status, quantidade ou vínculos. Campo vazio,
ICCID inválido e identidade divergente não gravam. O card informa quando houve
atualização ou quando ela não foi possível. O telefone digitado manualmente no card
não é fonte dessa atualização. Backup integral de todas as bases foi validado antes
da implementação; os testes de gravação usam somente banco temporário sintético.
# SMS em massa — 16/09/2026

Em Cadastro em massa, o botão SMS em massa abre até dez linhas de série, telefone
e grupo obrigatório (1–4). O grupo troca somente os dois servidores do comando
para gruporsN.ddns.net; portas 5940/5941 e APN/credenciais consultadas são preservadas.
Esta versão opera pela base Imperatriz e exige aparelho presente no estoque local;
o grupo de configuração não muda a filial do cadastro. Cada telefone deve coincidir
com a consulta exata online. A revisão exibe os comandos antes de Confirmar lote.

A fila persistente registra todas as linhas atomicamente, com prazo imutável de
duas horas. Só transmite uma por vez; depois de confirmação sent/delivered recebida
do Android, aguarda no mínimo 60 segundos antes da próxima. O próximo lote também
respeita o intervalo. Falhas/resultado indeterminado bloqueiam a continuação;
Cancelar lote pendente solicita cancelamento das linhas restantes, sujeito ao
retorno do celular para pedidos já recebidos. Não há reenvio automático incerto.
Envios avulsos e outros lotes ficam bloqueados enquanto houver lote pendente.
O intervalo reduz rajadas, mas não garante ausência de bloqueio pela operadora.

Validação: limites, grupo obrigatório, prazo, intervalo com relógio controlado,
reinício e parada por falha foram testados em SQLite temporário e transporte
simulado. Interface renderizada revisada; o Galaxy real, com envio desligado e tela
apagada, recebeu os quatro comandos em pacotes v2 já vencidos e confirmou estado
expired. Nenhum SMS real foi enviado; o intervalo entre SMS reais não foi ensaiado.
