# Reserva para Estoque por consulta API

O botao Estoque, quando o estado atual e Reserva, consulta a API oficial de veiculos pela serie completa. Exige uma unica associacao exata com placa preenchida; nao escolhe a primeira linha aproximada, nao usa cache nem cria vinculos remotos.

Placa e identification_plate recebem a identificacao confirmada. Tipo/modelo existente e preservado; se ausente ou generico RS300, reutiliza as regras locais de identificacao: XRS = V7.3.5, AAA = Reutilizado, GRS = RS Novo, NOV = Novo. Isso e classificacao interna, nao leitura fisica do firmware. Se nao houver tipo determinavel, continua Reserva e pede preenchimento.

Placa, tipo, status Estoque e saldo 1 sao persistidos juntos pelo upsert incremental existente e confirmados pela releitura local. Falha de API, resposta ambigua, placa ausente e alteracao concorrente de cadastro/filial nao mudam o estoque. Duplo clique durante consulta e bloqueado. Os fluxos de devolucao de outros estados permanecem inalterados.

Escopo atual: filiais com API oficial configurada; base sem API permanece sem alteracao e apresenta orientacao. Nenhum POST/PATCH/DELETE remoto e usado nesta acao.

Teste: `tests/reserve_stock_api_test.gd`, com API simulada e store em memoria, sem estoque real. Cobre serie exata, duplicidade, serie diferente, falha de rede, tipo vazio/preexistente/desconhecido, troca de filial e concorrencia. Nao e teste de escrita no banco operacional.
