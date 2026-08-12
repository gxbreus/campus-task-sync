# Campus Task Sync

Sincroniza eventos e pendencias do calendario do Campus Virtual com uma base de tarefas no Notion.

## Estado atual

O MVP ja possui:

- leitura da URL dinamica de calendario em formato ICS;
- conversao de eventos em tarefas normalizadas;
- sincronizacao idempotente pelo `UID` do evento;
- criacao, atualizacao e cancelamento no Notion;
- configuracao automatica de uma base estilizada no Notion;
- checkbox de conclusao e cores por disciplina;
- arquivamento visual: tarefas concluidas saem da tabela, do quadro e do calendario,
  ficando em `Arquivadas`, onde podem ser desmarcadas para voltar;
- consolidacao de eventos de abertura e encerramento em uma unica tarefa;
- alerta colorido conforme a proximidade do fechamento;
- atribuicao de novas tarefas ao usuario para notificacoes do Notion;
- nomes completos das disciplinas e titulo contextual nas notificacoes;
- link clicavel para o evento correspondente no calendario do Campus;
- consulta autenticada da atividade para obter abertura, prazo, enunciado, link direto e anexos;
- sugestao de resposta opcional pela OpenAI, com pesquisa web e leitura de anexos acessiveis;
- preservacao de tarefas marcadas manualmente como concluidas;
- modo local de validacao sem acesso ao Notion;
- execucao automatica a cada 30 minutos pelo GitHub Actions.

## Pre-requisitos

- Node.js 22 ou mais recente;
- uma URL dinamica de exportacao do calendario;
- para sincronizar, uma conexao do Notion e uma pagina compartilhada com ela.

## Base do Notion

O comando de configuracao cria automaticamente uma base com estas propriedades:

| Propriedade | Tipo | Valores esperados |
| --- | --- | --- |
| `Nome` | Titulo | — |
| `Concluida` | Checkbox | — |
| `Abertura` | Data | inicio da disponibilidade da atividade |
| `Informação da abertura` | Texto | informa quando o calendario nao fornece a data |
| `Prazo` | Data | — |
| `Alerta` | Selecao colorida | proximidade do fechamento |
| `Responsavel` | Pessoa | recebe notificacao quando uma nova tarefa e atribuida |
| `Disciplina` | Selecao colorida | uma opcao por disciplina |
| `Descricao` | Texto | — |
| `Sugestão de resposta` | Texto | rascunho gerado para revisao do estudante |
| `Link` | URL | — |
| `ID externo` | Texto | — |
| `Origem` | Selecao | `Campus Virtual` |
| `Situacao` | Selecao | `Pendente`, `Cancelada` |
| `Sincronizado em` | Data | — |

Crie somente uma pagina vazia, compartilhe-a com a conexao e configure
`NOTION_PARENT_PAGE_URL`. Depois execute:

```bash
npm run setup:notion
```

O comando cria a base, as propriedades, as cores por disciplina e as visoes de
quadro, calendario e pendencias. O `NOTION_DATA_SOURCE_ID` e salvo no `.env`.

Para criar ou atualizar o painel separado de controle de faltas, com oito
checkboxes por disciplina do semestre:

```bash
npm run setup:attendance
```

O painel mostra automaticamente o total de faltas, quantas restam e um alerta
visual quando o limite de oito dias estiver proximo.

Para criar ou atualizar o painel separado de datas importantes a partir dos
planos de ensino de 2026/2 e registrar as faltas planejadas da viagem de
12/10 a 24/10:

```bash
npm run setup:important-dates
```

As datas extraidas do cronograma sao tratadas como previsoes. O prazo oficial
publicado pelo professor no Campus Virtual continua sendo a referencia final.

## Materiais no Google Drive

O projeto tambem pode baixar os anexos visiveis das disciplinas no Campus e
organiza-los no Google Drive desta forma:

```text
Campus Virtual - 2026.2/
  GCC128 - Inteligencia Artificial/
    Guia de avaliacoes.md
    Links dos materiais.md
    Aprendizado de Maquina/
      aula-knn.pdf
```

