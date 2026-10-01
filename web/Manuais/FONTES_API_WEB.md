# Fontes API e web — 01/10/2026

Configurações permite escolher API, web ou ambos separadamente para Imperatriz, Araguaína, Açailândia e Marabá. Estado persistido em read_sources, alterável somente pela administração com sessão e CSRF. Publicado no Site versão 56; backend publicado no painel Supabase. Quatro bases configuradas em ambos.

A seleção controla consultas Grupo RS de cadastro, associação, localização, titulares, veículos, manutenção e histórico. Chips usam as integrações das operadoras. Criação de placas, vínculos, SMS e demais escritas remotas preservam o fluxo existente e não são executadas pelo leitor web. A seleção aplica-se às próximas consultas e lotes. A automação já pausada continua pausada.

Em ambos, os dados ausentes são complementados após conferir série/veículo/placa e identidade. Divergências de identidade, múltiplos vínculos e limite de requisições não são ocultados por fallback. Valores zero são preservados. Telemetria de instantes diferentes não é mesclada. Nome repetido exige confirmação pelo código do titular e veículo. Não é possível garantir dados que nenhuma fonte retorne.

Leitor web: autenticação no servidor, cookies em memória, origem fixa por base (imp/arg/acl/mab.ogrupors.com.br), somente rotas de leitura permitidas após login, limites de transporte e orçamento compartilhado. Não usa navegador aberto do operador. Não registra cookies/senhas no frontend. Mudanças futuras no HTML podem exigir manutenção; respostas inválidas são falhas, não ausência de equipamentos.

Validação: 195 testes locais passaram; após proteção adicional, 11 testes focados de fontes passaram. Amostras reais nas quatro bases confirmaram associação/titular, cadastro, ICCID, telefone, APN, operadora, localização e bateria. Modo ambos confirmou titulares nas quatro bases sem aplicar baixas. Cadastro com nome duplicado em Marabá resolvido pelo código de titular. Manutenção web retornou lista com total conferido em Imperatriz. Histórico web consultado sem registros no intervalo de teste; resultado marcado parcial pois o endpoint não informa garantia de completude. Nenhum cadastro ou vínculo operacional foi alterado nos testes.

Migração: 024_read_sources.sql é aditiva e mantém API como padrão até escolha explícita. Reversão operacional: selecionar somente API na interface; não excluir tabela nem credenciais.
