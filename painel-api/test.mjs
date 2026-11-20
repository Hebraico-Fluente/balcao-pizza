// Teste local do painel (D1 simulado). Uso: node painel-api/test.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { handle, normTel, hojeSP, novoToken } from "./worker.js";

const db = new DatabaseSync(":memory:");
db.exec(fs.readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
const DB = { prepare(sql) { let a = []; const st = db.prepare(sql); return { bind(...x) { a = x; return this; }, async all() { return { results: st.all(...a) }; }, async first() { return st.get(...a) ?? null; }, async run() { const r = st.run(...a); return { meta: { changes: r.changes } }; } }; } };
const env = { DB, ADMIN_KEY: "senha-forte-123" };
const O = "https://moshikgueta.github.io";
const req = (m, p, body, { key, origin = O, ip = "1.1.1.1" } = {}) => handle(new Request("https://w.test" + p, {
  method: m, headers: { "Content-Type": "application/json", Origin: origin, "CF-Connecting-IP": ip, ...(key ? { Authorization: "Bearer " + key } : {}) },
  body: body ? JSON.stringify(body) : undefined }), env);
const K = { key: env.ADMIN_KEY };
const ok = (c, m) => { console.log((c ? "ok   " : "FALHA") + " " + m); if (!c) process.exitCode = 1; };
let n = 0; const pid = () => `B1411-2000-${String(++n).padStart(4, "0")}`;
const ped = (o = {}) => ({ id: pid(), nome: "Ana", tel: "(41) 99991-9434", fid: true, itens: [{ id: "margherita", qtd: 2 }], total: 1, retirada: "19:30", pagamento: "Pix", ...o });

ok(normTel("+55 (41) 99991-9434") === "41999919434" && normTel("123") === "", "normaliza celular");
let p1 = ped(); let r = await req("POST", "/pedido", p1); ok(r.status === 200, "site registra pedido");
r = await req("POST", "/pedido", ped(), { origin: "https://outro.com" }); ok(r.status === 403, "outro site não registra pedido");
r = await req("POST", "/pedido", ped({ tel: "123" })); ok(r.status === 400, "selo sem celular válido é recusado");
r = await req("GET", "/admin/pedidos"); ok(r.status === 401, "painel sem senha é bloqueado");
r = await req("GET", "/admin/pedidos", null, { key: "errada-123" }); ok(r.status === 401, "senha errada é bloqueada");
let j = await (await req("GET", "/admin/pedidos", null, K)).json();
ok(j.pedidos.length === 1 && j.pedidos[0].total === 9580 && j.pedidos[0].status === "novo" && j.pedidos[0].ip === undefined, "painel lista pedido com total do servidor");
await req("POST", "/admin/pedido/status", { id: p1.id, status: "preparo" }, K);
j = await (await req("GET", "/admin/cliente?tel=41999919434", null, K)).json(); ok(j.selos === 0, "em preparo ainda não dá selo");
j = await (await req("POST", "/admin/pedido/status", { id: p1.id, status: "retirado" }, K)).json(); ok(j.selo === "+1" && j.selos === 1, "retirado dá 1 selo");
j = await (await req("POST", "/admin/pedido/status", { id: p1.id, status: "retirado" }, K)).json(); ok(j.selos === 1, "marcar retirado de novo não duplica o selo");
j = await (await req("POST", "/admin/pedido/status", { id: p1.id, status: "pronto" }, K)).json(); ok(j.selo === "removido" && j.selos === 0, "desfazer a retirada tira o selo");
await req("POST", "/admin/pedido/status", { id: p1.id, status: "retirado" }, K);
for (let i = 0; i < 9; i++) await req("POST", "/admin/selo", { tel: "41 99991-9434", delta: 1 }, K);
j = await (await req("GET", "/admin/cliente?tel=41999919434", null, K)).json(); ok(j.selos === 10 && j.podeResgatar && j.nome === "Ana", "10 selos: cartão cheio");
j = await (await req("GET", "/selos?tel=(41) 99991-9434", null, { ip: "5.5.5.5" })).json();
ok(j.selos === 10 && j.completo === true && j.meta === 10 && !("nome" in j) && !("historico" in j), "cliente consulta o próprio cartão (só a quantidade)");
r = await req("GET", "/selos?tel=41999919434", null, { origin: "https://outro.com", ip: "5.5.5.5" }); ok(r.status === 403, "consulta só pelo site da Balcão");
j = await (await req("GET", "/selos?tel=41988887777", null, { ip: "5.5.5.5" })).json(); ok(j.selos === 0 && j.completo === false, "número sem selos mostra zero (não revela se é cliente)");
let barrado = 0; for (let i = 0; i < 10; i++) { r = await req("GET", "/selos?tel=41999919434", null, { ip: "5.5.5.5" }); if (r.status === 429) barrado++; }
ok(barrado === 2, "máximo de 10 consultas por hora no mesmo aparelho (2 já usadas + 8 permitidas)");
j = await (await req("POST", "/admin/resgate", { tel: "41999919434" }, K)).json(); ok(j.selos === 0, "resgate zera o cartão");
r = await req("POST", "/admin/resgate", { tel: "41999919434" }, K); ok(r.status === 400, "não resgata cartão vazio");
r = await req("POST", "/admin/selo", { tel: "41999919434", delta: -1 }, K); ok(r.status === 400, "não fica negativo");
p1 = ped({ fid: false, tel: "" }); await req("POST", "/pedido", p1);
j = await (await req("POST", "/admin/pedido/status", { id: p1.id, status: "retirado" }, K)).json(); ok(j.selo === null, "pedido sem cartão não gera selo");
let lim = 0; for (let i = 0; i < 14; i++) { r = await req("POST", "/pedido", ped(), { ip: "9.9.9.9" }); if (r.status === 429) lim++; }
ok(lim === 2, "limite de pedidos por hora no mesmo IP");
j = await (await req("GET", "/admin/clientes", null, K)).json(); ok(Array.isArray(j.clientes), "lista de clientes com selos");

const cf = (origin, host) => handle(new Request(`https://${host}/pedido`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "CF-Connecting-IP": "7.7.7.7" }, body: JSON.stringify(ped()) }), env);
ok((await cf("https://balcao-pizza.minhaconta.workers.dev", "painel-balcao.minhaconta.workers.dev")).status === 200, "aceita o site da Balcão na mesma conta Cloudflare");
ok((await cf("https://balcao-pizza.outraconta.workers.dev", "painel-balcao.minhaconta.workers.dev")).status === 403, "recusa o mesmo nome em outra conta");

