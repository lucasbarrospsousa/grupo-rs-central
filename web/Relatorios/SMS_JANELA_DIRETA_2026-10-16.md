# Janela SMS — 16/10/2026

A janela abre imediatamente com telefone e APN já salvos. Validações de telefone e conexão são independentes e ocorrem em segundo plano; envio exige série/telefone confirmados, gateway recente e comando válido.
Três comandos, texto editável e prévia. O botão Enviar para a fila usa a confirmação explícita desse clique, preservando as validações e prevenção de duplicação do servidor.
Após a tentativa, abre o Painel SMS com resultado persistente na tela. Resposta inconclusiva é confirmação pendente, nunca sucesso presumido. Não há reenvio automático.
Fechar a janela cancela leituras e atualização visual; uma submissão já feita pode concluir e mantém seu resultado para o painel.

Validação: 19 testes locais de SMS passaram. Teste de navegador isolado confirmou abertura antes das respostas, bloqueio até ambas as validações e navegação em sucesso, rejeição 409 e falha de rede. Três comandos conferidos. Evidência visual em 1917x841. Nenhuma requisição ao gateway ou envio real de SMS durante testes. Backend sem alterações.
