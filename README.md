# Campus Task Sync

Sincroniza eventos e pendencias do calendario do Campus Virtual com uma base de tarefas no Notion.

## Estado atual

O MVP ja possui:

- leitura da URL dinamica de calendario em formato ICS;
- conversao de eventos em tarefas normalizadas;
- sincronizacao idempotente pelo `UID` do evento;
- criacao, atualizacao e cancelamento no Notion;
- preservacao de tarefas marcadas manualmente como concluidas;
- modo local de validacao sem acesso ao Notion;
- execucao automatica a cada 30 minutos pelo GitHub Actions.

## Pre-requisitos

- Node.js 22 ou mais recente;
- uma URL dinamica de exportacao do calendario;
- para sincronizar, uma conexao do Notion e uma base compartilhada com ela.

## Base do Notion

Crie uma base com exatamente estas propriedades:

| Propriedade | Tipo | Valores esperados |
| --- | --- | --- |
| `Nome` | Titulo | — |
| `Prazo` | Data | — |
| `Disciplina` | Texto | — |
| `Descricao` | Texto | — |
| `Link` | URL | — |
| `ID externo` | Texto | — |
| `Origem` | Selecao | `Campus Virtual` |
| `Situacao` | Selecao | `Pendente`, `Concluida`, `Cancelada` |
| `Sincronizado em` | Data | — |

## Configuracao local

```bash
npm install
cp .env.example .env
```

Preencha o `.env`. A URL do calendario e o token do Notion sao segredos e nunca devem ser commitados.

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

O workflow tambem pode ser executado manualmente na aba **Actions**. A automacao agendada so comeca a funcionar depois de estar na branch padrao do repositorio.

## Desenvolvimento

```bash
npm run check
npm run build
```

O nucleo usa a interface `TaskDestination`, permitindo adicionar Google Tasks, Todoist ou uma aplicacao propria sem alterar o leitor do Campus.
