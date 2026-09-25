# Uso de chips no Armazém

A migração 015 instala um trigger nas gravações dos aparelhos. Cadastro, edição, Configurador e atualizações confirmadas da plataforma passam pelo mesmo registro transacional: o ICCID exato encontrado no Armazém fica Utilizado e recebe aparelho, filial e horário de detecção.

Trocas de chip registram a desvinculação anterior e o novo uso. Trocas de telefone registram uma movimentação própria. Consultas idênticas não duplicam movimentos. Retirar um chip do aparelho não o devolve automaticamente à disponibilidade física. Conflitos de ICCID entre aparelhos impedem uma nova associação ambígua; chips ausentes do Armazém não são inventados.

O horário registrado é o da gravação/detecção na Central, não uma data presumida de instalação física. Observações frescas da API podem atualizar ICCID e telefone existentes; identificação exata da série e exclusividade da associação continuam exigidas. Credenciais e erros de consulta não são tratados como confirmação de uso.

Validação SQL: `node web/tools/test-chip-usage-sql.mjs`. Os registros sintéticos e eventual migração experimental ficam dentro de uma transação revertida ao final. Verifica cadastro, troca, telefone, API, repetição e conflito, sem conservar dados de teste.
