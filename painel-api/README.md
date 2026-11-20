# Painel de pedidos e cartão fidelidade

- **Painel:** `https://moshikgueta.github.io/balcao-pizza/painel/` (com senha, fora do Google)
- **Demonstração sem servidor:** `.../painel/?demo=1`

## Como funciona

1. O cliente faz o pedido no site. O WhatsApp abre igual a antes e, ao mesmo tempo, o pedido é registrado no servidor com um código (ex.: `B1411-1932-K7QZ`, que também vai na mensagem).
2. Se o cliente marcou o cartão fidelidade, o site pede o celular dele.
3. No painel, a equipe vê os pedidos em três colunas (**Novos → Em preparo → Prontos**), com aviso sonoro quando chega um novo. A lista se atualiza sozinha a cada 20 segundos.
4. Quando a equipe toca em **"Cliente retirou"**, o selo é marcado sozinho, uma vez por pedido. Se a equipe desfizer a retirada, o selo do pedido sai.
5. Na aba **Selos**, a equipe busca pelo celular e pode dar +1, tirar −1, **resgatar o prêmio** (desconta 10) e mandar o saldo pelo WhatsApp.
6. A aba **Clientes** lista quem tem selos, do mais perto do prêmio para o mais longe.

## Acompanhamento, telão, massas e avaliações

- **Etapas:** Recebido → Massa aberta → No forno → Pronto → Retirado (ou Cancelado). No painel, um botão grande por pedido avança a etapa; "↶ Voltar" desfaz um toque errado.
- **Link do cliente:** `/acompanhar/?t=TOKEN` (token aleatório de 128 bits, gerado no aparelho com `crypto.getRandomValues`; o servidor sorteia um se faltar). Vai na mensagem do WhatsApp. Mostra só o próprio pedido: número do dia, primeiro nome, itens e etapas. Atualiza a cada 6 s (pausa com a aba escondida).
- **Telão:** aba **Telão** do painel → "Ligar o telão" gera o link `/telao/?k=CHAVE` (a senha do painel nunca vai na URL). Trocar a chave derruba o link antigo.
- **Massas do dia:** barra no topo de Pedidos → "Informar massas de hoje". Cada pizza do site desconta 1 (meia a meia = 1); "Vendi 1 no balcão" desconta as vendas de fora do site. No zero o site para de aceitar pedidos. Zera sozinho à meia-noite (São Paulo).
- **Avaliações:** 1 h depois da retirada a página do cliente pergunta "Como estava a pizza?". Todo mundo que avalia vê o botão do Google (link na aba **Avaliações**); nota de 1 a 4 vê antes a caixa de comentário privado. Nunca filtramos o Google pela nota (regra do Google contra "review gating").
- **Banco:** só tabelas novas (`acompanhamento`, `avaliacoes`, `limites`), com `CREATE TABLE IF NOT EXISTS` — o deploy pode reaplicar o `schema.sql` sem quebrar. Ajustes ficam na tabela `config` (`massas`, `telao`, `avaliacao`).

## Publicar (Cloudflare, de graça)

1. **Banco:** D1 → Create database `painel-balcao` → Console → cole `schema.sql` → Execute.
2. **Worker:** Create Worker `painel-balcao` → Edit code → cole `worker.js` → Deploy.
3. **Settings:** Binding D1 `DB` → `painel-balcao`. Secret `ADMIN_KEY` → a senha do painel (longa, por exemplo quatro palavras).
4. **Site:** em `index.html`, `CONFIG.panelApi: "https://painel-balcao.SUA-CONTA.workers.dev"`.
5. **Painel:** abra `/painel/`, coloque o endereço do Worker e a senha. Em `painel/index.html`, preencha `API_PADRAO` com o endereço para não precisar digitar.

## Regras

- O servidor recalcula o total com a tabela `PRECOS`. **Mudou um preço no site? Mude no `worker.js` também.**
- A meta é 10 selos (`META_SELOS` no worker e `META` no painel), igual a `loyaltyGoal` no site.
- Cada aparelho (IP) pode registrar no máximo 12 pedidos por hora, para evitar abuso.
- Não existe consulta pública de selos: ninguém descobre se um número é cliente.
- Dados guardados: nome, celular (só de quem quer o selo) e o pedido. Ninguém vê esses dados sem a senha. Se um cliente pedir para apagar os dados dele, apague no Console do D1: `DELETE FROM selos WHERE tel='41...'; UPDATE pedidos SET tel=NULL, nome='removido' WHERE tel='41...';`

## Testar

`node painel-api/test.mjs` (testes com banco simulado: pedidos, selos, estoque, loja, etapas, acompanhamento, telão, massas e avaliações).
