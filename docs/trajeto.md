# Trajeto — Grupo RS Central

## Escopo e fonte

Aba independente após Registros; somente leitura, primeira versão em Imperatriz.
Reutiliza a resolução exata de placa, série e associado de Registros. Busca por
nome exige seleção do associado e do equipamento correspondente no banco local.
Não cria equipamentos nem modifica clientes, estoque, vínculos ou SMS.

Consulta autenticada `GET /get_trajeto.php` no portal de Imperatriz, com cliente,
veículo e início/fim. Não há polling. Limites: 7 dias, 20 mil posições, 16 MiB,
40 segundos, sem redirecionamento de cookies. Erro não equivale a histórico vazio.

O estudo confirmou também `GET /endpoints/v1/veiculos/trajeto-dia.php` na API REST,
por dia e paginado. A UI usa explicitamente a fonte web para preservar `mem`,
`data_gps`, `data_srv` e endereço, ausentes da amostra da API. Não há fallback
silencioso nem alegação de equivalência entre os históricos.

## Operação

1. Informe nome, placa ou série e período `dd/mm/aaaa hh:mm` no fuso da plataforma.
2. Confirme o veículo nas opções quando houver mais de um resultado.
3. Consulte os cards e a linha do tempo cronológica, paginada em cinco posições.
4. Clique em um ponto, use o controle deslizante ou reproduza. A reprodução é
   ponto a ponto, não em escala real de tempo; velocidades 1,5 / 0,8 / 0,35 s.
5. Arraste o mapa, use o zoom, enquadre o percurso ou alterne ruas/satélite.
6. Exporte KML para um caminho escolhido. O arquivo contém localizações privadas.

Verde: ignição ligada; vermelho: desligada; laranja: memória; cinza: desconhecida.
Lacunas acima de 10 minutos, saltos implausíveis (>250 km/h entre posições) ou
trechos atravessando posições descartadas são tracejados, excluídos da distância
GPS e separados no KML. Isso é uma heurística de qualidade, não diagnóstico GPS.
Não há reconstrução de ruas, nem cálculo de duração de paradas nesta versão.

Coordenadas inválidas, zero/zero e datas inválidas/fora do período são descartadas
com aviso. Pontos duplicados são removidos; a ordenação usa data GPS crescente.
Uma posição pode ser exibida/exportada, mas não produz distância de percurso.
O hodômetro só é usado quando presente em todos os pontos, não decrescente e sem
lacunas. Caso contrário, soma Haversine dos segmentos válidos, rotulada estimativa.

## Mapas e privacidade

Mapa nativo Godot, sem WebView e sem enviar nomes, telefones ou comandos aos
provedores. Apenas tiles visíveis, identificador de aplicativo, cache local de
imagens por 7 dias, sem pré-carregar áreas/níveis ou baixar mapas para uso offline.
O provedor pode inferir a região exibida a partir das solicitações de tiles.
Ruas: OpenStreetMap; satélite: Esri World Imagery. Atribuição sempre visível.
Disponibilidade e cobertura dependem dos provedores. Falha de fundo não apaga
o trajeto; a mensagem indica indisponibilidade. Street View abre apenas ao clicar.

`user://route_map_tiles` contém imagens públicas com localização implícita;
nunca incluir esse cache, KMLs ou consultas reais em Git/backup público.
Histórico e sessão permanecem em memória; sair da aba destrói temporizadores e
requisições-filhas. Respostas de buscas antigas não substituem uma busca atual.

## Validação

`tools/test_offline.ps1 -Tests @('tests/tracking_route_test.gd') -Rendered`
usa SQLite isolado, posições fictícias e rede de mapas desligada por padrão.
Valida dados inválidos, lacuna, reset do hodômetro, ordenação, duplicatas,
vazio/falha, reprodução, seleção, zoom, camada, KML, navegação e banco inalterado.
As variáveis `ROUTE_MAP_TEST=1` e `ROUTE_SATELLITE_TEST=1` habilitam validação
renderizada pontual dos tiles visíveis; não usar para varreduras automatizadas.

Consulta real de leitura validada em 17/09/2026: 10 pontos válidos, zero descartes
no intervalo verificado; identidade exata confirmada; KML validado em memória.
Sem gravação de histórico privado no repositório. Registros possui regressão própria.

Antes de substituir o executável operacional: perguntar “posso atualizar agora?”.
