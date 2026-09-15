# Grupo RS Central — manual técnico
Empresa: Sinderacode. Identificador: `central`.
Função: Aplicativo operacional do Grupo RS Central, incluindo estoque e integrações.
Raiz: `C:/Users/lugan/OneDrive/Documentos/Sidera Code/Grupo RS Central/app`.
Esta pasta é a fonte deste projeto; não usar o diretório de outro aplicativo por padrão.

## Comandos PowerShell
```powershell
& 'C:/Users/lugan/OneDrive/Documentos/Sidera Code/Ferramentas Compartilhadas/Scripts/projeto.ps1' -Projeto central -Acao Info
& 'C:/Users/lugan/OneDrive/Documentos/Sidera Code/Ferramentas Compartilhadas/Scripts/projeto.ps1' -Projeto central -Acao Rapido
& 'C:/Users/lugan/OneDrive/Documentos/Sidera Code/Ferramentas Compartilhadas/Scripts/projeto.ps1' -Projeto central -Acao Exportar
```
- Info identifica o projeto e mostra este manual.
- Rapido só verifica estrutura, cena principal, documentos, Godot e preset. Não inicia o aplicativo nem valida lógica.
- Exportar usa Godot 4.7.1 e Windows Desktop, gerando EXE em uma nova subpasta build/validacao-*; não substitui executável operacional nem publica.
- Para executar em desenvolvimento, abrir esta pasta no Godot e executar a cena principal definida em project.godot. Nos aplicativos operacionais, isso pode acessar serviços reais: só executar quando estiver no escopo.
- Instalador: não foi identificado/validado um fluxo comum de instalador. EXE exportado não equivale a instalador. Inspecionar scripts específicos antes de distribuir.

## Testes proporcionais

### Versão 4.2.2

Mapa Grande e o painel Grupo RS online foram retirados. A consulta individual,
estoque e operações explícitas permanecem. Escopo, isolamento, seleção de testes
e cuidados com exportação: `docs/retirada_mapa_online_4_2_2.md`.

Exemplo de teste offline revisado:

```powershell
& ./tools/test_offline.ps1 -Tests @('tests/main_scene_smoke_test.gd','tests/feature_retirement_test.gd')
```

Use `-Rendered` para capturas sintéticas das quatro filiais. Os arquivos ficam
no diretório temporário informado pelo executor, fora dos dados operacionais.

## Revisão com GitHub Desktop

O comando compartilhado também aceita `-Acao GitStatus` (consulta) e `-Acao Desktop` (abre a raiz Git correta). Utilizar o mesmo identificador deste manual. Se não existir repositório, o comando interrompe sem criar nem publicar. Política e pendências: `C:/Users/lugan/OneDrive/Documentos/Sidera Code/GITHUB_DESKTOP.md`.

### Seleção dos testes
Primeiro Rapido; depois testes da área alterada, previamente inspecionados e isolados. Não executar todos os arquivos de tests automaticamente.
Godot permite executar scripts com `--headless --path "<raiz>" --script "<teste.gd>"`, mas o teste deve ser compatível com headless e não gravar em sistemas reais.
Mudanças visuais requerem execução renderizada. Antes de entrega, testar regressões afetadas e a exportação quando aplicável.
Nenhuma suíte funcional foi aprovada como offline nesta padronização; selecionar e revisar antes de executar.

## Limites
Não alterar estoque, vínculos, cofre, banco de dados ou serviços externos sem autorização específica. Testes de descarga/cadastro não são testes rápidos seguros.
Preservar alterações existentes. Não excluir builds, caches ou dados para liberar RAM. Não publicar no GitHub nem substituir o EXE operacional sem pedido.
Consultar a política em `C:/Users/lugan/OneDrive/Documentos/Sidera Code/AGENTS.md`. Reservar conversa e pasta para este projeto; se a tarefa estiver associada a outro projeto, sinalizar e usar sempre a raiz explícita. Não mover conversas/pastas automaticamente.
