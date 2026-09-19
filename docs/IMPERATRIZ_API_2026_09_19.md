# Grupo RS Central — API de Imperatriz

Migração autorizada em 19/09/2026 para `https://imp.ogrupors.com.br/api_rest_app`.

## Comportamento e escopo

A API padrão passa ao novo host. A normalização reconhece as bases antigas `novogrupors.ddns.net/api_rest_app` e `fullprotect.newplataforma.com.br/api_rest_app`, inclusive variantes HTTP e links de documentação. O endereço efetivo é resolvido em memória; não é necessário editar o cofre ou o banco para migrar uma configuração antiga conhecida. Destinos personalizados e de outras filiais são preservados.

Somente a raiz REST muda. Endpoints, métodos, payloads, autenticação Bearer e paginação por metadados permanecem. As permissões e confirmações para operações continuam vigentes. Na primeira abertura da versão atualizada, sessão e caches de API começam vazios; a lógica existente de limpeza por troca de filial permanece.

Não alterar nesta entrega as URLs do portal web nem converter associado, registros e trajetos para REST. Esses serviços possuem contratos e campos próprios; o trajeto REST observado não contém todos os campos usados pela tela web atual. Não criar fallback silencioso para a API antiga.

## Verificação

- `tests/imperatriz_api_migration_test.gd`: URLs antigas/default, preservação de destinos regionais/personalizados/web, autenticação simulada e duas páginas por proximoSkip, sem regravar configurações.
- Regressões isoladas: `tests/reserve_stock_api_test.gd` e `tests/tracking_route_test.gd`.
- Execução: `tools/test_offline.ps1 -Tests @('tests/imperatriz_api_migration_test.gd','tests/reserve_stock_api_test.gd','tests/tracking_route_test.gd')`.
- Pré-verificação real no mesmo dia com perfil API do cofre operacional: login, sessão, listagem/detalhe/busca de equipamento, veículos e localização HTTP 200. Duas páginas distintas e formatos reconhecidos pelas funções atuais do Central. Cofre inalterado.
- Registros REST retornaram vazio nas amostras; trajeto REST retornou um ponto, com estrutura distinta. Esses resultados não justificam substituir os fluxos web.

Os três testes de código acima passaram. O EXE separado passou também em `package_contract_test.gd` e `imperatriz_api_migration_test.gd`, executados contra o pacote exportado em ambiente isolado. O contrato confere recursos obrigatórios e ausência de arquivos privados/testes no pacote.

POST/PATCH de cadastros, baixas, SMS e comandos não foram executados para validar esta migração. Aprovação de consultas não comprova operações reais de gravação.

## Entrega

Exportar separadamente e verificar `tests/package_contract_test.gd` e o teste da migração contra o pacote usando o executor isolado. Antes de substituir/reiniciar o aplicativo operacional, perguntar exatamente **posso atualizar agora?** e aguardar. Preservar executável anterior, cofre, dados e configurações. Não publicar executáveis ou dados operacionais no GitHub.
