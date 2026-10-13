# Medição de salvar, alterar e excluir — 13/10/2026

## Método e limites

Executado `node web/tools/profile-crud.mjs --rollback-only`: handlers HTTP reais,
papel SQL de execução real e banco configurado. Duas rodadas por operação em
chips do armazém e aparelhos do estoque; seis recargas por lista. Usuário e sessão
QA temporários; registros fictícios invisíveis a outras conexões dentro de uma
transação externa. Tudo desfeito, identidade removida e ausência conferida.
Nenhuma consulta a operadoras, comando serial ou cadastro em plataforma externa.

API de operadora simulada inicialmente sem atraso e depois com atraso de 1 s.
Não é medição da latência real de Árya/Link. HTTP local até banco remoto: não mede
proxy hospedado, inicialização Edge, rede do navegador nem renderização DOM.
COMMIT dos handlers convertido em RELEASE SAVEPOINT: mede controle transacional,
mas não o custo do commit durável. Apenas duas amostras por mutação; médias
diagnósticas, não percentis ou garantia de desempenho em produção.

## Resultados (médias)

| Operação | Mutação HTTP | Consultas SQL | Recarga posterior | Soma estimada |
|---|---:|---:|---:|---:|
| Salvar chip | 2,323 s | 13 | 1,634 s | 3,957 s |
| Alterar classificação do chip | 2,452 s | 15 | 1,634 s | 4,086 s |
| Excluir chip | 2,247 s | 13 | 1,634 s | 3,881 s |
| Salvar aparelho | 2,580 s | 15 | 1,963 s | 4,543 s |
| Alterar aparelho | 2,426 s | 14 | 1,963 s | 4,389 s |
| Excluir aparelho | 2,415 s | 14 | 1,963 s | 4,378 s |

Recarga do armazém: 9 comandos SQL, cerca de 303 kB de JSON.
Recarga do estoque: 8 comandos SQL, cerca de 5,34 MB de JSON (sem compressão).
O tempo inclui receber e interpretar JSON no cliente Node, não desenhar a tela.
Conexão inicial de teste: 997 ms. SELECT 1 aquecido: 158, 160 e 158 ms.
Salvar chip com atraso simulado de 1 s na operadora: 3,264 s antes da recarga.

### Etapas de salvar chip, sem atraso externo

| Etapa | Tempo |
|---|---:|
| Sessão/permissões/filial (4 consultas) | 626 ms |
| Controle transacional e contexto (3 comandos) | 473 ms |
| Aquisição de lock | 156 ms |
| Consulta e gravação de idempotência | 313 ms |
| INSERT do chip, incluindo gatilhos | 263 ms |
| Auditoria de negócio | 161 ms |
| Log de resposta, incluindo gatilhos | 256 ms |
| HTTP local, serialização e demais custos | cerca de 75 ms |

Tempos SQL incluem viagem pela rede, não representam exclusivamente execução
no PostgreSQL. O tempo de aquisição do lock não comprova contenção: foi próximo
ao custo de SELECT 1. A espera serial explica grande parte do custo local medido.

## Causas confirmadas no código

- `sql-repository.js`: salvar, classificar, alterar e excluir esperam `load()`;
  ele invalida o cache e baixa a lista inteira antes de liberar o fluxo.
- `warehouse-register.js` consulta o provedor antes do envio. `business.mjs`
  chama `verifyWarehouseChip()` novamente ao salvar. É validação de servidor
  necessária hoje; eliminar sem substituição permitiria dados não verificados.
- `api.mjs` faz consultas sequenciais de sessão, permissões e filial, controle
  transacional, idempotência e auditoria. A filial é conferida duas vezes nas
  mutações comuns. Não remover isolamento/RLS, CSRF ou idempotência para acelerar.
- `system-logs.mjs` segura a resposta até persistir o log; migração 018 aplica
  retenção por gatilho em cada INSERT. Não foi isolado quanto custa o gatilho.
- `build-hosting.mjs` define pool hospedado de duas conexões e expiração ociosa
  de 1 s. Pode acrescentar reconexões ou fila sob concorrência; impacto não
  medido nesta execução. A conexão local não reproduz a rota Edge até o banco.

## Ordem sugerida de melhoria

1. Retornar o registro confirmado e atualizar somente a linha/contadores no
   cliente; deixar reconciliação ampla em segundo plano. A recarga representou
   aproximadamente 40–45% da soma medida. Confirmar sucesso apenas após gravar.
2. Consolidar verificações e comandos SQL em menos viagens, preservando as
   mesmas permissões, bloqueios, versões, transação, auditoria e idempotência.
3. Reutilizar consulta recente do chip validada pelo servidor com prazo curto e
   chave ICCID+provedor; não confiar em campos enviados pelo navegador.
4. Medir a rota hospedada antes de ajustar pool e retenção dos logs. Avaliar
   conexão ociosa e execução de retenção sem prejudicar auditoria ou limites.
5. Paginar/projetar listas, principalmente o estoque, evitando baixar toda a
   telemetria para atualizar um cadastro.

Nenhuma otimização funcional ou mudança de configuração foi aplicada nesta
análise. Manutenções, lotes e operações externas não foram cronometrados.
