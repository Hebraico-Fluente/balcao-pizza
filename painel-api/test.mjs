// Teste local do painel (D1 simulado). Uso: node painel-api/test.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { handle, normTel } from "./worker.js";

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
