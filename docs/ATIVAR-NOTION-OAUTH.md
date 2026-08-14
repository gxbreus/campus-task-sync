# Ativar a conexão pública do Notion

O botão **Conectar ao Notion** depende de uma conexão pública do Notion e de um
projeto Supabase. Segredos devem ser copiados diretamente para a Vercel; nunca
para issues, commits, capturas de tela ou mensagens.

## 1. Criar o Supabase

1. No projeto da Vercel, abra **Storage** e instale a integração **Supabase**.
2. Crie um projeto chamado `campus-task-sync-beta` no plano gratuito.
3. Abra o **SQL Editor** do Supabase.
4. Execute todo o arquivo
   `supabase/migrations/202608140001_web_installations.sql`.
5. Confirme na Vercel que existem `SUPABASE_URL` e `SUPABASE_SECRET_KEY` para
   **Production** e **Preview**.

A `SUPABASE_SECRET_KEY` é exclusiva do servidor e concede acesso elevado ao
banco. Ela nunca pode ter o prefixo `NEXT_PUBLIC_`.

## 2. Criar a conexão pública do Notion

1. Abra o portal de desenvolvedores do Notion e escolha **Build → Public
   connections → Create new connection**.
2. Use o nome `Campus Task Sync`.
3. Escolha **Any workspace**. Essa escolha não pode ser alterada depois.
4. Cadastre exatamente esta URI de retorno:

   `https://campus-task-sync.vercel.app/api/notion/callback`

5. Libere somente as capacidades necessárias: ler, inserir e atualizar
   conteúdo. Não habilite comentários ou e-mail do usuário.
6. Na aba **Configuration**, copie o Client ID e o Client Secret diretamente
   para a Vercel.

## 3. Variáveis da Vercel

Em **Project → Settings → Environment Variables**, configure:

```text
NEXT_PUBLIC_APP_URL=https://campus-task-sync.vercel.app
NOTION_OAUTH_CLIENT_ID=...
NOTION_OAUTH_CLIENT_SECRET=...
SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
APP_ENCRYPTION_KEY=...
```

Gere `APP_ENCRYPTION_KEY` no seu próprio terminal:

```bash
openssl rand -base64 32
```

Marque as variáveis secretas como protegidas e aplique-as a **Production** e
**Preview**. Depois faça um novo deploy. O botão ficará ativo automaticamente.

## 4. Teste de aceite

1. Acesse o site em uma janela anônima.
2. Clique em **Conectar ao Notion**.
3. Selecione somente uma página de testes e permita o acesso.
4. Confirme o retorno à página com o selo **Conectado**.
5. No Supabase, confirme uma linha em `web_installations`. Os campos de token
   devem parecer valores cifrados, nunca tokens legíveis do Notion.

Se o retorno mostrar erro, confira primeiro se a URI cadastrada no Notion é
idêntica à URI acima, inclusive o protocolo HTTPS e o caminho.
