# Análise de baixa por códigos — 16/10/2026

Somente aparelhos em Estoque entram na análise nas quatro bases; Reserva também é recusada na aplicação da baixa pelo servidor.
O código salvo do aparelho consulta seu cadastro exato. O código do veículo retornado nesse cadastro consulta o titular via API, sem busca web por placa. Código ausente usa uma busca exata por série; código divergente não autoriza baixa.
Titular único confirmado diferente de RS300 fica apto, independentemente do formato da placa. RS300 permanece em estoque; titular ausente ou ambíguo permanece para conferência.
Mantidos dois aparelhos simultâneos, lotes de 50, cache de cinco minutos e revalidação antes da baixa. Nenhuma baixa automática foi introduzida; confirmação manual existente preservada.

Validação: 36 testes locais passaram, incluindo concorrência, cancelamento, erros, troca de vínculo e bloqueio de Reserva. Consulta real de uma amostra em Estoque em cada uma das quatro bases: titular RS300 confirmado nas quatro, 12 requisições com os quatro logins. Nenhuma baixa aplicada nos testes.
