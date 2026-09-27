# Estoque por base na Visao geral

Os quatro cards superiores consultam o endpoint autorizado de equipamentos de cada base e contam o status visivel Estoque, usando a mesma funcao da listagem. Reserva nas bases regionais continua apresentada como Estoque; em Imperatriz permanece separada. Cadastros removidos nao entram na contagem.

Cada card abre uma lista paginada com busca e dados cadastrados. Atualizar estoques rele os dados, sem alterar cadastros. Falhas aparecem como pendentes, nunca como zero. Somente bases autorizadas na sessao sao consultadas. As consultas ocorrem em paralelo depois da abertura da pagina. O grafico e a consulta de manutencoes abaixo foram preservados com atualizacao independente.

Validacao em Chrome com dados simulados: contagem por base, reserva regional, exclusao logica, zero versus falha, busca, paginacao da interface e recuperacao por atualizacao. Navegacao pelas 12 abas sem erros JavaScript, com shimmer, modal e movimento reduzido preservados. Build aprovado. Nenhuma escrita no banco ou nas plataformas operacionais.