O guia de cada disciplina lista as avaliacoes, os conteudos previstos e os
alertas encontrados nos planos de ensino. Os arquivos sao identificados pela
origem e pelo conteudo, portanto uma nova execucao atualiza o que mudou sem
criar copias duplicadas.

Materiais cadastrados pelo professor como paginas, videos ou URLs externas sao
registrados em `Links dos materiais.md`; apenas arquivos internos do Campus sao
baixados diretamente.

Para autorizar:

1. Crie um projeto no Google Cloud e habilite a **Google Drive API**.
2. Configure a tela de consentimento OAuth e adicione sua conta como usuario de teste.
3. Crie um cliente OAuth do tipo **Aplicativo para computador**.
4. Baixe o JSON e salve na raiz do projeto como `.google-drive-credentials.json`.
5. Execute `npm run setup:drive` e aceite o acesso no navegador.

O projeto solicita somente o escopo `drive.file`, limitado aos arquivos que o
proprio aplicativo cria. A autorizacao permanente fica em
`.google-drive-token.json`; ambos os arquivos estao ignorados pelo Git.

Depois, execute a sincronizacao com:

```bash
npm run sync:drive
```

Para automacao no GitHub Actions, configure `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` e, opcionalmente,
`GOOGLE_DRIVE_ROOT_FOLDER_ID` como secrets. Quando esses valores estiverem
presentes, o mesmo agendamento de 30 minutos tambem atualiza os materiais.

## Configuracao local

```bash
npm install
cp .env.example .env
```

Preencha o `.env`. A URL do calendario e o token do Notion sao segredos e nunca devem ser commitados.

Para obter localmente um token da API oficial do Moodle, sem armazenar a senha:

```bash
npm run setup:moodle
```

O comando envia as credenciais diretamente ao Campus Virtual, valida o token e
salva somente `MOODLE_TOKEN` no `.env` com permissao restrita.

Para apenas conferir o que o Campus Virtual retorna:

```bash
npm run sync:dry
```

Para sincronizar com o Notion:

```bash
npm run sync
```

## Automacao no GitHub

Cadastre estes *Actions secrets* no repositorio:

- `CALENDAR_ICS_URL`
- `NOTION_TOKEN`
- `NOTION_DATA_SOURCE_ID`
- `NOTION_ASSIGNEE_USER_ID`
- `MOODLE_TOKEN`
- `OPENAI_API_KEY` (opcional, necessario para gerar respostas)

Cadastre `OPENAI_MODEL` e `ENABLE_AI_SUGGESTIONS` como *Actions variables*. A IA
permanece desativada enquanto `ENABLE_AI_SUGGESTIONS` nao for `true`. O valor
padrao recomendado para o modelo e `gpt-5.6-terra`.

O workflow tambem pode ser executado manualmente na aba **Actions**. A automacao agendada so comeca a funcionar depois de estar na branch padrao do repositorio.

Novas tarefas sao atribuidas ao usuario definido em `NOTION_ASSIGNEE_USER_ID`.
No aplicativo do Notion, habilite as notificacoes em **Configuracoes → Minhas
notificacoes → Notificacoes push no celular**. Tarefas que ja existiam antes da
configuracao nao geram um novo aviso retroativo.

## Sugestao de resposta por IA

Quando `ENABLE_AI_SUGGESTIONS=true` e `OPENAI_API_KEY` esta configurada, a
sincronizacao gera uma resposta apenas
para tarefas pendentes cuja coluna `Sugestão de resposta` ainda esteja vazia. O
prompt assume um estudante de Sistemas de Informacao no 7o periodo e pede texto
natural, claro e com menos jargao. A resposta e um rascunho para revisao, nao uma
entrega automatica.

A IA pode pesquisar na web e recebe anexos cujos links publicos estejam presentes
no calendario. Se o enunciado mencionar um anexo que o arquivo ICS nao disponibiliza,
o sistema orienta o modelo a declarar a limitacao em vez de inventar o conteudo.

## Desenvolvimento

```bash
npm run check
npm run build
```

O nucleo usa a interface `TaskDestination`, permitindo adicionar Google Tasks, Todoist ou uma aplicacao propria sem alterar o leitor do Campus.
