# Padrão visual da Central web

Todas as abas e novos componentes devem seguir `public/design-system.css`, carregado depois dos estilos funcionais. O cabeçalho comum é montado por `public/design-system.js`, preservando os controles e seus eventos.

- Fonte única: Segoe UI, com Arial como alternativa.
- Títulos de página: 30 px, peso 700; seções: 20 px; texto e controles: 14 px.
- Fundo cinza claro; superfícies brancas; texto azul-escuro; borda discreta e raio de 16 px.
- Cards de indicadores: mesma altura mínima, números de 32 px e ícone no canto superior direito. Cores indicam situação, sem mudar a estrutura.
- Botões e campos: altura mínima de 42 px, raio de 10 px. Ações de tabela podem ser compactas; foco de teclado sempre visível.
- Conteúdo: margem interna de 32 px no desktop, 14 px no celular; espaçamento comum entre blocos de 20 px.
- Tabelas mantêm rolagem interna quando necessário. Menu recolhível; grades adaptadas à largura disponível.
- Janelas: mesmo título, bordas, controles e espaçamento. Não remover estados de erro, carregamento ou bloqueio.

Não adicionar novas fontes, sombras, gradientes ou medidas independentes por aba. Alterar a base compartilhada quando a necessidade for global. Manter particularidades funcionais de mapas, tabelas e formulários.

Validação: navegar pelas abas, abrir uma janela, conferir menu e seleção de filial; verificar desktop e celular. Dados demonstrativos são apenas fixtures visuais, não prova de integração com APIs.

## Estoque compacto
A superfície de estoque usa a variante densa em stock-compact.css: cabeçalho de 58 px, ações de 36 px e linhas compactas. No desktop a página ocupa a janela; a tabela mantém rolagem interna e paginação visível. Conectividade vem após Série. Período fica em Filtros e consultas em Integrações. No celular o conteúdo pode rolar normalmente.
Paginação deve usar seletores locais e atributos próprios. A identificação da tela usa data-view; nunca capturar cliques da página inteira como troca de página.
