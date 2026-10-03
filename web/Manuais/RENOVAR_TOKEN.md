# Token de publicação
Configurações > Renovar token de publicação. Somente o administrador principal, com confirmação de senha.
A API valida acesso às funções e segredos do projeto vwiayytzmorcjeaszowg antes de substituir a credencial. Configure Edge Functions e Edge Function Secrets em Read-write; a consulta de validação não comprova a permissão de escrita antecipadamente.
Armazenamento AES-GCM vinculado ao projeto na tabela privada deployment_credential, com chave derivada do segredo da ponte. Respostas ao navegador contêm somente estado e data.
deploy-edge, deploy-backup-worker e activate-backups usam a credencial renovada do banco e atualizam o arquivo local protegido. Falhas de consulta não usam silenciosamente uma credencial antiga.
Não há publicação automática ao salvar. O token de implantação não substitui os acessos das bases nem das operadoras.
