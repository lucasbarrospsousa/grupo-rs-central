# Otimização de requisições — 29/10/2026

- O Gateway Mobile envia heartbeat no gateway-poll, mantendo intervalo de 2 segundos e compatibilidade com clientes antigos.
- Falhas HTTP entram em espera progressiva de 3 a 60 segundos; sucesso restaura a cadência. Nenhum envio incerto é reenviado automaticamente.
- Arquivos públicos são atendidos pelo serviço de assets; /api/* continua no Worker. public/_headers preserva CSP e cabeçalhos de segurança.
- Redução teórica de 50% das chamadas de acompanhamento da ponte atualizada, não de todo o sistema. Não garante margem na cota total; duas pontes continuamente ativas ainda exigem acompanhamento.

## Validação
84 testes locais passaram com fetch externo bloqueado. Teste de navegador simulado confirmou 50 aparelhos da página, início em 1,3 s, continuidade ao trocar de aba, repetição 30 s após a rodada e interrupção por revogação. Assets locais e publicados responderam 200 com CSP e no-cache. Runtime local testado com data 2026-05-22, limite da instalação local, sem alterar a data de produção.
APK compilado e assinatura validada. Usuário instalou a atualização no Galaxy; pacote atualizado e serviço foreground/acessibilidade verificados. Teste real de disparos adiado pelo usuário para após a migração: a consulta de status retornou CLOUDFLARE_RESOURCE_LIMIT; nenhuma mensagem de teste foi enfileirada.

Publicação Cloudflare: 7c4143c4-72a9-4925-a5b8-4b060c6ea571. Instalação de APKs e migração de conta são etapas separadas. Não há alteração de cobrança Google.
