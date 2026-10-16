# Painel SMS — 16/10/2026

Layout aprovado: fila em andamento separada dos resultados, indicadores, busca local por série/telefone, filtro de estado e detalhes do pedido (telefone, APN registrada no pedido, comando e retorno).
Preserva os endpoints de leitura, estados, histórico e atualização de 15 segundos. Nenhuma mudança no banco, gateway, envio ou fila. Sem reenvio automático. Falha de consulta preserva os dados exibidos, com aviso de consulta pendente.
Validação: 21 testes SMS locais passaram; navegador com adaptador simulado verificou filtros, seleção, resultado da inclusão na fila e preservação do histórico em falha. Nenhum SMS real enviado. APN ausente nos pedidos antigos aparece como não registrada.