/* ---------- estoque ---------- */
r = await req("GET", "/admin/estoque"); ok(r.status === 401, "estoque exige senha");
j = await (await req("POST", "/admin/estoque/item", { nome: "Farinha 00", unidade: "kg", minimo: 10, categoria: "Massa", quantidade: 25 }, K)).json();
ok(j.item && j.item.quantidade === 25 && j.item.acabando === false, "cadastra item com quantidade inicial");
const farinha = j.item.id;
r = await req("POST", "/admin/estoque/item", { nome: "farinha 00", unidade: "kg" }, K); ok(r.status === 409, "não deixa cadastrar o mesmo item duas vezes");
r = await req("POST", "/admin/estoque/item", { nome: "X", unidade: "tonelada" }, K); ok(r.status === 400, "recusa nome curto ou unidade estranha");
j = await (await req("POST", "/admin/estoque/mov", { id: farinha, tipo: "saida", qtd: "16,5", motivo: "noite de sábado" }, K)).json();
ok(j.item.quantidade === 8.5 && j.item.acabando === true, "saída com vírgula e aviso de acabando");
r = await req("POST", "/admin/estoque/mov", { id: farinha, tipo: "saida", qtd: 20 }, K); ok(r.status === 400, "não deixa o estoque ficar negativo");
j = await (await req("POST", "/admin/estoque/mov", { id: farinha, tipo: "entrada", qtd: 25 }, K)).json(); ok(j.item.quantidade === 33.5 && !j.item.acabando, "entrada de mercadoria");
j = await (await req("POST", "/admin/estoque/mov", { id: farinha, tipo: "contagem", qtd: 30 }, K)).json(); ok(j.item.quantidade === 30, "contagem acerta o saldo");
j = await (await req("GET", "/admin/estoque/historico?id=" + farinha, null, K)).json();
ok(j.movimentos.length === 4 && j.movimentos[0].delta === -3.5 && j.movimentos[0].saldo === 30, "histórico guarda cada movimento");
j = await (await req("POST", "/admin/estoque/item", { id: farinha, nome: "Farinha tipo 00", unidade: "kg", minimo: 40, categoria: "Massa" }, K)).json();
ok(j.item.nome === "Farinha tipo 00" && j.item.quantidade === 30 && j.item.acabando, "editar item mantém o saldo");
await req("POST", "/admin/estoque/remover", { id: farinha }, K);
j = await (await req("GET", "/admin/estoque", null, K)).json(); ok(j.itens.length === 0 && j.unidades.includes("kg"), "remover tira o item da lista");

