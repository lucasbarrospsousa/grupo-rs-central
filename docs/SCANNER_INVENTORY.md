# Estoque do Scanner — integração local, Imperatriz

Pedido de 21/09/2026: receber séries e ICCIDs do RS Scanner em duas listas próprias, fora do estoque operacional. Menu independente Estoque Scanner; abas Estoque - aparelho e Estoque - chip, pesquisa numérica e paginação de 25 itens.

RS Scanner código 2 → Conectar ao Central. Mesmo Wi-Fi, HTTPS na porta 8843, certificado SHA256 conferido no celular e código temporário. No Central, Conectar Scanner e depois Receber leituras. Cada clique importa até 40 itens; repetir se a fila for maior. Endereço pode ser atualizado sem trocar certificado. O Scanner deve permanecer aberto; PC desligado não recebe, fila permanece no celular.

`src/services/scanner_bridge.gd` executa `tools/scanner_inventory_service.py` fora da interface. Runtime privado em user://scanner_bridge; o transporte HTTPS/DPAPI é reutilizado por importação do módulo SMS, sem iniciar seu serviço, modificar sua fila ou enviar mensagens. Nenhum endpoint da plataforma Grupo RS é chamado.

Persistência exclusivamente `user://scanner_inventory.sqlite`, independente do store de equipamentos. Itens identificados por base/tipo/número; recibos por identidade do celular/UUID. Transação durável precede ACK. Repetições não duplicam; divergência no UUID é rejeitada. Confirmação ao celular perdida não desfaz item recebido, próximo clique reconcilia. Ambos os lados validam tipo e tamanho e preservam zeros. Token protegido por Windows DPAPI, sem credenciais nas saídas. Pareamento verifica certificado antes de enviar código ou token. Não abrir portas de roteador.

Validação: testes Python `tests/scanner_inventory_test.py` em banco temporário e `tests/scanner_inventory_ui_test.gd` no executor isolado renderizado em 1917×991. Verificar também navegação lateral e contrato de pacote. Testes sintéticos não comprovam câmera nem conexão física Android/PC. Atualização das instalações e ensaio físico pendentes de autorização. Não registrar os números reais das fotos como estoque de teste.

Não incluir bancos, fila, credenciais, relatórios operacionais nem logs nos pacotes públicos. Export inclui os dois módulos Python necessários. A instalação operacional não é substituída automaticamente.
