# Armazém — cadastro manual

Aparelhos e chips são cadastrados por **+ Novo item**. Escolha o tipo e informe a série de 9 dígitos ou o ICCID de 19/20 dígitos iniciado por 89. Os zeros iniciais são preservados. Não há pareamento, conexão, leitura nem recebimento do RS Scanner.

Salvar registra apenas no Armazém separado; não cadastra ou vincula aparelhos na plataforma. Números duplicados são recusados sem reabrir itens enviados/utilizados. Seleção por linha, destinos por base ou texto livre e Movimentações continuam disponíveis.

Chips cadastrados no banco compartilhado pelo Configurador são reconhecidos automaticamente pela Central enquanto Armazém está aberto (intervalo de 15 segundos). Correspondência exata e única de ICCID, série válida e base reconhecida são obrigatórias; falhas e ambiguidades ficam pendentes. A fonte operacional é aberta somente para leitura. A utilização preserva o histórico anterior.

O banco privado `user://scanner_inventory.sqlite` e suas tabelas antigas são preservados para compatibilidade. Configurações de pareamento antigas ficam inertes. O serviço não importa o gateway SMS nem chama o celular. Os nomes internos dos arquivos foram preservados para compatibilidade de exportação.

Validação: testes Python isolados de cadastro, duplicação, movimentação e uso de chips; teste Godot com serviço falso, cadastro, erro, cancelamento e seleção. Nenhum cadastro real é criado pelos testes.

## Remoção manual e seletores

O X na coluna Ações remove somente itens disponíveis, após confirmação. O registro original é preservado; a tabela removals registra a data. O item sai das listas de aparelhos/chips e fica em Movimentações como Removido da lista. Repetir a operação não duplica o evento. Itens enviados/utilizados não podem ser removidos; itens removidos não podem ser enviados, recadastrados como novos ou reconciliados automaticamente. Não há exclusão no banco operacional. Seletores de tipo, situação e base usam estilos claros em todos os estados.