/* ---------- loja fechada pelo painel ---------- */
j = await (await req("GET", "/status")).json(); ok(j.fechado === false, "loja começa aberta");
r = await req("POST", "/admin/loja", { fechado: true }); ok(r.status === 401, "fechar a loja exige senha");
r = await req("POST", "/admin/loja", { fechado: true, ate: "2020-01-01" }, K); ok(r.status === 400, "não aceita data no passado");
j = await (await req("POST", "/admin/loja", { fechado: true, ate: hojeSP(), motivo: "  Manutenção do forno  " }, K)).json();
ok(j.fechado && j.ate === hojeSP() && j.motivo === "Manutenção do forno", "admin fecha a loja só hoje com aviso");
j = await (await req("GET", "/status", null, { ip: "6.6.6.6" })).json(); ok(j.fechado && j.motivo === "Manutenção do forno", "site vê a loja fechada e o aviso");
r = await req("GET", "/status", null, { origin: "https://outro.com" }); ok(r.status === 403, "status só para o site da Balcão");
r = await req("POST", "/pedido", ped(), { ip: "8.8.8.8" }); ok(r.status === 423, "com a loja fechada o pedido não entra");
db.prepare("UPDATE config SET valor = ? WHERE chave = 'loja'").run(JSON.stringify({ fechado: true, ate: "2020-01-01", motivo: "x" }));
j = await (await req("GET", "/status")).json(); ok(j.fechado === false, "depois da data escolhida a loja reabre sozinha");
await req("POST", "/admin/loja", { fechado: true, motivo: "Férias" }, K);
j = await (await req("GET", "/admin/loja", null, K)).json(); ok(j.fechado && j.ate === null, "fechar até reabrir (sem data)");
j = await (await req("POST", "/admin/loja", { fechado: false }, K)).json(); ok(!j.fechado, "reabrir pelo painel");
r = await req("POST", "/pedido", ped(), { ip: "8.8.8.8" }); ok(r.status === 200, "reaberta, o pedido volta a entrar");

