# Pesquisa explícita e rodadas da página

- Estoque abre em Todos. Texto e seleção de situação são rascunhos até Pesquisar/Enter; opções exibem contagens da filial. Séries coladas têm confirmação explícita. Limpar restaura Todos e remove período.
- Pesquisa SQL global e paginação permanecem; detalhes e ações mantêm permissões existentes. Pesquisa externa de titular deixa de disparar ao digitar e começa somente após pesquisa explícita com resultado apresentado.
- Após exibir uma página, aguarda 1.300 ms. Consulta um aparelho por vez: chip e comunicação desse aparelho podem ocorrer juntos (até duas requisições); cada resposta é aplicada assim que chega. Próximo aparelho começa após ambas concluírem.
- Após concluir toda a rodada, aguarda 30.000 ms e repete a página visível. Não há mais os dois temporizadores independentes de 60/180 segundos. O intervalo é contado após a conclusão, não após o início; a cadência de chips pode ser maior que a anterior, conforme o tempo das respostas.
- Pesquisa/página nova cancela trabalho obsoleto. Aba oculta, offline, análise de baixa e saída interrompem a rodada; retomada espera 1.300 ms. Falhas não geram repetição imediata. Limite de dez aparelhos e controles do backend permanecem.
- Nenhuma mudança de esquema, índice, cadastro ou vínculo. Testes de interface usam fixture local e respostas simuladas, sem chamadas a provedores.

Validação: testes de relógio simulado verificam espera inicial, resultados independentes, intervalo após conclusão, cancelamento, resposta atrasada, erros, pausa e página vazia. Chrome isolado em 1917×945 confirmou ausência de pesquisa por digitação/seleção, botão, filtro e resultado fora da página inicial, sem erros JavaScript. Teste antigo de comunicação foi alinhado aos textos atuais da função (sem mudar sua classificação).
