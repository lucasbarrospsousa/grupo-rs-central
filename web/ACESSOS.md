# Acessos da Central

O administrador principal `lucasabm` administra os demais acessos em **Usuários e permissões**. Pode criar usuários, definir nova senha, ativar ou desativar e escolher os módulos de consulta e de alteração/execução. A própria conta principal é protegida nessa tela.

As permissões são verificadas na API, além da ocultação dos controles. Cada alteração de acesso encerra as sessões do usuário afetado. Senhas são armazenadas com hash scrypt e sal individual; nunca são exibidas. Ricardo foi provisionado somente para consulta, sem senha no código.

Todos os usuários possuem limite de duas horas de inatividade. A consulta automática dos equipamentos não renova esse prazo. Interações reais renovam a atividade, com envio limitado a uma vez a cada 30 segundos. O servidor também recusa sessões inativas; o prazo absoluto da sessão continua aplicável.

A autorização da hospedagem Sites é independente do login da Central. Em 25/09/2026, a configuração existente da hospedagem foi verificada como pública e preservada: a página de login pode ser aberta pelo endereço, mas os dados e as operações exigem autenticação e permissões na API.

Validação focada: testes `access-control.test.mjs` e `user-access.test.mjs`, mais verificações SQL/API isoladas de consulta, 24 recusas de mutação, expiração em dois usuários e cadastro/alteração/desativação de uma conta descartável. Nenhum aparelho operacional foi alterado nesses testes.