/* ---------- baixa automática por pizza ---------- */
const novo = async (nome, unidade, quantidade, minimo) => (await (await req("POST", "/admin/estoque/item", { nome, unidade, quantidade, minimo, categoria: "Outros" }, K)).json()).item.id;
const fior = await novo("Fior di Latte", "kg", 5, 1), caixa = await novo("Caixa 30 cm", "un", 10, 3), manj = await novo("Manjericão", "maço", 0.15, 0.5);
r = await req("POST", "/admin/ficha", { sabor: "margherita", linhas: [{ item_id: fior, qtd: "0,12" }, { item_id: manj, qtd: 0.1 }] }, K); ok(r.status === 200, "salva a ficha da margherita");
await req("POST", "/admin/ficha", { sabor: "_todas", linhas: [{ item_id: caixa, qtd: 1 }] }, K);
r = await req("POST", "/admin/ficha", { sabor: "pizza-de-mentira", linhas: [] }, K); ok(r.status === 400, "recusa sabor que não existe");
r = await req("POST", "/admin/ficha", { sabor: "margherita", linhas: [{ item_id: fior, qtd: 0 }] }, K); ok(r.status === 400, "recusa quantidade zero na ficha");
j = await (await req("GET", "/admin/fichas", null, K)).json();
ok(j.sabores[0].id === "_todas" && j.fichas.margherita.length === 2 && j.fichas._todas[0].nome === "Caixa 30 cm", "lista as fichas por sabor");
const est = async id => (await (await req("GET", "/admin/estoque", null, K)).json()).itens.find(i => i.id === id);
const pz = ped({ itens: [{ id: "margherita", qtd: 2 }, { id: "diavola", qtd: 1 }] }); await req("POST", "/pedido", pz, { ip: "4.4.4.4" });
await req("POST", "/admin/pedido/status", { id: pz.id, status: "preparo" }, K);
ok((await est(fior)).quantidade === 5, "em preparo ainda não baixa o estoque");
j = await (await req("POST", "/admin/pedido/status", { id: pz.id, status: "retirado" }, K)).json();
ok((await est(fior)).quantidade === 4.76 && (await est(caixa)).quantidade === 7, "retirado: baixa a ficha de cada pizza + a caixa de todas");
ok((await est(manj)).quantidade === 0 && j.estoque.some(x => x.nome === "Manjericão" && x.acabando), "não deixa negativo e avisa o que acabou");
await req("POST", "/admin/pedido/status", { id: pz.id, status: "retirado" }, K);
ok((await est(caixa)).quantidade === 7, "marcar retirado de novo não baixa duas vezes");
j = await (await req("POST", "/admin/pedido/status", { id: pz.id, status: "cancelado" }, K)).json();
ok(j.estoque === "devolvido" && (await est(fior)).quantidade === 5 && (await est(caixa)).quantidade === 10 && (await est(manj)).quantidade === 0.15, "cancelar depois de retirado devolve exatamente o que saiu");
await req("POST", "/admin/pedido/status", { id: pz.id, status: "retirado" }, K);
ok((await est(caixa)).quantidade === 7, "retirar de novo volta a baixar");
j = await (await req("GET", "/admin/estoque/historico?id=" + caixa, null, K)).json();
ok(j.movimentos.map(m => m.tipo).join() === "pedido,estorno,pedido,contagem", "histórico mostra baixa e estorno do pedido");

