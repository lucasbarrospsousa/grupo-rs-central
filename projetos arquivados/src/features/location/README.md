# Localização individual

O Mapa Grande foi retirado na versão 4.2.2. A cena principal utiliza diretamente
`src/inventory_dashboard.gd`. Não há controller de mapa completo nesta pasta.

Permanecem apenas os auxiliares reutilizados pelo cartão de localização de um
equipamento: configuração do provedor, projeção Web Mercator e decodificação
de tiles. A consulta individual continua explícita, com identificação do
equipamento, data da posição e apresentação de falhas; não depende de uma
varredura do antigo mapa.

O catálogo Anatel permanece disponível para estimativas locais de cobertura.
Não se deve apresentar essa estimativa como intensidade de sinal medida.

O histórico das implementações anteriores está no Git. Limites de API e
incidentes registrados em revisões antigas não devem ser tratados como
verificações atuais. Consulte `docs/retirada_mapa_online_4_2_2.md` para escopo.
