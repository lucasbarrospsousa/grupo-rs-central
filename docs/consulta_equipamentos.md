# Consultar — equipamentos locais e vínculos por cliente

Entrada independente em Equipamentos > Consultar. Estoque permanece com seu fluxo local anterior.

- Campo único: série numérica e placa completa são reconhecidas como busca local; texto procura clientes. Nome exige 3 caracteres. Busca vazia lista o banco local com o status escolhido.
- Nome consulta somente Imperatriz, no host HTTPS `imp.ogrupors.com.br`. Credenciais existentes do portal são lidas do cofre; sessão e cookies ficam em memória.
- API JSON do próprio portal: `get_data.php?acao=clientes_select2` e `acao=veiculos&cliente=...&mapa_rapido=1&leve=1`. Clientes são selecionados pelo ID, inclusive homônimos.
- Vínculos são comparados com a série local exata, preservando zeros à esquerda. Respostas numéricas sem série textual são sinalizadas como parciais, sem completar zeros ou presumir identificação.
- Apenas registros locais entram na tabela. Placa, telefone, operadora e status vêm do banco local. O nome selecionado identifica a associação obtida na consulta. Nenhum cadastro é criado/atualizado por este fluxo.
- Cards contam vínculos únicos, encontrados antes do filtro de status e ausentes. Tabela paginada em 20 registros. SMS e Editar reutilizam os fluxos existentes, iniciados explicitamente pelo operador.
- Outras bases: série/placa/status locais; busca remota por nome informa indisponibilidade, sem consultar Imperatriz em seu lugar.
- HTTP tem limite de 15 segundos por chamada, sem redirecionar credenciais para outros hosts; falha não é exibida como ausência de cliente. Sem polling automático.
- Entrada com fade de 250 ms, hover nos cards e botões do tema. `GRUPO_RS_REDUCED_MOTION=1` desliga o movimento.

## Validação

`tools/test_offline.ps1 -Tests @('tests/equipment_consultation_test.gd') -Rendered`

Fixture isolada: série exata, zeros, placa, filtro de status, homônimos, interseção, fora do banco, falha de serviço, bloqueio de outra base, encaminhamento das ações com mocks e comparação do banco antes/depois. Captura em 1917×995.

Em 17/09/2026, testes reais de leitura autenticada verificaram um cliente com um vínculo presente no banco local de Imperatriz e outro com um vínculo ausente. Nenhum SMS, edição, criação ou baixa foi executado. Identificadores e respostas operacionais não integram o repositório.

O teste de encaminhamento de SMS/Editar não equivale a envio real ou gravação de edição. O executável operacional só pode ser substituído após a pergunta “posso atualizar agora?” e autorização.
