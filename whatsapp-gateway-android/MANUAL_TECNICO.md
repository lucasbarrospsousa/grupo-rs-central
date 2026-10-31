# RS Gateway Mobile — manual técnico

## Identidade e função

Aplicativo Android do Gateway Mobile do Grupo RS Central. O pacote reúne os serviços existentes de WhatsApp e SMS. A versão 1.5.4 oferece seleção entre Grupo RS Central e Vendas SOS, login de plataforma com sessão cifrada pelo Android Keystore, preserva todos os cookies emitidos pelo login, usa o escopo `disparos` da SOS para os dois canais, apresenta diagnóstico seguro de conexão e filas com os dois serviços pausados e confirma WhatsApp somente após evidência de mensagem visível no aparelho.

## Navegação

- **Painel:** estado dos dois gateways e contagens locais resumidas, com ícone vetorial no padrão visual da Central.
- **WhatsApp:** estado do serviço e acessibilidade, contadores locais e atalho para as configurações de acessibilidade do Android.
- **SMS:** estado da conexão e histórico local agregado. O ícone da aba usa o mesmo arquivo WebP da navegação do site Central.
- **Geral:** bloqueio por PIN, opção para manter a tela acesa enquanto o painel está visível, autenticação opcional por impressão digital e todas as configurações do gateway SMS: permissões, bases, chip, serviço, execução com tela apagada, pareamento e autorização de envio real.

Os contadores não mostram destinatários, números ou conteúdo das mensagens. O histórico detalhado de WhatsApp continua na Central. O painel resume os estados disponíveis no banco local de SMS.

## Segurança e execução em segundo plano

Na primeira abertura, o titular cria um PIN numérico de 6 a 12 dígitos. O app guarda salt aleatório e derivação PBKDF2 do PIN nas preferências privadas. Ao sair da Activity, o painel volta à tela de acesso; conteúdo do app fica protegido contra captura de tela. A impressão digital é validada pelo `BiometricPrompt` do Android e só fica disponível quando o dispositivo possui sensor e digital cadastrada. O app não lê nem armazena dados biométricos.

A opção **Manter a tela sempre acesa** aplica `FLAG_KEEP_SCREEN_ON` enquanto o painel está em primeiro plano. Os serviços WhatsApp e SMS são independentes da Activity e não são parados pelo login; podem continuar no serviço foreground com a tela apagada. No WhatsApp, o envio automatizado continua dependente da acessibilidade e das limitações do Android/WhatsApp. No SMS, envio real continua condicionado às permissões, chip e autorização previamente configurados.

O PIN não é recuperável pelo servidor. Se for esquecido, limpar os dados do app permite criar outro PIN, mas também apaga configurações locais, tokens protegidos, histórico e contadores; configure novamente os gateways depois.

## Versão e verificação

- Versão anterior instalada: **1.5.4**, `versionCode` 11; package `br.com.sideracode.whatsappgateway`.
- A compilação 1.5.4 foi executada em cópia temporária isolada; o APK debug foi instalado preservando os dados locais. SHA-256: `A3B736A821B177D1ABA143FA7E88737065CBCF6AFBDA348AB4E5BCD439AB0593`.
- APK anterior: `C:/Users/lugan/Downloads/RS-Gateway-Mobile-1.5.4-debug.apk`.
- Telefone USB `2410FPCC5G`, Android API 36: painel e abas de disparos renderizados; gateways mantidos pausados. O login SOS foi repetido após reiniciar o app e aceita as credenciais, mas `/api/auth/me` ainda retorna `writes` vazio para `thaoemerson`; o cliente recusa corretamente o pareamento dos canais sem o escopo gravável `disparos`.
- Não foi feito envio real. O diagnóstico seguro está presente no app; a verificação ponta a ponta das filas e os envios ficam pendentes até o pareamento SOS ser autorizado pela permissão efetiva.

### Correção de estado e início do gateway WhatsApp — 1.5.5

- `versionCode` 12; o status agora distingue o serviço conectado do componente habilitado nas Configurações do Android, atualiza ao retornar ao app e não mostra “pendente” quando o Android ainda lista o componente habilitado.
- O início do gateway valida a sessão da plataforma e a conexão real do serviço de acessibilidade. Se faltar uma condição, explica o motivo e oferece abrir as Configurações; ao iniciar, confirma o estado ativo em vez de exibir sucesso imediato.
- Compilação `assembleDebug` offline bem-sucedida em cópia temporária isolada. Identidade conferida com `aapt`, assinatura com `apksigner` e alinhamento com `zipalign`. SHA-256 do APK: `561C1825BAE03C723153D4ADFF17529F6DF9E10C9561739AD149D6C4EA2E4297`.
- APK gerado em `C:/Users/lugan/Downloads/RS-Gateway-Mobile-1.5.5-debug.apk` e instalado após solicitação do usuário com `adb install -r`, preservando os dados locais. O Android confirmou `versionCode` 12 / `versionName` 1.5.5. O certificado do APK novo corresponde ao instalado anteriormente.
- Após a atualização, o Android mostrou o serviço de acessibilidade conectado e sem serviços encerrados. A substituição deixou o poller WhatsApp parado; ele não foi reiniciado para evitar retirar itens da fila sem uma solicitação explícita. Nenhum disparo foi feito.
- APK assinado para teste debug; não é distribuição de produção assinada por certificado de release.

## Limites

O contador local de WhatsApp registra resultados confirmados no aparelho após a instalação desta versão; não substitui o histórico de campanhas na Central. Este APK usa assinatura debug para teste e instalação direta, não é uma distribuição de produção assinada por certificado de release.
