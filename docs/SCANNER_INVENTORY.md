# Armazém — RS Scanner, Imperatriz

Entrega de 21/09/2026: menu Armazém com empilhadeira, aparelhos/chips e histórico separados do estoque operacional. Seleção por linha ou página, preservada entre páginas e tipos; busca numérica e filtros Disponíveis/Enviados/Todos. Paginação de 12. Cards de disponíveis e itens enviados hoje (America/Fortaleza).

## Recebimento e reconexão

No celular, código 2 → Conectar ao Grupo RS Central; mesmo Wi-Fi, HTTPS 8843. No Central, Conexão → endereço, certificado SHA256 conferido e código temporário. Não abrir portas do roteador. Após parear, abrir Armazém inicia sincronização e repete a cada 5 segundos enquanto a aba está visível; lotes cheios repetem em 2 s. Falhas aumentam intervalo até 30 s. Ao sair, o temporizador é destruído; uma chamada já iniciada pode terminar e confirmar seu lote. Sem serviço agendado externo.

Scanner Android 0.6.1 possui serviço connectedDevice, notificação com Pausar e proteção de CPU com prazo renovado. Fechar a tela não fecha a conexão; logout pausa. Ao reabrir o app, conexão anteriormente ativa é retomada. Não garante funcionamento após desligamento, parada forçada ou restrições do fabricante/Doze. Se o IP mudar, atualizar somente o endereço em Conexão, preservando a identidade. Não aceita outro certificado silenciosamente. PC desligado não recebe; fila confirmada permanece no celular.

## Registro de envio

Selecionar base (Imperatriz, Araguaína, Açailândia, Marabá) ou escrever outro destino, observação opcional, Revisar envio e Confirmar envio. Transação valida disponibilidade de todos os itens antes de gravar. Até 250 por lote. Uma saída por item; UUID torna repetição da mesma solicitação idempotente. Conflito bloqueia o lote inteiro. Leitura repetida não torna um item enviado disponível novamente. Movimentações mantém destino, data, tipo, número e observação (tooltip). A operação registra destinação/saída neste Armazém; não cadastra itens no estoque operacional da base destinatária nem troca vínculos na plataforma.

## Persistência e segurança

Somente user://scanner_inventory.sqlite: itens/recibos/configuração preservados e tabelas movements/movement_items criadas de forma aditiva. Transação durável precede ACK ao celular. Token pareado protegido por Windows DPAPI; Android armazena apenas hash do token. Nunca credenciais SGA. Identidade por certificado/UUID; tipo e tamanho validados nos dois lados, zeros preservados. Serviço GDScript executa Python fora da interface. Reutiliza apenas transporte HTTPS/DPAPI de sms_gateway_service.py, sem tocar a fila SMS ou enviar mensagens.

## Validação

- 9 testes Python: deduplicação, ACK perdido, conflitos, destino livre/base, lote misto atômico, histórico e reabertura do banco.
- Teste renderizado isolado 1917×991: seleção entre tipos, destino livre, revisão sem gravação antecipada, reconexão e parada de consultas ao sair da aba.
- Celular USB: quatro testes de modos/interface e serviço em segundo plano; certificado, fila e banco sintéticos separados na porta 18843. Central pareou por TLS, recebeu aparelho/chip fictícios, confirmou ACK e reconectou após reinício mantendo identidade e sem duplicar; certificado errado foi bloqueado. Não substitui teste óptico da câmera ou ensaio prolongado de Wi-Fi/Doze.
- Executável exportado/contrato e navegação conforme testes da entrega. Instalação do Central exige autorização separada; APK atualizado somente no celular autorizado.

Não publicar bancos, credenciais, filas, números operacionais, capturas reais ou APKs/EXEs com segredos. Backup desta entrega contém apenas fontes revisadas e manifesto.

Ensaio USB autorizado e sintético: instalar os APKs debug e androidTest do Scanner, então executar `python tests/scanner_usb_integration.py --adb <caminho-adb> --serial <serial-autorizado>`. O script recusa encaminhamento já existente em 18843, não grava token em texto, usa banco temporário e remove o encaminhamento criado ao terminar. A instrumentação apaga apenas suas fixtures. Não rodar sem autorização para usar o celular.

## Uso automático de chips — 21/09/2026

Somente a Central reconcilia chips do Armazém com os registros confirmados no SQLite compartilhado `C:/GRUPO RS CENTRAL/database/grupo_rs_central.sqlite`. O Configurador e o celular permanecem inalterados. Fonte aberta com `mode=ro` e `query_only`, leitura transacional; não consulta portais nem pressupõe que dados remotos ainda não registrados estejam presentes. Partições Imperatriz, backups_araguaina, backups_acailandia e backups_maraba (aliases canônicos também reconhecidos).

Ao abrir a aba e periodicamente enquanto visível (intervalo mínimo 15 s, sujeito ao ciclo de conexão de até 30 s), compara ICCID inteiro, incluindo chips já enviados. Não depende de o Scanner estar conectado/pareado. Uma única linha com base reconhecida e série de nove dígitos confirma Utilizado. Ambiguidade, identidade inválida, banco ausente/corrompido/bloqueado ou consulta interrompida não geram baixa. Ausência de cadastro não altera o item. A consulta não aceita correspondência parcial nem extrai série de IMEI.

Tabela aditiva chip_usage registra série, base, atualização do cadastro e detecção; remove dos disponíveis, bloqueia envio e mantém histórico e eventual saída anterior. Repetição é idempotente; remoção/alteração posterior do cadastro não apaga o histórico nem devolve automaticamente o chip. Filtro Utilizados; detalhes de base/série/datas e envio anterior no tooltip da situação. Seleções de chips recém utilizados são removidas antes de novo envio; backend revalida estado.

Validação: 15 testes Python, incluindo quatro bases, commit pendente, hash do banco fonte preservado, reexecução, lote enviado, ICCID parcial, duplicidade e indisponibilidade. UI isolada testa verificação mesmo sem Scanner, preservação em falha e encerramento ao sair da aba. Nenhuma baixa operacional usada como teste.
