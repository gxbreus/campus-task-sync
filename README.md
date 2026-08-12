# Campus Task Sync

Sincroniza as pendências do calendário do Campus Virtual da UFLA com um painel
no Notion. Opcionalmente, consulta os detalhes das atividades no Moodle,
organiza materiais no Google Drive e executa tudo automaticamente pelo GitHub
Actions.

## O que o projeto faz

- lê a URL dinâmica do calendário do Campus Virtual;
- cria e atualiza tarefas no Notion sem duplicação;
- une eventos de abertura e encerramento da mesma atividade;
- consulta abertura, prazo, enunciado, link e anexos pela API do Moodle;
- separa as tarefas por disciplina e mostra alertas de prazo;
- retira tarefas concluídas das visões ativas e as mantém em `Arquivadas`;
- permite desarquivar uma tarefa desmarcando `Concluída`;
- envia notificações do Notion para novas tarefas atribuídas;
- pode organizar PDFs, slides e links do Campus no Google Drive;
- pode rodar automaticamente a cada 30 minutos pelo GitHub Actions;
- oferece, opcionalmente, sugestões de resposta usando uma API da OpenAI.

## Antes de começar

Cada usuário precisa configurar as próprias contas. Clonar o repositório não
fornece acesso ao calendário, Campus, Notion ou Drive de outra pessoa.

Você precisará de:

- Git;
- Node.js 22 ou mais recente;
- uma conta no Campus Virtual da UFLA;
- uma conta no Notion;
- uma página vazia no Notion para receber os painéis;
- Google Drive somente se quiser sincronizar os materiais.

Nunca envie seu `.env`, token do Notion, URL do calendário, token do Moodle ou
credenciais do Google para outra pessoa. Esses arquivos já estão ignorados pelo
Git.

## Instalação rápida: Campus para Notion

Este é o fluxo mínimo recomendado para um novo usuário.

### 1. Clonar e instalar

```bash
git clone https://github.com/gxbreus/campus-task-sync.git
cd campus-task-sync
npm install
cp .env.example .env
```

No Windows PowerShell, se `cp` não estiver disponível, use:

```powershell
Copy-Item .env.example .env
```

### 2. Obter a URL dinâmica do calendário

No Campus Virtual:

1. Abra o calendário.
2. Selecione **Exportar calendário**.
3. Em **Eventos a exportar**, marque **Todos os eventos**.
4. Em **Período**, marque **Recente e próximos 60 dias**. Se quiser enxergar o
   semestre inteiro de uma vez, use um intervalo personalizado que cubra todo o
   semestre.
5. Clique em **Obter URL do calendário**.
6. Copie a URL gerada, não o arquivo `.ics` de backup.

A URL é dinâmica: eventos novos, alterados ou removidos no Campus serão
refletidos nas sincronizações seguintes. Cole-a no `.env`:

```dotenv
CALENDAR_ICS_URL=https://campusvirtual.ufla.br/.../export_execute.php?...
```

Essa URL é privada e funciona como uma credencial.

### 3. Criar a conexão do Notion

