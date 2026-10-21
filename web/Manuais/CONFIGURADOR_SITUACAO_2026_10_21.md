# Situação explícita no Configurador

O contrato interno aceita `status` opcional: Estoque, Reserva, Instalado ou Manutenção (Reparo na interface). Valida inclusive no preflight; inclui o campo no fingerprint/recibo, aplica em novos e existentes e confere na releitura. Clientes antigos conservam a classificação automática anterior.

Somente o bloqueio automático de instalado na própria base regional é dispensado quando há uma escolha explícita válida. Permissões, confirmação de série/chip/telefone, conflitos, controle de versão, transferência autorizada e auditoria permanecem. Não altera a plataforma remota para criar instalação. Quantidade/estoque são 1 apenas para Estoque; Instalado preserva data existente, sem fabricar data ou vínculo.

Validação: `node --test tests/configurator.test.mjs tests/configurator-pending.test.mjs`, nove testes com integrações/SQL simulados, incluindo as quatro bases e situações, cadastros novos/existentes, recibos e permissões. Publicação somente da API, sem alteração de banco ou frontend.
