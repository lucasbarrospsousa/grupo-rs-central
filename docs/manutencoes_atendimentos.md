# Manutenções — relatório e baixa local

Atualizado em 21/09/2026 conforme prévia aprovada.

O formulário central compacto mantém cliente → seleção de um veículo → série vinculada, consultados pelo portal autenticado de Imperatriz. Nome digitado não confirma identidade: selecionar o resultado e o veículo. Outras filiais mantêm histórico local; consultas remotas seguem o escopo existente.

Campos: cliente, veículo, aparelho atual, motivo (Sem comunicação, Localização errada, Troca de aparelho), meio (App de rastreamento, Suporte do rastreio, Consultor informou) e observações. Situação, responsável, aparelho de saída, diagnóstico e solução foram removidos do formulário. A ação é **Salvar relatório**. Os seletores de motivo/meio aparecem como opções visíveis. Lista de aparelhos com pesquisa por série só aparece para troca.

Ao salvar uma troca, selecionar um aparelho disponível no estoque da filial. O serviço SQLite `save_visit` adquire transação `BEGIN IMMEDIATE`, relê a disponibilidade, registra relatório, atualiza o aparelho selecionado para Instalado com a placa local e grava uma única movimentação de baixa. Não chama API de escrita, não troca vínculo remoto e não modifica o aparelho de chegada. Não é confirmação de instalação na plataforma.

Relatório e baixa são atômicos: erro reverte ambos. Um aparelho já retirado do estoque não pode ser selecionado por outro relatório. Edição do mesmo relatório não repete a baixa; após baixa, motivo e série de instalação ficam bloqueados. Identidade original permanece imutável. Cada visita recebe ID próprio. Registros novos usam `visit_version=2`; o estado interno concluído representa relatório registrado, não solução técnica comprovada. Dados antigos permanecem preservados, inclusive campos retirados; PDF identifica esses campos como históricos.

Persistência incremental no SQLite evita substituir o snapshot completo do estoque. Ao concluir, o Central recarrega a filial e emite o evento de banco salvo. A lista e PDF exibem meio e aparelho para instalação. Não é realizada migração em massa.

## Validação

- `tools/test_offline.ps1 -Tests @('tests/maintenance_visits_test.gd') -Rendered`: banco isolado, seleção cliente/veículo, resposta antiga, falhas, série ausente, relatório, baixa pela interface e captura sem rolagem na referência 1917×991.
- `tests/maintenance_report_transaction_test.py`: SQLite temporário; rollback por falha de gravação, repetição sem baixa duplicada, aparelho indisponível, filial incorreta e relatório sem troca.
- Compilação/exportação em pasta nova de build; não substitui o executável em uso. Atualização operacional exige confirmação separada.

Testes não escrevem no banco operacional nem na plataforma. PDF usa o runtime de relatórios existente.
