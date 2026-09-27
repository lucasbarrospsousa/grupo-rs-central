# Ponto de autorização — banco da Central web

Proposta de 24/09/2026, ainda não executada. Não há SQL aplicado, banco conectado, credencial coletada ou dado operacional copiado.

## Primeiro escopo a autorizar

Criar a estrutura de teste no projeto Supabase `grupo rs central` já identificado, configurar autenticação e permissões, conectar a versão web e validar com dados sintéticos. Revisar a região, o plano, os limites e as tabelas existentes novamente antes de qualquer aplicação.
Importação dos dados reais deve ocorrer somente em etapa posterior, após backup, inventário de fontes e aprovação do corte.

## Entidades previstas

| Entidade | Objetivo e restrições |
|---|---|
| branches | Identificadores estáveis das quatro bases |
| profiles / memberships | Perfil ligado ao usuário Auth; bases e papel atribuídos por administrador |
| devices | Série textual, base, estado, placa, modelo, operadora, versão para concorrência |
| chips | ICCID textual completo, resultado confirmado da Arya, data/origem da confirmação |
| warehouse_items | Item do armazém separado do estoque da filial; aparelho ou chip |
| transfers / transfer_items | Destino interno ou livre, itens, responsável e observação |
| maintenance_reports | Veículo confirmado, série de chegada, motivo, meio, observação e reposição |
| movements / audit_events | Histórico imutável associado à operação e ao usuário |
| operation_requests | Chave de idempotência, estado e resultado da operação; repetição segura |

As restrições definitivas de unicidade global de série/ICCID dependem de auditoria das fontes. O banco local atual permite SKU por filial: não presumir equivalência nem descartar duplicados silenciosamente.

## Permissões propostas para revisão

- Operador de filial: somente linhas das bases atribuídas; sem alterar permissões.
- Gestor: visão consolidada e operações autorizadas nas bases atribuídas.
- Administrador: usuários e associações; nunca por atualização livre do próprio perfil.
- Armazém: permissão explícita por função, sem exposição automática a todos os usuários.
- API pública sem login: nenhum acesso a dados operacionais.
- RLS e grants revisados para tabelas, views e funções. Testar duas contas de filiais distintas e uma conta sem permissões.

## Contratos do servidor a implementar

Leituras paginadas: filial obrigatória, filtros e resultado com origem/data/estado. Falha não equivale a lista vazia.
Analisar baixa: aceita IDs locais, resolve série canônica no servidor, consulta API da filial e complementa titular por correspondência exata. Devolve revisão temporária do vínculo e motivo por item.
Aplicar baixa: recebe IDs selecionados e identificador da análise, revalida vínculo e versão, faz atualização/auditoria em transação e devolve sucesso/pendência por item. Interface acompanha progresso; não repetir escrita remota em timeout.
Relatório com troca: conferir disponibilidade e gravar relatório/baixa/movimento atomicamente.
Envio: bloquear itens concorrentes, registrar destino e movimentações atomicamente; revisão explícita antes de confirmar.
Chip: confirmação da Arya obtida no servidor, vinculada ao ICCID exato e com validade; não aceitar `verified:true` enviado pelo navegador.

As credenciais das quatro bases/Arya serão segredos do servidor. A identidade Supabase não prova autorização nas plataformas externas.
SMS e Configurador mantêm seus auxiliares existentes até integração própria validada; não abrir portas ou expor o gateway local nesta etapa.

## Critérios de liberação

Migrações versionadas/revisadas, RLS testado por papéis, transações e idempotência comprovadas, backup/restauração testados, divergências de dados registradas, e confirmação de leitura após escrita.
Somente então planejar lote piloto de dados reais, reconciliação, período de transição e eventual aposentadoria do desktop.