/* ---------- acompanhamento ao vivo (link secreto do cliente) ---------- */
let ipN = 0; const ipNovo = () => `10.0.${Math.floor(++ipN / 200)}.${ipN % 200}`;
const novoPed = async (o = {}) => { const p = ped({ token: novoToken(), ...o }); const r = await req("POST", "/pedido", p, { ip: ipNovo() }); return { p, r, j: await r.json() }; };
const acomp = (t, o = {}) => req("GET", "/acompanhar?t=" + encodeURIComponent(t), null, { ip: "20.0.0.1", ...o });
ok(/^[A-Za-z0-9_-]{22}$/.test(novoToken()) && novoToken() !== novoToken(), "token aleatório de 128 bits em base64url");
let A = await novoPed({ nome: "Ana Maria Souza", tel: "(41) 99991-9434", obs: "interfone 12" });
ok(A.r.status === 200 && A.j.token === A.p.token && Number.isInteger(A.j.numero) && A.j.numero >= 1, "pedido devolve o token e o número do dia");
let B = await novoPed({ nome: "Bruno", fid: false, tel: "", itens: [{ id: "diavola", qtd: 1 }] });
ok(B.j.numero === A.j.numero + 1, "número do dia é sequencial");
const semTok = await (await req("POST", "/pedido", ped({ fid: false, tel: "" }), { ip: ipNovo() })).json();
ok(/^[A-Za-z0-9_-]{22,}$/.test(semTok.token), "sem token do site, o servidor sorteia um");
r = await req("POST", "/pedido", { ...A.p, token: novoToken() }, { ip: ipNovo() }); j = await r.json();
ok(r.status === 200 && !("token" in j), "reenviar o mesmo código com outro token não entrega o link de ninguém");
j = await (await req("POST", "/pedido", A.p, { ip: ipNovo() })).json(); ok(j.token === A.p.token, "reenvio do próprio pedido (mesmo token) devolve o link");
j = await (await acomp(A.p.token)).json();
ok(j.etapa === "novo" && j.nome === "Ana" && j.numero === A.j.numero && j.itens[0].nome === "Margherita" && j.itens[0].qtd === 2, "cliente vê etapa, número, primeiro nome e itens");
const txt = JSON.stringify(j);
ok(!/9434|99991|Souza|interfone|total|B1411|"id"|"tel"/.test(txt), "acompanhamento não mostra telefone, sobrenome, observação, total nem código");
j = await (await acomp(B.p.token)).json(); ok(j.nome === "Bruno" && j.itens[0].nome === "Diavola", "outro token só vê o próprio pedido");
r = await acomp(novoToken()); ok(r.status === 404, "token inventado não acha nada");
r = await acomp("curto"); ok(r.status === 404, "token com formato inválido é recusado");
r = await acomp(A.p.token, { origin: "https://outro.com" }); ok(r.status === 403, "acompanhamento só pelo site da Balcão");
for (const [st, et] of [["preparo", "preparo"], ["forno", "forno"], ["pronto", "pronto"]]) {
  await req("POST", "/admin/pedido/status", { id: A.p.id, status: st }, K);
  j = await (await acomp(A.p.token)).json(); ok(j.etapa === et, `etapa ${st} aparece para o cliente`);
}
ok(j.etapas.massa && j.etapas.forno && j.etapas.pronto && j.fornoSeg === 90 && j.agora, "guarda a hora de cada etapa (contagem do forno)");
j = await (await req("GET", "/admin/pedidos?status=abertos", null, K)).json();
ok(j.pedidos.some(p => p.id === A.p.id && p.token === A.p.token && p.numero === A.j.numero), "painel recebe o token e o número para montar os links");
await req("POST", "/admin/pedido/status", { id: B.p.id, status: "forno" }, K);
j = await (await req("GET", "/admin/pedidos?status=abertos", null, K)).json(); ok(j.pedidos.some(p => p.id === B.p.id && p.status === "forno"), "pedido no forno continua em andamento");
await req("POST", "/admin/pedido/status", { id: B.p.id, status: "cancelado" }, K);
j = await (await acomp(B.p.token)).json(); ok(j.etapa === "cancelado" && j.etapas.cancelado, "cancelado no painel aparece para o cliente");
let lim404 = 0; for (let i = 0; i < 32; i++) { r = await acomp(novoToken(), { ip: "30.0.0.1" }); if (r.status === 429) lim404++; }
r = await acomp(A.p.token, { ip: "30.0.0.1" });
ok(lim404 === 2 && r.status === 429, "muitos tokens errados no mesmo aparelho: bloqueia por 10 minutos");

