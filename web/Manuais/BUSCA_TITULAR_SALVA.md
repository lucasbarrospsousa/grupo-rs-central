# Busca de titular com dados salvos — 21/10/2026

A busca do estoque usa GET /api/devices?scope=owners&branch=...&query=..., mantendo a sessão, autorização por filial e transação com RLS do endpoint de aparelhos. Não chama integrações nem grava confirmação.

A consulta valida estado Instalado, filial, série, placa, código do titular, códigos atuais de aparelho/veículo e ausência de troca em andamento. Preserva checked_at e mostra a última conferência em Fortaleza; vínculo salvo consistente não significa confirmação externa atual. Cadastros sem confirmação suficiente aparecem como quantidade pendente. Titulares homônimos continuam separados pelo identificador.

A seleção usa os vínculos da própria resposta, sem segunda consulta externa. Correção de 21/10/2026: após a busca salva, os aparelhos visíveis retomam normalmente as rodadas de comunicação/chips. Somente a identificação do titular é local; status de comunicação e chip continuam consultados pelas integrações. Botões operacionais explícitos, incluindo análise de baixa, mantêm suas verificações anteriores.

Validação: testes unitários de acesso, busca, datas e respostas atrasadas; SQL sintético em transação somente leitura; leitura de titular real salvo; endpoint publicado acessado com sessão do usuário. Nenhuma API operacional RS/SGA acionada pelos testes. Não há alteração de esquema/índices; medição atual não justificou uma migração de índice.

Tempos observados: consulta local ao Supabase 194/191/192 ms; página SQL 321 ms. Navegação autenticada ao endpoint via ferramenta do Chrome 4,134 s e recarga 3,637 s (inclui navegação/automação; não é medição isolada do clique até renderização).

Publicação: API Supabase central-api versão 259 e assets do Worker grupo-rs-central-avaliacao. Site principal https://central.sinderacode.workers.dev. Cópia Sites permanece privada e sem republicação.
