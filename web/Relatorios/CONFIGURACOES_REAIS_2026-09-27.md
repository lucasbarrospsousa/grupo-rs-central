# Configurações com evidência operacional — 27/09/2026

A página real não reutiliza mais a tela demonstrativa nem substitui rótulos com afirmações fixas. Lê integrações/health a cada 15 segundos enquanto visível, com tratamento de erro, horários e preservação explícita da última leitura. O polling para ao sair da página.

O servidor agrega as últimas observações de aparelhos nas últimas 24 horas, com filtro de filial e contexto RLS do usuário. O portal confirma série exata; localização exige ok=true; operadoras exigem provider identificado. Ausência de resultado não significa conexão. As contagens são aparelhos com última consulta registrada, não total de requisições ou disponibilidade garantida da API. Falhas de chips sem provider não são atribuídas indevidamente a Arya ou Link.

A guia Sincronização mostra progresso global, ciclo, último sinal, previsão e alertas relevantes à filial/operadoras. enabled isolado não é tratado como prova de execução: ausência de sinal recente é sinalizada. A ponte SMS mostra sinal, falha ou ausência de registro; não confirma entrega de mensagens.

Teste manual consulta API e portal separadamente, com respostas independentes. Operadoras continuam exigindo ICCID exato na consulta existente. Novos endpoints exigem acesso à aba Configurações e à filial. Nenhuma credencial é retornada ao navegador.

Validação: 17 testes automatizados passaram, incluindo regressões de autenticação, carregamento, sincronização, falhas, permissão e filtragem de alertas. Teste no Chrome headless passou para estados parcial/desconhecido, teste com falha independente, erro preservando snapshot, abas e seleção de operadora. Leitura real do banco confirmou avanço do processamento entre duas amostras. Teste real somente leitura da API e do portal de Imperatriz confirmou resposta dos dois. Valores operacionais momentâneos não são incorporados a este relatório público. Não foram alterados cadastros nem enviados SMS.

Limites: a evidência salva representa consultas por aparelho, não monitoramento contínuo de uptime. Teste manual de conexão não testa cada equipamento ou cada chip. Requer nova leitura para confirmar estado atual.