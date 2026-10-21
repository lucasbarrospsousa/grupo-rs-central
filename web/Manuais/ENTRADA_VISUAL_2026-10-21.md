# Entrada da Central — 21/10/2026

Login com identidade azul-marinho, filial em modal branco e botão laranja. Logos originais preservadas. A seleção de filial continua limitada pela sessão validada no servidor.

O indicador visual acompanha a validação e, depois, a leitura do resumo da filial autorizada. Nenhum temporizador ou percentual artificial: prepareLoginOverview continua aguardando somente o resumo antes de renderizar a visão geral; demais abas mantêm carregamento em segundo plano. Falha remove o indicador e permite tentar novamente. Movimento reduzido respeitado.

Validação: 14 testes existentes de login/sessão/preload passaram; navegador Chrome headless com todas as requisições interceptadas verificou seleção, confirmação, progresso, erro, nova tentativa, conclusão e largura móvel de 390 px. Capturas desktop 1917 x 907. Nenhuma consulta a APIs dos fornecedores. Backend e permissões não alterados.

## Fidelidade à prévia — 21/10/2026
Revisão visual: campos com ícones, fundo azul geométrico, filial compacta com ícone de prédio e botão com nome da unidade, carregamento com estrutura visual da Visão geral, indicadores e barra indeterminada. Logos originais e rodapé mantidos. Sem temporizador de espera ou percentual simulado; autenticação e resumo continuam determinando a transição. Testes: oito casos de sessão/startup e navegador isolado com todos os estilos, modal sem rolagem em 1917x907, seleção, erro/repetição, conclusão e largura móvel. Nenhuma consulta externa de integração.
