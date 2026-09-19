# Localização individual no padrão SMS

Implementação do layout aprovado em 19/09/2026. `src/ui/location_dialog.gd` usa o mesmo banner, fonte e paleta do compositor SMS. O mapa nativo `src/ui/location_map.gd` reaproveita a entrada, projeção, cache e download visível de `route_map.gd`, sem alterar a tela Trajeto.

- Cliente, placa, série, fonte, última comunicação, ignição, tensão e bateria externa.
- Ignição vem do campo de ignição, sem inferência por velocidade ou qualidade da comunicação.
- `battery_voltage`/`battery` mantêm a tensão retornada. Bateria externa aceita apenas o campo explícito e seus aliases; bateria interna/backup não é reapresentada como externa. Ausência não significa zero. Unidades explícitas são preservadas.
- O timestamp recebido é exibido; não há contador que fique desatualizado com a janela aberta.
- Nenhuma consulta extra de bateria, cobertura ou operadora. A consulta inicial conserva API/web e paginação existentes. Atualizar faz uma nova consulta explícita; falha ou troca de filial mantém a posição anterior e avisa.
- Arraste, roda do mouse e botões de zoom, centralização, copiar coordenadas e Maps. Pino e tiles usam a mesma projeção; atribuição OSM visível. O cache contém somente imagens públicas, sem trilhas ou credenciais. Requisições do mapa pertencem à janela e são encerradas quando ela fecha.
- PNG do Leaflet 1.9.4 (`dist/images/marker-icon-2x.png`), licença BSD-2 em `assets/icons/location/LEAFLET-LICENSE.txt`, incluída no pacote. É o marcador aprovado na prévia, não uma arte exclusiva gerada.

## Validação

`tools/test_offline.ps1 -Tests @('tests/location_dialog_test.gd') -Rendered`: dados sintéticos, rede desativada, adaptadores de bateria, campos ausentes/unidades, ignição, projeção após arraste/zoom, centralização, falha de atualização, isolamento de filial e fechamento durante consulta. Captura em diretório temporário isolado. Não abre banco nem credenciais operacionais.

Opcionalmente, `GRUPO_RS_LOCATION_TILE_SMOKE=1` habilita somente download dos tiles públicos na posição fictícia do teste. Essa execução é um smoke de rede pública, não um teste offline nem teste funcional autenticado do Grupo RS. Nunca usar coordenadas/contas operacionais na fixture.

Regressões: `tracking_route_test.gd`, `imperatriz_api_migration_test.gd` e `package_contract_test.gd`. Contrato do pacote verifica os scripts, PNG e licença. Exportar cria versão separada; substituir/reiniciar EXE operacional depende da confirmação do usuário.
