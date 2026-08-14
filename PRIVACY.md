# Privacidade e segurança

O Campus Task Sync pode ser executado no computador ou no repositório GitHub do
próprio usuário. O beta web também possui uma interface hospedada na Vercel. No
uso local, o mantenedor não recebe automaticamente credenciais, tarefas ou
materiais de quem clona ou cria um fork.

## Beta web atual

Na etapa atual, o beta web não possui banco de dados, cadastro de usuário ou
rotina de sincronização em segundo plano. O código da aplicação não grava
cookies, `localStorage`, `sessionStorage` ou IndexedDB. Recarregar a página
descarta o andamento da configuração.

A senha institucional é enviada pelo navegador diretamente ao endereço HTTPS
oficial do Campus Virtual. Ela não passa pela Vercel nem pela API do Campus Task
Sync. Depois da validação, usuário, senha e token são removidos do estado da
página.

A URL privada do calendário passa temporariamente pela rota de validação da
aplicação, pois o Campus não permite que o navegador consulte diretamente essa
exportação. A aplicação confere domínio e caminho, limita tamanho e tempo da
requisição, não segue redirecionamentos e não registra o conteúdo ou a URL em
logs próprios. A Vercel e o Campus Virtual ainda processam metadados técnicos de
rede conforme as políticas de cada serviço.

## Automação web futura

Uma sincronização automática não é possível sem persistir as credenciais que
permitem consultar o Campus e atualizar o Notion. Antes de ativar essa etapa, o
beta informará claramente quais dados serão guardados e pedirá autorização. A
arquitetura prevista armazena apenas identificadores e tokens necessários,
criptografados com AES-256-GCM; nunca a senha institucional nem o conteúdo
integral das atividades.

## Dados utilizados

- **Campus Virtual:** a URL privada do calendário e, opcionalmente, o token do
  Moodle permitem ler disciplinas, atividades, prazos, enunciados e materiais.
- **Notion:** recebe as informações das tarefas, disciplinas, datas, links e os
  controles criados pelo sistema.
- **Google Drive:** recebe os materiais acadêmicos quando essa integração é
  ativada. O escopo `drive.file` limita o aplicativo aos arquivos e pastas que
  ele próprio cria ou abre.
- **OpenAI:** quando as sugestões por IA são ativadas, recebe o nome da
  disciplina, o enunciado e possíveis links de anexos. Essa integração é
  opcional e permanece desligada por padrão.
- **Grade UFLA:** recebe apenas consultas aos dados públicos das matrizes; tokens
  pessoais não são enviados a esse serviço.

O projeto não salva a senha institucional. No comando `setup:moodle`, ela é
enviada por HTTPS diretamente ao domínio oficial `campusvirtual.ufla.br` para
obter o token e depois é descartada. O programa rejeita outros domínios antes de
transmitir a credencial.

## Onde ficam as credenciais

No uso local, as credenciais ficam no `.env` e nos arquivos locais do Google,
que são ignorados pelo Git e recebem permissão restrita. Na automação, ficam em
GitHub Actions Secrets do repositório de cada usuário. Secrets não são copiados
para forks e não devem ser colocados em issues, logs, capturas de tela ou commits.

A URL exportada do calendário também funciona como uma credencial. Quem tiver
essa URL poderá consultar os eventos enquanto ela continuar válida.

## Confiança nas atualizações

Qualquer programa executado com acesso ao `.env` ou aos GitHub Actions Secrets
pode, tecnicamente, ler essas credenciais. Por isso, revise mudanças antes de
atualizar seu clone ou incorporar contribuições, principalmente alterações em
workflows, dependências e integrações externas. Baixe o projeto apenas do
repositório oficial ou de uma fonte em que você confie.

Contribuições externas são testadas sem receber os secrets do mantenedor. Depois
de uma alteração ser incorporada, o código aprovado poderá executar na automação
normal e terá somente os secrets necessários para cada etapa.

## Materiais acadêmicos

Materiais de professores podem conter dados pessoais ou conteúdo protegido por
direitos autorais. Mantenha as pastas do Notion e Drive privadas e não redistribua
arquivos sem autorização. Antes de publicar logs de `npm run sync:dry`, remova
nomes, enunciados e links privados.

## Revogar ou apagar acessos

- gere uma nova URL de calendário ou revogue a exportação no Campus;
- revogue o token do Moodle nas preferências de segurança do Campus;
- remova a conexão na página do Notion e revogue a integração;
- revogue o acesso do aplicativo na Conta Google;
- apague os secrets em **Settings → Secrets and variables → Actions**;
- remova `.env`, `.google-drive-credentials.json` e
  `.google-drive-token.json` do computador quando não forem mais necessários.

Se uma credencial for publicada, considere-a comprometida e revogue-a
imediatamente. Não basta apenas apagar o commit.

## Relatar uma vulnerabilidade

Não publique uma issue com credenciais ou dados pessoais. Use o relato privado
em **Security → Report a vulnerability** no GitHub.