1. Abra o [painel de integrações do Notion](https://www.notion.so/profile/integrations).
2. Crie uma **integração interna** no seu workspace.
3. Habilite leitura, inserção e atualização de conteúdo.
4. Copie o **token de acesso da integração**.
5. No Notion, crie uma página vazia, por exemplo `Campus Task Sync`.
6. Na página, abra o menu `•••` → **Conexões** → **Adicionar conexão** e escolha
   a integração criada. Não é necessário liberar a página publicamente nem
   permitir edição para “qualquer pessoa com o link”.
7. Copie a URL da página.

Preencha no `.env`:

```dotenv
NOTION_TOKEN=secret_...
NOTION_PARENT_PAGE_URL=https://www.notion.so/Campus-Task-Sync-...
```

### 4. Configurar o token do Moodle

O calendário sozinho já permite criar tarefas. O token do Moodle acrescenta as
datas reais da atividade, enunciado, link direto e anexos.

Execute:

```bash
npm run setup:moodle
```

Informe seu usuário institucional e senha. A senha não é exibida nem salva; o
comando salva somente o `MOODLE_TOKEN` no `.env` e restringe as permissões do
arquivo.

### 5. Conferir antes de escrever no Notion

```bash
npm run sync:dry
```

O comando mostra as tarefas encontradas sem alterar o Notion. Se o semestre
ainda estiver começando, o resultado pode estar vazio.

### 6. Criar o painel do Notion

```bash
npm run setup:notion
```

O comando cria a base e salva automaticamente `NOTION_DATA_SOURCE_ID` no
`.env`. Ele também configura:

- tabela principal de tarefas ativas;
- board `Por disciplina`;
- calendário;
- lista `Pendentes`;
- lista `Arquivadas`;
- cores por disciplina;
- responsável para notificações, quando a conexão encontra um único usuário.

### 7. Fazer a primeira sincronização

```bash
npm run sync
```

Pronto. Para uma instalação local, execute esse comando sempre que quiser
atualizar o Notion. Para não depender do computador ligado, configure o GitHub
Actions conforme a seção de automação.

## Como usar o painel

As tarefas têm disciplina, abertura, prazo, alerta, descrição e link para o
Campus. Ao marcar `Concluída`, a tarefa:

- desaparece da tabela, board, calendário e lista de pendências;
- continua disponível em `Arquivadas`;
- volta às visões ativas se `Concluída` for desmarcada em `Arquivadas`.

No celular, habilite **Configurações → Minhas notificações → Notificações push**
no aplicativo do Notion. Tarefas antigas não geram avisos retroativos.

## Controle de faltas

Com `MOODLE_TOKEN`, `NOTION_TOKEN` e `NOTION_PARENT_PAGE_URL` configurados,
execute:

```bash
npm run setup:attendance
```

O comando identifica as disciplinas do semestre e cria uma linha por matéria,
com oito checkboxes, total de faltas, quantidade restante e alerta visual.
Executá-lo novamente não duplica disciplinas.

## Datas importantes e planos de ensino

O comando abaixo **não é genérico neste momento**:

```bash
npm run setup:important-dates
```

Ele contém os planos de ensino de GCC128, GCC175 e GCC220 de 2026/2 e as datas
de uma viagem específica do autor do projeto. Outro usuário não deve executá-lo
sem antes substituir os dados em `src/plans/semester-2026-2.ts` pelos próprios
planos, avaliações e ausências planejadas.

As datas dos planos são tratadas como previsões. O prazo publicado no Campus
Virtual continua sendo a referência final.

## Materiais no Google Drive

Este recurso é opcional. Ele organiza o conteúdo assim:

```text
Campus Virtual - 2026.2/
  GCC128 - Inteligencia Artificial/
    Guia de avaliacoes.md
    Links dos materiais.md
    Aprendizado de Maquina/
      aula-knn.pdf
```

Arquivos internos são baixados. Vídeos, páginas e URLs externas são registrados
em `Links dos materiais.md`. O sistema usa identificadores e hashes para
atualizar alterações sem criar cópias duplicadas.

### Autorizar o Google Drive

1. Crie um projeto no [Google Cloud Console](https://console.cloud.google.com/).
2. Habilite a **Google Drive API**.
3. Em **Google Auth Platform**, configure a tela de consentimento.
4. Se o aplicativo estiver em teste, adicione o e-mail que fará login em
   **Público-alvo → Usuários de teste**.
5. Crie um cliente OAuth do tipo **Aplicativo para computador**.
6. Confirme que `npm run setup:moodle` já foi executado; o comando usa o Moodle
   para nomear a pasta com o semestre atual.
7. Baixe o JSON e salve na raiz do projeto com o nome exato
   `.google-drive-credentials.json`.
8. Execute:

```bash
npm run setup:drive
```

Aceite a autorização no navegador. O projeto solicita o escopo `drive.file`,
limitado aos arquivos e pastas criados pelo próprio aplicativo. O token fica em
`.google-drive-token.json`; os dois arquivos do Google estão ignorados pelo Git.

Para sincronizar:

```bash
npm run sync:drive
```

O resultado informa quantos materiais foram criados, atualizados, mantidos ou
ignorados por falha.

### Usar os arquivos no NotebookLM

Crie um notebook por disciplina e escolha **Adicionar fonte → Google Drive**.
Selecione o `Guia de avaliações.md` e os PDFs ou slides relevantes. Quando um
arquivo do Drive mudar, confira a opção de sincronizar a fonte dentro do
NotebookLM. O projeto não controla o NotebookLM diretamente.

## Automação pelo GitHub Actions

O workflow em `.github/workflows/sync.yml` executa a cada 30 minutos e também
pode ser iniciado manualmente na aba **Actions**.

Para cada pessoa ter sua própria automação:

1. Faça um **fork** deste repositório ou crie um repositório próprio com o código.
2. Confirme que o workflow está na branch padrão, normalmente `main`.
3. Abra **Settings → Secrets and variables → Actions**.
4. Cadastre os secrets abaixo.

Obrigatórios para Campus → Notion:

| Secret | Origem |
| --- | --- |
| `CALENDAR_ICS_URL` | URL dinâmica do calendário |
| `NOTION_TOKEN` | token da integração interna |
| `NOTION_DATA_SOURCE_ID` | gerado por `npm run setup:notion` |

Recomendado para obter detalhes das atividades:

| Secret | Origem |
| --- | --- |
| `MOODLE_TOKEN` | salvo por `npm run setup:moodle` |

Opcional para notificações por atribuição:

| Secret | Origem |
| --- | --- |
| `NOTION_ASSIGNEE_USER_ID` | salvo no `.env` pelo setup, quando disponível |

Opcionais para o Drive:

| Secret | Origem |
| --- | --- |
| `GOOGLE_CLIENT_ID` | JSON do cliente OAuth |
| `GOOGLE_CLIENT_SECRET` | JSON do cliente OAuth |
| `GOOGLE_REFRESH_TOKEN` | `.google-drive-token.json` |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | ID da pasta retornado por `setup:drive` |

Opcional para sugestões por IA:

- secret `OPENAI_API_KEY`;
- variable `ENABLE_AI_SUGGESTIONS=true`;
- variable `OPENAI_MODEL`, cujo padrão é [`gpt-5.6-terra`](https://developers.openai.com/api/docs/models).

Cada fork precisa dos próprios secrets. Secrets do repositório original não são
copiados nem disponibilizados para forks.

## Variáveis do `.env`

| Variável | Obrigatória | Finalidade |
| --- | --- | --- |
| `CALENDAR_ICS_URL` | sim | leitura do calendário |
| `MOODLE_TOKEN` | recomendada | detalhes e materiais das atividades |
| `NOTION_TOKEN` | para Notion | autenticação da integração |
| `NOTION_PARENT_PAGE_URL` | para setup | página onde os painéis serão criados |
| `NOTION_DATA_SOURCE_ID` | para sync | base criada pelo setup |
| `NOTION_ASSIGNEE_USER_ID` | não | notificações por atribuição |
| `GOOGLE_DRIVE_CREDENTIALS_PATH` | não | caminho do JSON OAuth local |
| `GOOGLE_DRIVE_TOKEN_PATH` | não | caminho do token OAuth local |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | não | reaproveita uma pasta específica |
| `OPENAI_API_KEY` | não | sugestões de resposta |
| `ENABLE_AI_SUGGESTIONS` | não | ativa as sugestões quando `true` |
| `OPENAI_MODEL` | não | modelo usado nas sugestões |

Use `.env.example` como modelo. Não preencha nem comite `.env.example` com dados
reais.

## Comandos disponíveis

| Comando | Ação |
| --- | --- |
| `npm run setup:moodle` | obtém e salva o token do Moodle |
| `npm run sync:dry` | lista tarefas sem escrever no Notion |
| `npm run setup:notion` | cria ou atualiza o painel de tarefas |
| `npm run sync` | sincroniza Campus → Notion |
| `npm run setup:attendance` | cria ou atualiza o controle de faltas |
| `npm run setup:important-dates` | importa a personalização de planos de 2026/2 |
| `npm run setup:drive` | autoriza o Google Drive |
| `npm run sync:drive` | sincroniza materiais com o Drive |
| `npm run check` | executa tipagem e testes |
| `npm run build` | compila o projeto |

## Problemas comuns

### `Variavel obrigatoria ausente`

Confira se `.env` existe na raiz e se a variável indicada está preenchida sem
aspas extras.

### O calendário não retorna tarefas

O semestre pode ainda não ter eventos. Confirme também que foi usada a URL
dinâmica, que o período exportado inclui as datas desejadas e que a URL não
expirou.

### `Falha na configuracao do Notion` ou objeto não encontrado

Confirme o token, a URL da página e principalmente se a página foi adicionada à
conexão do Notion. Tornar a página pública não substitui essa permissão.

### Disciplina com vírgula

O Notion não permite vírgulas em opções de `select`. O sistema troca somente o
rótulo visual por `·` e preserva o nome original no título da tarefa.

### `Acesso bloqueado` ou erro 403 no Google

Em **Google Auth Platform → Público-alvo**, adicione o e-mail usado no login à
lista de usuários de teste e execute `npm run setup:drive` novamente.

### Uma tarefa concluída continua aparecendo

Execute `npm run setup:notion` para reaplicar os filtros. As visões ativas
mostram `Concluída = false`; `Arquivadas` mostra `Concluída = true`.

### A automação não executa

Confirme que o workflow está na branch padrão, que GitHub Actions está habilitado
e que todos os secrets obrigatórios foram cadastrados. Em forks, workflows
agendados podem precisar ser habilitados manualmente na aba **Actions**.

## Sugestões de resposta por IA

Esse recurso é opcional e não é usado pelo restante do sistema. Ele exige
créditos próprios da API da OpenAI; uma assinatura ChatGPT Plus ou o limite do
Codex não substituem os créditos da API.

Quando `ENABLE_AI_SUGGESTIONS=true` e `OPENAI_API_KEY` está preenchida, o sistema
gera um rascunho somente para tarefas pendentes cuja coluna de sugestão esteja
vazia. O texto deve ser revisado antes de qualquer entrega acadêmica.

## Desenvolvimento

```bash
npm run check
npm run build
```

O núcleo usa a interface `TaskDestination`, permitindo adicionar outro
gerenciador de tarefas sem alterar o leitor do Campus.
