# Animacoes compartilhadas da Central — 27/09/2026

Aplicado o padrao visual dos Logs do sistema nas demais paginas: shimmer durante consultas, entrada em cascata depois da resposta, abertura suave de janelas e resposta ao passar o mouse/clicar nos botoes. Login inclui indicador visual durante autenticacao.

O controlador somente observa a interface e envolve as chamadas existentes, preservando argumentos, resultados e erros. Nao adiciona consultas nem atrasa a entrega dos dados. Atualizacoes periodicas de saude e SMS nao repetem a animacao depois da primeira consulta. Logs mantem seu controlador especifico. A preferencia de movimento reduzido desativa os efeitos.

## Validacao

- Navegador Chrome com API local simulada: Visao geral, Estoque, Vinculacao, Cadastro em massa, Manutencoes, Consultar veiculo, Historico de posicoes, Trajeto, Armazem, SMS, Configuracoes e Usuarios. Sem erros de JavaScript; shimmer, superficies e abertura de modal verificados.
- Teste separado dos Logs: carregamento, entrada apos resposta, hover, modal, movimento reduzido, filtros, paginacao, escape de texto e falha de consulta preservados.
- Ciclo de consultas: primeira carga visivel; polling silencioso sem repetir entrada; falhas removem o indicador; resposta antiga nao interfere no carregamento de outra pagina; cinco chamadas iniciadas geram exatamente cinco chamadas ao repositorio, com resultados e contexto preservados.
- Sete testes existentes de acesso e carregamento sob demanda aprovados. Build de publicacao aprovado.

As verificacoes visuais usam dados simulados e nao representam auditoria dos dados operacionais. Esta entrega nao altera banco, permissoes nem servicos de sincronizacao.
