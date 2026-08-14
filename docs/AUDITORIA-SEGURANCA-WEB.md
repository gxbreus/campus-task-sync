# Auditoria de segurança do beta web

Data da revisão: 14 de agosto de 2026.

Este documento registra uma autoauditoria técnica do projeto. Ele não substitui
uma certificação independente nem garante ausência absoluta de vulnerabilidades.

## Fluxo de dados atual

- a senha institucional sai do navegador diretamente para
  `campusvirtual.ufla.br` por HTTPS;
- a aplicação não envia a senha para sua API e não a registra em logs;
- a URL do calendário chega à API apenas para validação e não é persistida;
- o beta não usa armazenamento acessível por JavaScript no navegador;
- a instalação usa apenas um cookie aleatório `HttpOnly`, `Secure` e
  `SameSite=Lax`, cujo hash é associado aos dados no banco;
- tokens do Notion são cifrados com AES-256-GCM antes de chegar ao Supabase;
- o token emitido pelo Campus ainda é validado e descartado pela interface;
- não existem analytics, anúncios ou scripts de rastreamento.

## Proteções verificadas

- domínio, HTTPS, porta, credenciais embutidas e caminho do calendário são
  validados antes de qualquer consulta;
- redirecionamentos externos são bloqueados;
- corpo de entrada e calendário possuem limites de tamanho;
- a consulta ao Campus possui limite de tempo e não usa cache;
- falhas internas são substituídas por mensagens genéricas, sem devolver tokens;
- requisições de origem externa pelo navegador são rejeitadas;
- CSP restringe scripts, conexões, formulários, objetos e enquadramento;
- headers adicionais bloqueiam clickjacking, MIME sniffing, referência externa e
  acesso a câmera, microfone, geolocalização, pagamentos e USB;
- dependências não apresentam vulnerabilidades conhecidas no `npm audit`;
- assinaturas das dependências instaladas foram verificadas pelo npm;
- o GitHub não apresenta alertas abertos do secret scanning ou Dependabot;
- arquivos locais de credenciais estão ignorados pelo Git e com permissão `600`.

## Teste móvel

O Chrome foi executado com emulação de tela de 390 por 844 pixels e toque
habilitado. O teste confirmou ausência de rolagem horizontal, ausência de
ausência de armazenamento acessível por JavaScript e alvos interativos de pelo
menos 44 pixels. Os campos
usam fonte de 16 pixels no celular para evitar zoom automático no iOS.

## Limitações e próximos controles

- a CSP ainda permite estilos e scripts inline exigidos pela renderização atual
  do Next.js; origens externas continuam bloqueadas;
- o OAuth do Notion depende das chaves e da migração do Supabase configuradas no
  ambiente de produção;
- a persistência do calendário/Moodle e a sincronização automática ainda não
  estão ativas;
- antes de abrir o sincronizador, são necessários testes adicionais de
  isolamento entre instalações, revogação e rotação da chave de criptografia;
- deve ser publicada na Vercel uma regra de rate limit para
  `POST /api/calendar/validate` antes de divulgar o beta amplamente;
- uma revisão externa continua recomendada antes de tratar o sistema como
  serviço de produção.
