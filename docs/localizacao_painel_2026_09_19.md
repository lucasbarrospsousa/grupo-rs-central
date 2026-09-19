# Localização individual no padrão SMS

Implementação do layout aprovado em 19/09/2026. `src/ui/location_dialog.gd` usa o mesmo banner, fonte e paleta do compositor SMS. O mapa nativo `src/ui/location_map.gd` reaproveita a entrada, projeção, cache e download visível de `route_map.gd`, sem alterar a tela Trajeto.

- Cliente, placa, série, fonte, última comunicação, ignição e tensão da bateria. O usuário esclareceu que bateria externa é a própria bateria; o campo separado foi removido.
- Ignição vem do campo de ignição, sem inferência por velocidade ou qualidade da comunicação.
- `battery_voltage`/`battery` mantêm a tensão retornada em um único campo. Ausência não significa zero. Unidades explícitas são preservadas.
- O timestamp recebido é exibido; não há contador que fique desatualizado com a janela aberta.
- Nenhuma consulta extra de bateria, cobertura ou operadora. A consulta inicial conserva API/web e paginação existentes. Atualizar faz uma nova consulta explícita; falha ou troca de filial mantém a posição anterior e avisa.
- Arraste, roda do mouse e botões de zoom, centralização, copiar coordenadas e Maps. Pino e tiles usam a mesma projeção; atribuição OSM visível. O cache contém somente imagens públicas, sem trilhas ou credenciais. Requisições do mapa pertencem à janela e são encerradas quando ela fecha.
- PNG do Leaflet 1.9.4 (`dist/images/marker-icon-2x.png`), licença BSD-2 em `assets/icons/location/LEAFLET-LICENSE.txt`, incluída no pacote. É o marcador aprovado na prévia, não uma arte exclusiva gerada.

## Validação

`tools/test_offline.ps1 -Tests @('tests/location_dialog_test.gd') -Rendered`: dados sintéticos, rede desativada, adaptadores de bateria, campos ausentes/unidades, ignição, projeção após arraste/zoom, centralização, falha de atualização, isolamento de filial e fechamento durante consulta. Captura em diretório temporário isolado. Não abre banco nem credenciais operacionais.

Opcionalmente, `GRUPO_RS_LOCATION_TILE_SMOKE=1` habilita somente download dos tiles públicos na posição fictícia do teste. Essa execução é um smoke de rede pública, não um teste offline nem teste funcional autenticado do Grupo RS. Nunca usar coordenadas/contas operacionais na fixture.

Regressões: `tracking_route_test.gd`, `imperatriz_api_migration_test.gd` e `package_contract_test.gd`. Contrato do pacote verifica os scripts, PNG e licença. Exportar cria versão separada; substituir/reiniciar EXE operacional depende da confirmação do usuário.

## Correção do cliente e da bateria

O clique da linha repassa placa e cliente à consulta. Se a posição da API vier sem titular e sem contexto disponível, consulta o vínculo exato no endpoint de veículos; persistindo a ausência, consulta o portal por série, respeitando as opções de leitura. Só aceita uma linha com série correspondente e placa compatível. Não escolhe o primeiro resultado nem inventa titular. Falha de consulta aparece como Consulta indisponível; ausência de um vínculo único aparece como Não retornado pela origem, preservando a posição. Troca de filial invalida o resultado.

Teste adicional: tests/location_client_resolution_test.gd, com respostas sintéticas, sem acesso operacional: contexto do clique, titular pela API, portal, séries/placas divergentes, duplicidade, falha, flags e troca de filial.

## Complemento web sem bloquear o mapa

A posição da API abre a janela imediatamente. Se o nome estiver vazio, o painel mostra Consultando… e consulta diretamente o portal em segundo plano, por série e identificação. O mapa e seus controles continuam disponíveis. Quando o nome já existe, não há consulta complementar. Apenas o campo Cliente e a indicação de sua fonte são atualizados, sem reiniciar ou recentralizar o mapa. A opção de leitura web é respeitada. Falhas preservam a posição; respostas obsoletas por nova consulta, troca de filial ou fechamento são descartadas. Testes sintéticos cobrem atraso do portal, ausência de chamada redundante e descarte de resposta antiga.
