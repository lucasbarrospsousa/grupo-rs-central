# Registros — consulta de histórico de Imperatriz

## Escopo e operação

Aba independente sob Equipamentos, sem alterar Estoque ou Consultar. Busca explícita por placa, série ou nome; nenhum pedido durante a digitação ou ao abrir a aba. O conjunto de equipamentos continua sendo o banco local da filial. Por nome, selecionar o associado e depois o equipamento. Homônimos permanecem separados.

O serviço confirma placa normalizada, série textual (zeros preservados), cliente e código do veículo. Não aceita o primeiro resultado aproximado. Outras filiais mostram indisponibilidade sem consultar Imperatriz em seu lugar. Nenhuma rotina desta aba escreve estoque, vínculo, credencial ou envia SMS.

Período no formato dd/mm/aaaa hh:mm, conforme o relógio usado pela plataforma; atalhos Hoje/Ontem usam o calendário local do computador. Limite inicial explícito de sete dias, 20 mil registros, 16 MB e timeout de 40 segundos para histórico/PDF. Datas inválidas ou intervalos invertidos são recusados antes do pedido.

## Fonte e divergência conhecida

Fonte usada: sessão autenticada em https://imp.ogrupors.com.br. Somente o login usa POST. A resolução usa GET em cadastro/veiculos_listar.php e get_data.php; o histórico usa get_eventos.php com cliente, veiculo, inicio e fim. Credenciais são lidas do cofre existente, sem migração. Não há gravação de cookies ou histórico em disco, nem polling.

A API documentada em https://novogrupors.ddns.net/api_rest_app/docs/index.html oferece GET endpoints/v1/registros/listar.php, porém no estudo de 17/09/2026 devolveu zero para uma janela na qual a web devolveu dez. Não tratamos esse vazio como ausência de registros e não alternamos silenciosamente fontes. A tela identifica a plataforma web.

## Apresentação

Cards: quantidade carregada, distância informada pelo servidor, maior velocidade entre os registros recebidos e quantidade de registros marcados como memória pelo servidor. Valores ausentes são S/D, nunca zero inventado. Resposta com total maior que os registros carregados é explicitamente parcial; as métricas de velocidade/memória referem-se à parte recebida.

Histórico ordenado por Data GPS decrescente, desempate por Data Servidor, cinco linhas por página. Cada registro deve conter o mesmo código de veículo confirmado. Duplicados por identificador são removidos. Seleção mostra endereço, hodômetro, ignição, motorista e diferença entre relógios; diferença negativa pode refletir relógios inconsistentes, não latência real. Memória não é diagnóstico de falha de GPS.

Entrada suave, hover somente nos cards de resumo e botões, tabela estável. GRUPO_RS_REDUCED_MOTION=1 desativa movimento. Ícones SVG próprios na pasta assets/icons/records.

## Mapa e PDF

Carregar mapa busca somente o tile OpenStreetMap visível, mediante clique. Não prebusca trilhas ou áreas. Atribuição visível, User-Agent próprio, HTTPS, timeout e tamanho limitados; cache público de tiles por sete dias em user://records_map_tiles (não incluir em publicação/backup). O cache representa áreas visualizadas e deve ser tratado como dado local privado, embora as imagens sejam públicas. Nenhuma credencial da plataforma vai ao provedor do mapa. Política: https://operations.osmfoundation.org/policies/tiles/ . Ver posição abre coordenadas válidas no Google Maps, somente mediante clique; coordenadas ausentes/0,0 são bloqueadas. Esta primeira versão mostra um recorte fixo, não um mapa de rotas navegável.

Exportar PDF pede o destino e baixa o relatório de exportar_pdf.php, preservando o veículo e período da consulta concluída. Verifica resposta PDF (não salva HTML de login como PDF). Layout e campos do PDF são os da plataforma, não uma cópia da tabela do Central. O usuário escolhe onde guardar o arquivo, que contém dados privados. Não exporta automaticamente e não abre links com credenciais.

## Validação

Executor isolado: tools/test_offline.ps1 -Tests @('tests/tracking_records_service_test.gd','tests/tracking_records_test.gd') -Rendered.

Cobre períodos, datas inválidas, identidade exata, homônimos, duplicados, base, erros versus vazio, paginação, valores ausentes, retorno parcial, encaminhamento de mapa simulado e falha PDF sem arquivo. Com RECORDS_MAP_TEST=1, o teste visual solicita um único tile público para coordenadas fictícias, com cache isolado. Fixture SQLite comparada antes/depois; não executa ações de produção.

Teste real em 17/09/2026 confirmou o vínculo e dez registros em uma janela de dez minutos; PDF autenticado válido de uma página, renderizado e inspecionado. Dados reais, IDs internos, coordenadas, PDF e capturas de produção ficam fora do Git e backup público.

## Entrega

Empacotar somente revisão selecionada, validar pacote e preservar versão anterior. Antes de substituir o executável aberto, perguntar exatamente: posso atualizar agora?
