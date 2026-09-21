# Vinculação para estoque

Aba Equipamentos > Vinculação, aprovada em 19/09/2026. Disponível para operações em Imperatriz; outras filiais não enviam pedidos por esta aba.

Lista apenas aparelhos em Reserva ou Manutenção do banco local, com busca por série, filtros, seleção individual e identificação informada pelo operador (AAA, GRS ou XRS seguida de número). Titular fixo RS300. O operador revisa série, identificação, titular e situação final antes de confirmar.

## Operação

1. Confere série única e aparelho ativo na API; busca a identificação nos formatos exibido e normalizado, usando também o índice da série se a busca por placa ainda não localizar o vínculo. A correspondência exata de placa e aparelho continua obrigatória. Resposta inválida, ampla demais ou ambígua bloqueia.
2. Confere a série exata no portal. Vínculo diferente é bloqueado, sem substituir placa ou cliente de um veículo instalado.
3. Resolve um único cliente de nome exatamente RS300 no catálogo web. Nunca usa o primeiro resultado aproximado.
4. Registra a tentativa antes de um único POST de veículo pela API, com os códigos do aparelho, titular e tipo Carro. Não altera chip/APN, não envia SMS e não ativa equipamentos inativos.
5. Confirma identificação e série/código na API e identificação/titular no portal. Uma placa sem identidade de equipamento não basta.
6. Atualiza somente o cadastro selecionado para Estoque, com identificação e RS300. Preserva demais dados, confere a persistência no Banco local SQL e registra o histórico.

Não há terceiro status de preparação. Em falha remota, o cadastro permanece no estado anterior. Se o vínculo já estiver correto, apenas confirma e conclui a etapa local. A classificação genérica RS300 pode ser refinada pela regra existente de prefixo; versões específicas são preservadas.

## Interrupções

O serviço pertence ao controller, não à página. Navegar não cancela uma escrita já enviada; troca de filial e saída pelo menu ficam bloqueadas durante a operação. Mudança de filial/store ou cadastro entre consultas impede a gravação local com resposta obsoleta.

O arquivo operacional `user://stock_link_pending.json` impede repetir POST após timeout, HTTP 500 ou fechamento do aplicativo. Nova tentativa consulta a plataforma primeiro e só conclui localmente quando há correspondência exata. Não há fallback de escrita web após resultado incerto. Rejeições definitivas de autenticação/validação permitem nova tentativa somente quando as leituras confirmam ausência de vínculo.

Tentativas pendentes aparecem em uma ação de conferência tanto para Reserva/Manutenção quanto para Estoque com persistência ainda não conferida. Essa ação confere o mesmo vínculo e a persistência, sem reenviar o POST. Arquivo de pendência ilegível bloqueia novas escritas. Não remover esse arquivo para forçar repetição de uma operação não esclarecida.

Após envio aceito, HTTP 409 ou falha de transporte potencialmente ambígua, são feitas até três rodadas de confirmação, com intervalo de 0,8 segundo entre rodadas. São somente leituras. Se a API confirmar o vínculo mas o portal não confirmar RS300, a mensagem identifica essa pendência. Um 409 não autoriza recriar, substituir vínculo ou apagar o registro de tentativa. A interface usa confirmação clara no padrão azul do sistema, campos bloqueados legíveis e aviso destacado de progresso/resultado.

## Validação

- `stock_link_test.gd`: Reserva/Manutenção, conflito, titular ausente/incorreto, troca de filial, timeout sem repetição, reconciliação, falha de conferência local, HTTP 409 persistente/tardio e operação seguinte no mesmo serviço.
- `stock_link_transport_test.gd`: parsing real com respostas sintéticas, série duplicada, placa sem identidade, identidade divergente, erro explícito, titular único e persistência da tentativa.
- `stock_link_ui_test.gd`: shell renderizado em 1917×991, lista elegível, busca, filtros, confirmação e processamento renderizados, revisão sem gravação e bloqueio de troca de filial.
- `stock_link_persistence_test.gd`: gravação e releitura em SQLite isolado, situação/identificação/titular corretos, preservação do chip e da versão específica do aparelho.
- Regressão: cena principal, troca de filial e retorno ao estoque existente. Pacote exportado auditado pelo contrato de recursos.
- Consulta real somente de leitura validou o adaptador de aparelho e catálogo de titular e detectou vínculo divergente. Nenhuma nova escrita operacional foi executada para validar esta implementação. O POST de criação já havia sido comprovado na operação pontual autorizada anterior; isso não equivale a testar o botão instalado com outro aparelho.

Nenhum identificador operacional, credencial ou relatório privado deve ser incluído no Git/backup. Esta entrega não altera o botão Estoque existente nem os cadastros gerais para enviar escritas remotas.
