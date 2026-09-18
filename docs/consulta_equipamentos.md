# Consultar — equipamentos locais e vínculos por cliente

Entrada independente em Equipamentos > Consultar. Estoque permanece com seu fluxo local anterior.

- Campo único: série numérica e placa completa filtram os registros locais e depois conferem associado/comunicação; texto procura clientes. Nome exige 3 caracteres. Busca vazia lista o banco local sem disparar consultas remotas.
- Nome consulta somente Imperatriz, no host HTTPS `imp.ogrupors.com.br`. Credenciais existentes do portal são lidas do cofre; sessão e cookies ficam em memória.
- API JSON do próprio portal: `get_data.php?acao=clientes_select2` e `acao=veiculos&cliente=...&mapa_rapido=1&leve=1`. Clientes são selecionados pelo ID, inclusive homônimos.
- Vínculos são comparados com a série local exata, preservando zeros à esquerda. Respostas numéricas sem série textual são sinalizadas como parciais, sem completar zeros ou presumir identificação.
- Apenas registros locais entram na tabela. Placa, telefone, operadora e status cadastral vêm do banco local. O associado pode ser complementado em memória pelo portal; comunicação vem da API. Nenhum cadastro é criado/atualizado por este fluxo.
- Cards contam vínculos únicos, encontrados antes do filtro de status e ausentes. Tabela paginada em 20 registros. SMS e Editar reutilizam os fluxos existentes, iniciados explicitamente pelo operador.
- Outras bases: série/placa/status locais; busca remota por nome informa indisponibilidade, sem consultar Imperatriz em seu lugar.
- HTTP tem limite de 15 segundos por chamada, sem redirecionar credenciais para outros hosts; falha não é exibida como ausência de cliente. Sem polling automático.
- Entrada com fade de 250 ms, hover nos cards e botões do tema. `GRUPO_RS_REDUCED_MOTION=1` desliga o movimento.

## Validação

`tools/test_offline.ps1 -Tests @('tests/equipment_consultation_test.gd') -Rendered`

Fixture isolada: série exata, zeros, placa, filtro de status, homônimos, interseção, fora do banco, falha de serviço, bloqueio de outra base, encaminhamento das ações com mocks e comparação do banco antes/depois. Captura em 1917×995.

Em 17/09/2026, testes reais de leitura autenticada verificaram um cliente com um vínculo presente no banco local de Imperatriz e outro com um vínculo ausente. Nenhum SMS, edição, criação ou baixa foi executado. Identificadores e respostas operacionais não integram o repositório.

O teste de encaminhamento de SMS/Editar não equivale a envio real ou gravação de edição. O executável operacional só pode ser substituído após a pergunta “posso atualizar agora?” e autorização.

## Placas coloridas e associado na busca por placa

Busca por placa/série usa GET em `/cadastro/veiculos_listar.php` para encontrar o associado, exigindo placa normalizada e série exata, sem aceitar duplicados. Reutiliza o parser e o decodificador UTF-8/Latin-1 existentes. A comunicação exige também correspondência do identificador do veículo nos vínculos do cliente; homônimos não são agrupados. Falha remota conserva o resultado local e informa a limitação no tooltip.

Card da placa: verde ligado; vermelho desligado; amarelo desatualizado; roxo possível falha de GPS; cinza informação insuficiente/indisponível. Reutiliza o classificador do Estoque: 10 minutos ligado, 60 minutos desligado e atraso GPS acima de 2 horas; amarelo prevalece sobre GPS. Datas inválidas, incompletude do esquema e erro HTTP não viram diagnóstico de GPS. O histórico de comparação é apenas em memória.

Há legenda textual no card e tooltip com ignição, servidor, GPS e origem. O envelhecimento é recalculado localmente a cada 30 segundos, sem polling de rede. Buscar/Atualizar consulta renova a leitura; paginação consulta somente as linhas da página, sequencialmente. As respostas são descartadas ao sair/trocar de base. Nenhum nome, telemetria ou posição é persistido por esta tela.

Testes adicionais: `consultation_plate_details_test.gd`, `inventory_communication_status_test.gd`, `button_motion_test.gd`, `card_motion_test.gd`. Regressão da consulta inclui placa com espaços/hífen/letras minúsculas, cinco cores, ausência de dados, envelhecimento e fonte exata. O teste de animação cobre botões removidos antes da instalação adiada do efeito.

Consulta real em 17/09/2026 confirmou associado e comunicação recente para o exemplo solicitado pelo usuário, sem gravação ou SMS. Dados identificáveis e capturas reais permanecem fora do Git/backup público.
