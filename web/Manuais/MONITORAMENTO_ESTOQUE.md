# Monitoramento somente do estoque — 03/10/2026

O agendador existente foi reaproveitado, com escopo restrito a aparelhos não excluídos cujo status é Estoque (ou Reserva fora de Imperatriz, conforme a regra já existente). Não consulta instalados, manutenção ou inativos. A execução é no servidor, sem navegador ou computador do usuário aberto.

Comunicação: intervalo inicial de 15 minutos por aparelho. Status do chip: 60 minutos, usando o ICCID cadastrado; falhas também respeitam o intervalo. O fornecedor confirmado anteriormente é priorizado. Não consulta consumo, titular, histórico nem realiza alterações nas plataformas. A fonte de comunicação respeita API/web configurada na filial; no modo ambos usa somente API para telemetria.

O cron confere vencimentos a cada minuto, mas só chama a função quando há trabalho. Lotes de até 50, duas consultas concorrentes, orçamento de 45 segundos e exclusão por lease. O restante continua no próximo disparo. Falhas de autenticação mantêm o bloqueio de proteção existente. Atualiza um último resultado por aparelho; não acumula histórico detalhado. Não há garantia de ausência de falhas externas nem de custo zero.

Visão geral: o resumo da filial não bloqueia o estoque por base. Cada base chega independentemente; falha preserva o último resultado. Atualizar estoques e a releitura a cada 2 minutos com a aba visível consultam somente o banco. Status abre lista filtrada com busca, paginação e horário. O nome da filial abre seu portal configurado em nova aba com noopener/noreferrer.

Classificação reutiliza communication() da aba Estoque: mais de 10 minutos ligado ou 1 hora desligado = Desatualizado; GPS ausente/defasado mantém Possível GPS. Falhas ou campos ausentes = Não verificado, nunca presumido desligado. Chip exibido separadamente e somente se o ICCID retornado corresponde ao cadastro.

Validação: 21 testes focados passaram (regras, campos mínimos, chips independentes, recuperação e lotes). Migração 026 validada em transação: pausa, escopo, limite 50, trava concorrente e gravação condicionada à lease; alterações de teste revertidas. Primeira execução real concluiu 46 aparelhos (19 Açailândia, 4 Araguaína, 11 Imperatriz, 12 Marabá), com comunicação e chip retornados. Teste no navegador confirmou lista de desligados, abas vazias corretas e abertura do portal de Imperatriz enquanto os demais blocos carregavam. Dados operacionais e capturas não integram este repositório.

Publicação: Site v65, API v116, backup worker v47 com migração atualizada. Migração mantém processo pausado até publicar o worker; ativação foi feita depois da publicação e da verificação do cron existente. Configurações permite pausar e ajustar o intervalo de comunicação. Chip mantém 1 hora.
