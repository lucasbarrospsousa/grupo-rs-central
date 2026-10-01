# Titular na análise de baixa — 01/10/2026

Consulta real, somente leitura, nas quatro bases configuradas (imp, acl, arg e mab). Busca de veículos por série e placa retornou associação, mas somente os campos CodVeiculo, Placa, descricao, Modelo e Ano: nenhum nome/código do titular. Equipamentos confirmaram associação ao veículo; comunicação não forneceu titular. A rota documentada GET /veiculos/{id} retornou listagem geral paginada, portanto não foi usada como prova de titular.

O OpenAPI de Imperatriz anuncia codCliente e nomeCliente na listagem. A Central agora reconhece esse par no nível principal, além do objeto titular anterior, em todas as bases. Nome principal sem código positivo não libera baixa. Vários titulares continuam exigindo conferência. A busca complementar por associado não é usada para inventar um titular ausente.

A correção externa de titular ainda não pôde ser confirmada nas amostras reais. Testes simulados cobrem o formato documentado nas quatro bases, titular ausente e múltiplos titulares. Nenhuma baixa, criação ou associação remota foi executada. IDs e dados operacionais dos testes permanecem fora deste documento e do Git.
