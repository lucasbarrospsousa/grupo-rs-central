# Gateway SMS Android — primeira versão

Escopo: somente Imperatriz. Projeto do telefone separado em `Sidera Code/RS SMS Gateway`. O botão SMS usa exclusivamente o telefone quando pareado; erro ao verificar a configuração bloqueia envio, sem fallback silencioso.

## Operação

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

Não publicar filas, APKs de teste, chaves, credenciais ou relatórios operacionais. Repositório novo do Android será criado depois, conforme decisão do usuário. Antes de substituir o executável principal, perguntar **posso atualizar agora?** e aguardar. Preservar a versão anterior e atualizar o mesmo caminho.
