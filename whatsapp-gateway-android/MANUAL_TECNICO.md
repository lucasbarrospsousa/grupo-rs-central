# RS Gateway Mobile — manual técnico

## Identidade e função

Aplicativo Android do Gateway Mobile do Grupo RS Central. O pacote reúne os serviços existentes de WhatsApp e SMS. A versão 1.4.0 aplica os ícones oficiais usados pela Central e reúne a operação do gateway SMS na aba Geral.

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

- Versão: **1.4.0**, `versionCode` 6; package `br.com.sideracode.whatsappgateway`.
- Compilação Android Gradle offline, em cópia temporária isolada: `assembleDebug` concluído.
- QA visual realizado no telefone USB `2410FPCC5G`, Android API 36, em variante isolada `.qa`: Painel, WhatsApp, SMS, Geral e opções migradas do gateway. Nenhum gateway foi iniciado durante o QA.
- APK **debug** 1.4.0 instalado sobre a versão 1.3.0 sem apagar os dados do aplicativo.
- APK de entrega local: `C:/Users/lugan/Downloads/RS-Gateway-Mobile-1.4.0-debug.apk`.

## Limites

O contador local de WhatsApp registra resultados confirmados no aparelho após a instalação desta versão; não substitui o histórico de campanhas na Central. Este APK usa assinatura debug para teste e instalação direta, não é uma distribuição de produção assinada por certificado de release.