/* ---------- telão ---------- */
const tela = (k, o = {}) => req("GET", "/telao" + (k === undefined ? "" : "?k=" + encodeURIComponent(k)), null, { ip: "40.0.0.1", ...o });
r = await tela("qualquer"); ok(r.status === 403, "telão desligado enquanto não há chave");
r = await req("POST", "/admin/telao", { novaChave: true }); ok(r.status === 401, "criar a chave do telão exige senha");
j = await (await req("POST", "/admin/telao", { novaChave: true, destaque: "diavola" }, K)).json();
const chave = j.chave; ok(/^[A-Za-z0-9_-]{24}$/.test(chave) && chave !== env.ADMIN_KEY && j.destaque === "diavola", "painel cria a chave do telão e a pizza do dia");
r = await tela(); ok(r.status === 401, "telão sem chave é recusado");
r = await tela("chave-errada-123"); ok(r.status === 401, "telão com chave errada é recusado");
r = await tela(env.ADMIN_KEY); ok(r.status === 401, "a senha do painel não abre o telão");
r = await tela(chave, { origin: "https://outro.com" }); ok(r.status === 403, "telão só no site da Balcão");
const C = await novoPed({ nome: "Carla Dias", tel: "(41) 98888-7777" });
j = await (await tela(chave)).json();
ok(j.prontos.some(x => x.numero === A.j.numero && x.nome === "Ana") && j.preparando.some(x => x.numero === C.j.numero && x.nome === "Carla"), "telão mostra preparando e prontos com número e primeiro nome");
ok(!/9434|7777|Souza|Dias|Margherita"|qtd|tel|token|B1411/.test(JSON.stringify({ p: j.preparando, r: j.prontos })), "telão não mostra telefone, sobrenome, itens nem token");
ok(!j.preparando.some(x => x.numero === B.j.numero) && j.destaque === "diavola" && j.cardapio.length === 6, "cancelado sai do telão; cardápio e pizza do dia para girar");
const velha = chave; j = await (await req("POST", "/admin/telao", { novaChave: true }, K)).json();
ok((await tela(velha)).status === 401 && (await tela(j.chave)).status === 200, "trocar a chave derruba o link antigo");
await req("POST", "/admin/telao", { desligar: true }, K); ok((await tela(j.chave)).status === 403, "desligar o telão");

/* ---------- massas do dia ---------- */
j = await (await req("GET", "/status", null, { ip: "50.0.0.1" })).json(); ok(j.massas === null, "sem massas informadas hoje, o site não mostra contagem");
r = await req("POST", "/admin/massas", { feitas: 10 }); ok(r.status === 401, "informar massas exige senha");
r = await req("POST", "/admin/massas", { feitas: -2 }, K); ok(r.status === 400, "recusa número de massas inválido");
r = await req("POST", "/admin/massas", { balcao: 1 }, K); ok(r.status === 400, "balcão −1 antes de informar as massas é recusado");
let M = await (await req("GET", "/admin/massas", null, K)).json(); const jaUsadas = M.site;
ok(M.ativo === false && jaUsadas > 0, "conta as massas dos pedidos de hoje feitos pelo site");
M = await (await req("POST", "/admin/massas", { feitas: jaUsadas + 3 }, K)).json(); ok(M.restam === 3 && M.feitas === jaUsadas + 3, "loja informa as massas de hoje");
j = await (await req("GET", "/status", null, { ip: "50.0.0.1" })).json(); ok(j.massas && j.massas.restam === 3 && !("feitas" in j.massas), "site recebe só quantas restam");
const MM = await novoPed({ fid: false, tel: "", itens: [{ id: "margherita", meia: "diavola", qtd: 1 }] });
ok(MM.r.status === 200, "meia a meia entra");
j = await (await req("GET", "/admin/pedidos?status=abertos", null, K)).json(); const mm = j.pedidos.find(p => p.id === MM.p.id);
ok(mm.total === 4990 && mm.itens[0].nome === "½ Margherita + ½ Diavola" && mm.massas === 1, "meia a meia = 1 massa, cobra a metade mais cara");
M = await (await req("GET", "/admin/massas", null, K)).json(); ok(M.restam === 2, "cada pizza desconta uma massa");
r = await novoPed({ fid: false, tel: "", itens: [{ id: "mussarela", qtd: 3 }] }); ok(r.r.status === 409 && r.j.massas.restam === 2, "não aceita mais pizzas do que as massas que restam");
M = await (await req("POST", "/admin/massas", { balcao: 1 }, K)).json(); ok(M.restam === 1 && M.balcao === 1, "venda no balcão desconta uma massa");
const ULT = await novoPed({ fid: false, tel: "", itens: [{ id: "mussarela", qtd: 1 }] }); ok(ULT.r.status === 200, "última massa vendida");
j = await (await req("GET", "/status", null, { ip: "50.0.0.1" })).json(); ok(j.massas.restam === 0, "zero massas: o site sabe que acabou");
r = await novoPed({ fid: false, tel: "", itens: [{ id: "mussarela", qtd: 1 }] }); ok(r.r.status === 409 && /acabaram/.test(r.j.error), "massas acabaram: pedido recusado");
await req("POST", "/admin/pedido/status", { id: ULT.p.id, status: "cancelado" }, K);
M = await (await req("GET", "/admin/massas", null, K)).json(); ok(M.restam === 1, "cancelar o pedido devolve a massa");
M = await (await req("POST", "/admin/massas", { feitas: M.feitas + 4 }, K)).json(); ok(M.restam === 5 && M.balcao === 1, "corrigir as massas feitas mantém as do balcão");
await novo("Bolinha de massa", "un", 40, 5); await (await req("POST", "/admin/estoque/item", { nome: "Massa pronta", unidade: "un", quantidade: 12, categoria: "Massa" }, K)).json();
M = await (await req("GET", "/admin/massas", null, K)).json(); ok(M.estoque.length === 1 && M.estoque[0].nome === "Massa pronta", "sugere o saldo do item de massa (categoria Massa, em un) do estoque");
const ontem = hojeSP(new Date(Date.now() - 86400e3));
db.prepare("UPDATE config SET valor = ? WHERE chave = 'massas'").run(JSON.stringify({ dia: ontem, feitas: 0, balcao: 0 }));
j = await (await req("GET", "/status", null, { ip: "50.0.0.1" })).json(); ok(j.massas === null, "virada do dia: a contagem de ontem não vale hoje");
r = await novoPed({ fid: false, tel: "", itens: [{ id: "mussarela", qtd: 2 }] }); ok(r.r.status === 200, "no dia seguinte o pedido entra de novo");
const antes = (await (await req("GET", "/admin/massas", null, K)).json()).site;
db.prepare("UPDATE acompanhamento SET dia = ? WHERE pedido_id = ?").run(ontem, r.p.id);
ok((await (await req("GET", "/admin/massas", null, K)).json()).site === antes - 2, "pedidos de ontem não contam nas massas de hoje");
await req("POST", "/admin/massas", { feitas: 4 }, K); await req("POST", "/admin/massas", { desligar: true }, K);
ok((await (await req("GET", "/status", null, { ip: "50.0.0.1" })).json()).massas === null, "desligar a contagem de massas");

/* ---------- avaliações ---------- */
const avaliar = (t, nota, comentario, o = {}) => req("POST", "/avaliacao", { t, nota, ...(comentario !== undefined ? { comentario } : {}) }, { ip: "60.0.0.1", ...o });
r = await avaliar(C.p.token, 5); ok(r.status === 409, "não avalia antes de retirar");
j = await (await acomp(C.p.token, { ip: "20.0.0.9" })).json(); ok(j.avaliacao === null, "antes da retirada não há pergunta");
await req("POST", "/admin/pedido/status", { id: A.p.id, status: "retirado" }, K);
j = await (await acomp(A.p.token, { ip: "20.0.0.9" })).json();
const espera = Date.parse(j.avaliacao.desde) - Date.parse(j.etapas.retirado);
ok(j.etapa === "retirado" && j.avaliacao.aberta && Math.abs(espera - 3600e3) < 1000 && j.avaliacao.nota === null, "retirado: a pergunta abre 1 hora depois");
ok(j.avaliacao.google === null, "sem link do Google configurado, não oferece o Google");
r = await avaliar(A.p.token, 7); ok(r.status === 400, "nota fora de 1 a 5 é recusada");
r = await avaliar(novoToken(), 5); ok(r.status === 404, "avaliar com token inventado não acha nada");
r = await avaliar(A.p.token, 5, undefined, { origin: "https://outro.com" }); ok(r.status === 403, "avaliação só pelo site da Balcão");
j = await (await avaliar(A.p.token, 5)).json(); ok(j.ok && j.google === null, "5 estrelas sem link: só agradece");
r = await req("POST", "/admin/avaliacoes/config", { google: "https://g.page/r/abc" }); ok(r.status === 401, "link do Google exige senha");
for (const ruim of ["http://g.page/r/abc", "https://g.page.evil.com/x", "javascript:alert(1)", "https://google.com.evil.io/"])
  ok((await req("POST", "/admin/avaliacoes/config", { google: ruim }, K)).status === 400, "recusa link que não é do Google: " + ruim);
j = await (await req("POST", "/admin/avaliacoes/config", { google: "https://search.google.com/local/writereview?placeid=ChIJ123" }, K)).json();
ok(j.google.startsWith("https://search.google.com/local/writereview"), "salva o link de avaliação do Google");
j = await (await avaliar(A.p.token, 5)).json(); ok(j.google.includes("writereview"), "5 estrelas: oferece o Google");
j = await (await avaliar(A.p.token, 3, "  Massa boa, mas veio fria  ")).json();
ok(j.ok && j.google, "nota baixa também recebe o link do Google (sem filtrar por nota)");
j = await (await avaliar(A.p.token, 4)).json();
let AV = await (await req("GET", "/admin/avaliacoes", null, K)).json();
ok(AV.avaliacoes.length === 1 && AV.avaliacoes[0].nota === 4 && AV.avaliacoes[0].comentario === "Massa boa, mas veio fria" && AV.avaliacoes[0].numero === A.j.numero, "painel recebe nota e comentário privado (corrigir a nota mantém o comentário)");
await req("POST", "/admin/pedido/status", { id: C.p.id, status: "retirado" }, K);
await avaliar(C.p.token, 2, "<b>demorou</b>");
j = await (await acomp(A.p.token, { ip: "20.0.0.9" })).json(); ok(j.avaliacao.nota === 4 && j.avaliacao.comentou === true && !JSON.stringify(j).includes("demorou"), "cada token só vê a própria avaliação");
AV = await (await req("GET", "/admin/avaliacoes", null, K)).json();
ok(AV.total === 2 && AV.media === 3 && AV.dist[2] === 1 && AV.dist[4] === 1 && AV.google.includes("writereview"), "média, distribuição e link no painel");
ok((await req("GET", "/admin/avaliacoes")).status === 401, "lista de avaliações exige senha");
db.prepare("UPDATE acompanhamento SET retirado_em = ? WHERE pedido_id = ?").run(new Date(Date.now() - 40 * 86400e3).toISOString(), C.p.id);
r = await avaliar(C.p.token, 5); ok(r.status === 409, "pedido muito antigo não recebe avaliação");
let limAv = 0; for (let i = 0; i < 22; i++) { r = await avaliar(novoToken(), 5, undefined, { ip: "61.0.0.1" }); if (r.status === 429) limAv++; }
ok(limAv === 2, "limite de tentativas de avaliação por aparelho");

/* ---------- baixa de meia a meia ---------- */
const MZ = await novoPed({ fid: false, tel: "", itens: [{ id: "margherita", meia: "diavola", qtd: 2 }] });
const f0 = (await est(fior)).quantidade;
await req("POST", "/admin/pedido/status", { id: MZ.p.id, status: "retirado" }, K);
ok(r3t((await est(fior)).quantidade) === r3t(f0 - 0.12 * 0.5 * 2), "meia a meia baixa metade da ficha de cada sabor");
function r3t(n) { return Math.round(n * 1000) / 1000; }
