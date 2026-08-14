# Arquitetura do beta web

O beta web elimina os comandos de terminal sem criar uma conta própria no
Campus Task Sync. O Notion identifica a instalação e continua sendo a interface
usada diariamente pelo estudante.

## Serviços gratuitos escolhidos

- **Vercel Hobby:** hospeda a aplicação Next.js, as páginas e as rotas de API.
- **Supabase Free:** guarda instalações, tokens criptografados e histórico das
  sincronizações.
- **GitHub Actions:** chama uma rota protegida a cada 30 minutos para iniciar as
  sincronizações do beta.
- **Notion OAuth:** permite conectar um workspace e escolher uma página sem
  copiar manualmente um token.

O domínio gratuito da Vercel será suficiente para o beta. Um domínio próprio é
opcional.

## Fluxo

```text
Navegador ── OAuth ──> Notion
    │
    ├── senha ───────> Campus Virtual ──> token Moodle
    │                  (a senha não passa pela aplicação)
    │
    └── configuração ─> API Next.js ──> Supabase
                               │
                               └──> Notion / Campus Virtual
```

O endpoint de token do Campus aceita chamadas do navegador. Depois de receber o
token, o navegador envia somente o token para a API do beta. A senha é apagada
do formulário e nunca é armazenada.

A URL privada do calendário precisa passar pela API porque a exportação do
calendário não oferece a mesma permissão de acesso direto pelo navegador e
porque o servidor precisará consultá-la nas sincronizações automáticas.

## Identificação sem cadastro

Depois do OAuth, a aplicação registra o identificador do workspace do Notion e
entrega ao navegador um cookie de sessão aleatório, `HttpOnly`, `Secure` e
`SameSite=Lax`. O valor salvo no banco será somente o hash desse código.

Se o cookie for perdido, o estudante poderá conectar o mesmo Notion novamente.
Não haverá e-mail, senha ou perfil do Campus Task Sync.

## Dados persistidos

- identificador da instalação e do workspace do Notion;
- tokens OAuth do Notion criptografados;
- URL do calendário criptografada;
- token Moodle criptografado;
- IDs dos painéis criados;
- resultado e horário da última sincronização.

Planos de ensino em PDF são baixados temporariamente do Campus durante a
sincronização. O texto é analisado em memória para identificar provas,
trabalhos e outras avaliações; o arquivo e seu texto integral não são gravados
no Supabase.

Os tokens serão cifrados com AES-256-GCM antes de chegar ao banco. A chave ficará
somente nas variáveis protegidas da Vercel. O banco não armazenará a senha do
Campus nem o conteúdo integral das atividades.

## Etapas de entrega

1. Interface responsiva e validação do calendário.
2. Emissão direta e segura do token Moodle.
3. OAuth público do Notion e sessão sem cadastro.
4. Banco de instalações com tokens criptografados.
5. Botão único para estruturar tarefas, faltas e datas importantes, além da
   sincronização manual.
6. Sincronização automática por rota protegida e GitHub Actions.
7. Google Drive opcional por OAuth próprio do usuário (próxima etapa).

## Limites do plano gratuito

O beta será interrompido, em vez de gerar cobrança automática, caso alcance os
limites dos serviços gratuitos. Antes de abrir para um público maior, será
necessário acompanhar execuções, banco, tráfego e limites das APIs externas.
