# Auxiliares da localização individual

- `map_config.gd`: configuração do provedor OpenStreetMap.
- `map_projection.gd`: conversões de coordenadas, tiles e pixels Web Mercator.
- `map_tile_provider.gd`: URLs, atribuição, cache e decodificação PNG/JPEG.

No dashboard, `_show_location_lookup` e `_show_location_dialog` preservam a
consulta individual. `_ensure_location_coverage_catalog` carrega o catálogo
Anatel local quando a estimativa de cobertura é solicitada.

O controller, o canvas e a fila de consultas do Mapa Grande foram removidos.
Esses auxiliares não criam temporizadores nem iniciam consultas por conta própria.
