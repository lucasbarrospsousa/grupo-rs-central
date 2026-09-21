# Manutenções — histórico por atendimento

Equipamentos > Manutenções contém cards, contadores dos filtros, busca por nome/placa/série, situação, entrada desde AAAA-MM-DD e exportação PDF dos registros filtrados.

Novo atendimento consulta o nome após 500 ms sem digitação. Reutiliza autenticação do portal de Imperatriz e endpoints JSON `clientes_select2` e `veiculos` de `get_data.php`. Não confundir esses endpoints com a API REST de telemetria: a relação cliente/veículos vem do portal autenticado. Nenhuma senha fica no relatório. Outras filiais podem consultar o histórico local, mas a busca remota inicial está limitada a Imperatriz.

O operador seleciona o cadastro e exatamente um veículo, inclusive quando só há um. Série textual é preservada com zeros à esquerda. Resposta inválida, placa duplicada ou equipamento ausente impede cadastro com vínculo presumido. Mudança de consulta/filial descarta respostas antigas. Requisições de identificação são serializadas.

Motivos: Sem comunicação, Localização errada, Troca de aparelho. Relatório contém relato, diagnóstico, solução, responsável, situação e aparelho de saída em troca. Conclusão exige solução e, em troca, série de saída. Datas de abertura, atualização e conclusão são automáticas.

Persistência na coleção existente `maintenances`, com `visit_version=1` e ID aleatório por visita. Cliente, placa, série de chegada e data original ficam imutáveis após cadastro. Novas visitas não substituem anteriores. Importação legada não deduplica sobre visitas novas. Falha de gravação restaura o snapshot em memória. Não altera estoque, status do aparelho, vínculos ou cadastros remotos.

Validação isolada: `tools/test_offline.ps1 -Tests @('tests/maintenance_visits_test.gd') -Rendered`. Cobre repetição, persistência SQLite, identificação imutável, conclusão, múltiplos/único veículo, série ausente, falha e resposta atrasada. Capturas 1917×995 no diretório temporário isolado. Não é prova de disponibilidade atual do portal; autenticação real depende do acesso configurado no Central.

Exportação PDF usa o runtime de relatórios já utilizado pelo estoque. Recursos estão incluídos no preset existente. Substituição do executável operacional exige confirmação separada; exportar não instala.
