# Documento reorganizado

O documento completo está em [CONFIGURADOR.md](Manuais/CONFIGURADOR.md). Organização de 27/09/2026.
# Séries sem prefixo fixo — 13/10/2026

A pré-conferência e o salvamento online aceitam séries como texto de nove dígitos, independentemente do prefixo. A validação anterior da Central ainda exigia 024 e bloqueava a configuração mesmo após a identificação física correta. Mantidas autorização da filial, conflitos de vínculo/chip, confirmação remota e idempotência. Teste focado: `node --test tests/configurator.test.mjs` a partir de `web/`, com quatro bases, diferentes prefixos e entradas inválidas; sem escrita operacional.
