# Abertura com dados — 29/10/2026
Login recebe o bootstrap autorizado na própria resposta e reutiliza o cache de leitura existente. Elimina a chamada session imediatamente após login. Respostas de restauração anteriores ao novo login são ignoradas.
Conexões simultâneas ao Drive compartilham OAuth e validação de pasta; falhas liberam nova tentativa. Nenhuma alteração em permissões, coletores ou chamadas a fornecedores.
19 testes focados passaram (18 backend e 1 fluxo JavaScript simulado). O teste visual não executou por ausência do módulo Playwright. Asset publicado verificado HTTP 200; versão Cloudflare 735da86f-9678-4ee7-a964-427b034df136.
Sem medição autenticada de produção: leitura fria ainda depende do Drive e aguarda filiais autorizadas. Não representa garantia de latência zero nem implementação de carga progressiva por filial.
