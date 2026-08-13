# Como contribuir

Obrigado pelo interesse em melhorar o Campus Task Sync. O projeto quer atender
estudantes de todos os cursos da UFLA, então relatos de grades e disciplinas
diferentes são especialmente úteis.

## Antes de começar

- nunca publique `.env`, tokens, URLs privadas de calendário ou credenciais;
- procure uma issue existente antes de abrir outra;
- para mudanças maiores, abra primeiro uma issue descrevendo a proposta;
- use dados fictícios nos testes e nos exemplos.

## Preparar o projeto

1. Faça um fork do repositório no GitHub.
2. Clone o seu fork.
3. Instale Node.js 22 ou mais recente.
4. Execute `npm ci`.
5. Crie sua branch a partir de `develop`:

```bash
git switch develop
git pull origin develop
git switch -c feat/nome-da-mudanca
```

Não é necessário configurar tokens para desenvolver e executar os testes.

## Validar a mudança

Antes de enviar o pull request, execute:

```bash
npm run typecheck
npm test
npm run build
```

Adicione testes para correções de bugs e novas regras. Ao tratar nomes de
disciplinas, inclua exemplos com acentos, vírgulas, barras ou nomes longos.

## Enviar o pull request

1. Faça commits objetivos e sem arquivos pessoais.
2. Envie a branch para o seu fork.
3. Abra o pull request com destino à branch `develop`.
4. Explique o problema, a solução e os testes executados.

Depois de validada em `develop`, uma versão estável é promovida para `main`.

## Relatar falhas de segurança

Não abra uma issue pública contendo tokens, credenciais ou dados pessoais. Use
o recurso **Security → Report a vulnerability** do GitHub. Se um segredo for
publicado por engano, revogue-o imediatamente no serviço correspondente.
