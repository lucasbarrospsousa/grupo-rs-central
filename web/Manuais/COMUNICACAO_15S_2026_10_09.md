# Comunicação compacta e localização — 09/10/2026

Lista: `Ligado · há 15 s`, `Desligado · há 30 s` ou `Sem atualização · há 8 min`.
O estado representa a ignição da última amostra, não alimentação nem bateria interna.
Após cinco minutos sem comunicação, ou falha de consulta, o texto sinaliza falta de
atualização sem inferir desligamento. Datas sem fuso, inclusive com milissegundos,
são interpretadas em UTC-3.

Localização: ignição, bateria externa bruta, horário do evento, última comunicação,
tempo sem comunicar e GPS. Consulta o aparelho aberto a cada 15 s, sem requisições
sobrepostas; para ao fechar/substituir a janela ou sair da página. Aba oculta/offline
não inicia consulta periódica. A lista conserva seu intervalo de um minuto.

A última amostra válida fica no cache da sessão da lista, separado por filial e
aparelho. Falhas e respostas mais antigas não substituem a última confirmação.
Não cria histórico permanente novo no banco. Não adiciona consulta de bateria
interna nem muda cadastros. O mapa conserva o zoom se as coordenadas não mudarem.

Validação: 12 testes focados em `communication-state`, `stock-live` e
`cached-location`, mais `tools/test-cached-location-ui.mjs`: atualização manual,
dois ciclos de 15 s, encerramento ao fechar e layout em 1917×913. API simulada.
