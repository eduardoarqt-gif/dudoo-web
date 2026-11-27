/* Dudoo Web — Escolhas (Projetos → o projeto → Escolhas). 26/11/2026, Eduardo: na loja, abrir as imagens, consultar as medidas e já anotar as escolhas (ainda não é
   compra; quem compra é, por exemplo, a marcenaria). A lista nasce no Dudoo do computador (Obra → Escolhas) e vive na pasta do projeto no Dropbox: o iPhone baixa
   `lista.json` e as fotos direto pela API (a mesma conexão do Revisar PDF, revisao.js), guarda tudo no aparelho pra abrir sem sinal e NUNCA grava no lista.json:
   cada anotação sobe como arquivo novo em `recebidas/`, e o computador junta. Sem internet, a anotação fica na fila e sobe sozinha depois. */
"use strict";

const CHAVE_ESCOLHAS = "dudoo_web_escolhas";
const BD_ESCOLHAS = { nome: "dudoo_web_escolhas", loja: "fotos" };
const LADO_FOTO_ESCOLHA = 1200;
const ESPERA_ENTRE_BUSCAS = 60000;

const estadoEsc = { urls: {}, buscadoEm: {}, buscando: "", aviso: {}, enviando: false, lista: {} };

const escGuardado = () => Object.assign({ listas: {}, fila: [] }, ler(CHAVE_ESCOLHAS, {}));
const escGravar = (g) => gravar(CHAVE_ESCOLHAS, g);
const escEntrada = (codigo) => (((estado.dados && estado.dados.escolhas) || []).find((e) => e.codigo === codigo)) || null;
// Só redesenha com a aba Escolhas aberta: sincronização em segundo plano não apaga o que a pessoa digita em outra tela.
const escRedesenhar = () => { if (estado.aba === "projetos" && estado.projeto && estado.subProjeto === "escolhas") desenhar(); };
const escId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-6);
// Hora local sem fuso, no mesmo formato do computador (é por ela que a anotação mais nova vence).
function escAgora() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ---------------------------------------------------------------- fotos guardadas no aparelho (IndexedDB)
function escBd() {
  return new Promise((ok, erro) => {
    if (!window.indexedDB) { erro(new Error("sem IndexedDB")); return; }
    const r = indexedDB.open(BD_ESCOLHAS.nome, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(BD_ESCOLHAS.loja);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  });
}
async function escGuardarFoto(chave, bytes) {
  const bd = await escBd();
  await new Promise((ok, erro) => { const t = bd.transaction(BD_ESCOLHAS.loja, "readwrite"); t.objectStore(BD_ESCOLHAS.loja).put(bytes, chave); t.oncomplete = ok; t.onerror = () => erro(t.error); });
}
async function escLerFoto(chave) {
  try {
    const bd = await escBd();
    return await new Promise((ok) => { const r = bd.transaction(BD_ESCOLHAS.loja).objectStore(BD_ESCOLHAS.loja).get(chave); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); });
  } catch (e) { return null; }
}
async function escMostrarFoto(chave) {
  if (!estadoEsc.urls[chave]) {
    const bytes = await escLerFoto(chave);
    if (!bytes) return;
    estadoEsc.urls[chave] = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
  }
  document.querySelectorAll("img[data-esc-foto]").forEach((im) => { if (im.dataset.escFoto === chave) im.src = estadoEsc.urls[chave]; });
}

// ---------------------------------------------------------------- lista = o que veio do computador + o que este aparelho anotou e ele ainda não juntou
function escListaComFila(codigo) {
  const g = escGuardado(), base = g.listas[codigo];
  if (!base) return null;
  const lista = JSON.parse(JSON.stringify(base));
  g.fila.filter((f) => f.codigo === codigo).forEach((f) => {
    const item = (lista.itens || []).find((i) => i.id === f.item_id);
    if (!item) return;
    item.escolhas = item.escolhas || [];
    if (f.remover) { item.escolhas = item.escolhas.filter((e) => e.id !== f.remover); return; }
    if (f.escolha.escolhida) item.escolhas.forEach((e) => { e.escolhida = false; });
    const atual = item.escolhas.find((e) => e.id === f.escolha.id);
    const nova = Object.assign({}, f.escolha, { esperando: !f.enviado });
    if (atual) Object.assign(atual, nova); else item.escolhas.push(nova);
  });
  return lista;
}

// Tira da fila o que o computador já juntou na lista.
function escLimparFila(codigo, lista) {
  const g = escGuardado(), removidas = lista.removidas || [];
  g.fila = g.fila.filter((f) => {
    if (f.codigo !== codigo || !f.enviado) return true;
    if (f.remover) return !removidas.includes(f.remover);
    if (removidas.includes(f.escolha.id)) return false;
    const item = (lista.itens || []).find((i) => i.id === f.item_id);
    if (!item) return false;
    const la = (item.escolhas || []).find((e) => e.id === f.escolha.id);
    return !la || String(la.em || "") < f.escolha.em;
  });
  g.listas[codigo] = lista;
  escGravar(g);
}

// ---------------------------------------------------------------- Dropbox
async function escSubir(caminho, bytes) {
  await rvChamarDbx("https://content.dropboxapi.com/2/files/upload", { method: "POST", headers: { "Content-Type": "application/octet-stream",
    "Dropbox-API-Arg": rvJsonAscii({ path: caminho, mode: "overwrite", mute: true }) }, body: bytes });
}
async function escEnviarFila() {
  if (estadoEsc.enviando || !rvConectado()) return;
  const pendentes = escGuardado().fila.filter((x) => !x.enviado);
  if (!pendentes.length) return;
  estadoEsc.enviando = true;
  try {
    for (const f of pendentes) {
      if (f.foto_nova) {
        const bytes = await escLerFoto(f.pasta + "/" + f.foto_nova);
        if (bytes) await escSubir(f.pasta + "/" + f.foto_nova, bytes);
      }
      const pedido = f.remover ? { item_id: f.item_id, remover: f.remover } : { item_id: f.item_id, escolha: f.escolha };
      await escSubir(`${f.pasta}/recebidas/${f.op}.json`, new TextEncoder().encode(JSON.stringify(pedido)));
      const g = escGuardado(), eu = g.fila.find((x) => x.op === f.op);
      if (eu) { eu.enviado = true; escGravar(g); }
    }
  } catch (e) { /* sem sinal: continua na fila e tenta de novo */ }
  estadoEsc.enviando = false;
  escRedesenhar();
}

async function escSincronizar(codigo, forcar) {
  const entrada = escEntrada(codigo);
  if (!entrada || !rvConectado() || estadoEsc.buscando) return;
  if (!forcar && Date.now() - (estadoEsc.buscadoEm[codigo] || 0) < ESPERA_ENTRE_BUSCAS) return;
  estadoEsc.buscando = codigo;
  estadoEsc.buscadoEm[codigo] = Date.now();
  try {
    await escEnviarFila();
    const lista = JSON.parse(new TextDecoder("utf-8").decode(await rvBaixar(entrada.pasta + "/lista.json")));
    escLimparFila(codigo, lista);
    const fotos = [];
    (lista.itens || []).forEach((i) => { (i.fotos || []).forEach((f) => fotos.push(f)); (i.escolhas || []).forEach((e) => { if (e.foto) fotos.push(e.foto); }); });
    let faltam = 0;
    for (const relativo of fotos) {
      const chave = entrada.pasta + "/" + relativo;
      if (await escLerFoto(chave)) continue;
      try { await escGuardarFoto(chave, await rvBaixar(chave)); escMostrarFoto(chave); } catch (e) { faltam++; }
    }
    estadoEsc.aviso[codigo] = faltam ? `${faltam} foto(s) ainda não chegaram no Dropbox. Toque em Atualizar daqui a pouco.` : "Guardado no aparelho: abre sem sinal.";
  } catch (e) {
    estadoEsc.aviso[codigo] = escGuardado().listas[codigo] ? "Sem conexão: mostrando o que está guardado no aparelho." : (e.message || String(e));
  }
  estadoEsc.buscando = "";
  escRedesenhar();
}

// ---------------------------------------------------------------- tela
function escImagem(pasta, relativo, classe) {
  const chave = pasta + "/" + relativo;
  setTimeout(() => escMostrarFoto(chave), 0);
  return `<img class="${classe}" data-esc-foto="${esc(chave)}" ${estadoEsc.urls[chave] ? `src="${estadoEsc.urls[chave]}"` : ""} alt="foto">`;
}
function escCartaoEscolha(codigo, pasta, item, e) {
  const linha = [e.nome, e.codigo ? "cód. " + e.codigo : "", e.loja, e.preco].filter(Boolean).join(" · ") || "só a foto";
  const alvo = `data-esc-item="${esc(item.id)}" data-esc-escolha="${esc(e.id)}" data-esc-projeto="${esc(codigo)}"`;
  return `<div class="esc-escolha${e.escolhida ? " marcada" : ""}"><div class="linha">${e.foto ? escImagem(pasta, e.foto, "esc-mini") : ""}<div class="t">${e.escolhida ? '<b class="esc-selo">Escolhido</b><br>' : ""}${esc(linha)}
    ${e.observacao ? `<div class="p">${esc(e.observacao)}</div>` : ""}${e.esperando ? '<div class="p">esperando internet pra subir</div>' : ""}</div></div>
    <button class="btn o peq" data-esc-acao="marcar" ${alvo}>${e.escolhida ? "Desmarcar" : "É esta"}</button><button class="btn o peq" data-esc-acao="editar" ${alvo}>Editar</button><button class="btn o peq" data-esc-acao="apagar" ${alvo}>Apagar</button></div>`;
}
function telaEscolhas(codigo) {
  const entrada = escEntrada(codigo);
  if (!entrada) return '<div class="vazio">Este projeto não tem lista de escolhas. Monte no computador: Obra → Escolhas → Enviar pro celular.</div>';
  const conexao = !rvAppKey() ? '<div class="vazio">O Dudoo do computador ainda não mandou a chave do Dropbox. Abra o Dudoo e atualize.</div>'
    : rvConectado() ? "" : '<div class="card"><div class="t"><b>Conectar o Dropbox</b><div class="p">Uma vez só: libera baixar a lista e as fotos e guardar o que você anotar.</div></div><button class="btn" data-rv-acao="conectar">Conectar o Dropbox</button></div>';
  setTimeout(() => escSincronizar(codigo, false), 0);
  const lista = escListaComFila(codigo), esperando = escGuardado().fila.filter((f) => f.codigo === codigo && !f.enviado).length;
  const topo = `<div class="linha" style="margin-top:12px"><div class="t mini">${esc(estadoEsc.buscando === codigo ? "Baixando a lista e as fotos…" : estadoEsc.aviso[codigo] || "")}${esperando ? ` · ${esperando} anotação(ões) esperando internet` : ""}</div>
    <button class="btn o peq" data-esc-acao="atualizar" data-esc-projeto="${esc(codigo)}">Atualizar</button></div>`;
  if (!lista) return conexao + topo + (rvConectado() ? '<div class="vazio">A lista ainda não foi baixada neste aparelho.</div>' : "");
  // listas de compra por assunto: com mais de uma, botões pra trocar
  const listas = (lista.listas || []).filter((l) => (lista.itens || []).some((i) => i.lista_id === l.id));
  const atual = listas.find((l) => l.id === estadoEsc.lista[codigo]) || listas[0] || null;
  const trocar = listas.length > 1 ? `<div class="esc-listas">${listas.map((l) => `<button class="btn peq${l === atual ? "" : " o"}" data-esc-acao="lista" data-esc-projeto="${esc(codigo)}" data-esc-lista="${esc(l.id)}">${esc(l.nome)}</button>`).join("")}</div>` : "";
  const sobre = atual ? `<div class="mini" style="margin-top:10px">${esc([listas.length > 1 ? "" : atual.nome, atual.comprador ? "Compra: " + atual.comprador : ""].filter(Boolean).join(" · "))}</div>` : "";
  const grupos = {};
  (lista.itens || []).filter((i) => !atual || i.lista_id === atual.id).forEach((i) => { const a = i.ambiente || "Geral"; (grupos[a] = grupos[a] || []).push(i); });
  const nomes = Object.keys(grupos).sort((a, b) => (a === "Geral" ? -1 : b === "Geral" ? 1 : a.localeCompare(b, "pt-BR")));
  const cartao = (i) => `<div class="card"><div class="t"><b>${esc(i.item)}</b>
    ${i.medidas ? `<div class="esc-medidas">${esc(i.medidas)}</div>` : ""}<div class="p">${esc([i.quantidade, i.comprador ? "Compra: " + i.comprador : ""].filter(Boolean).join(" · "))}</div>
    ${i.observacao ? `<div class="p">${esc(i.observacao)}</div>` : ""}</div>
    ${(i.fotos || []).length ? `<div class="esc-fotos">${i.fotos.map((f) => escImagem(entrada.pasta, f, "esc-foto")).join("")}</div>` : ""}
    ${(i.escolhas || []).map((e) => escCartaoEscolha(codigo, entrada.pasta, i, e)).join("")}
    <button class="btn" data-esc-acao="anotar" data-esc-item="${esc(i.id)}" data-esc-projeto="${esc(codigo)}">+ Anotar escolha</button></div>`;
  return conexao + topo + trocar + sobre + (nomes.map((a) => `<h2 class="sec">${esc(a)}</h2>${grupos[a].map(cartao).join("")}`).join("") || '<div class="vazio">A lista está vazia.</div>');
}

// ---------------------------------------------------------------- anotar
function escPor(operacao) {
  const g = escGuardado();
  g.fila.push(Object.assign({ op: escId(), enviado: false }, operacao));
  escGravar(g);
  desenhar();
  escEnviarFila();
}
function escReduzir(arquivo) {
  return new Promise((ok, erro) => {
    const url = URL.createObjectURL(arquivo), im = new Image();
    im.onload = () => {
      const f = Math.min(1, LADO_FOTO_ESCOLHA / Math.max(im.width, im.height)), tela = document.createElement("canvas");
      tela.width = Math.round(im.width * f); tela.height = Math.round(im.height * f);
      tela.getContext("2d").drawImage(im, 0, 0, tela.width, tela.height);
      URL.revokeObjectURL(url);
      tela.toBlob((b) => (b ? b.arrayBuffer().then(ok, erro) : erro(new Error("Não consegui preparar a foto."))), "image/jpeg", 0.75);
    };
    im.onerror = () => { URL.revokeObjectURL(url); erro(new Error("Não consegui abrir a foto.")); };
    im.src = url;
  });
}
function escFormulario(codigo, itemId, escolhaId) {
  const entrada = escEntrada(codigo), lista = escListaComFila(codigo);
  const item = lista && (lista.itens || []).find((i) => i.id === itemId);
  if (!entrada || !item) return;
  const atual = (item.escolhas || []).find((e) => e.id === escolhaId) || null;
  const lojas = [].concat(...(lista.itens || []).map((i) => (i.escolhas || []).map((e) => e.loja))).filter(Boolean);
  const v = atual || { loja: lojas[lojas.length - 1] || "" };
  const campo = (id, rotulo, valor, dica) => `<label class="rot">${rotulo}</label><input class="campo" id="${id}" value="${esc(valor || "")}" placeholder="${esc(dica || "")}" autocomplete="off">`;
  abrirFolha(`${item.ambiente || ""} · ${item.item}`, `${item.medidas ? `<div class="esc-medidas">${esc(item.medidas)}</div>` : ""}
    <label class="btn o" style="margin-top:6px">Foto<input type="file" id="esc-foto-nova" accept="image/*" hidden></label><div class="mini" id="esc-foto-nome">${v.foto ? "Já tem foto (escolha outra pra trocar)." : ""}</div>
    ${campo("esc-nome", "Nome / referência", v.nome, "Ex.: linho areia")}${campo("esc-codigo", "Código", v.codigo)}${campo("esc-loja", "Loja", v.loja)}${campo("esc-preco", "Preço", v.preco, "Ex.: R$ 89,90 o metro")}${campo("esc-obs", "Observação", v.observacao)}
    <label class="esc-marcar"><input type="checkbox" id="esc-escolhida" ${v.escolhida ? "checked" : ""}> É a escolhida</label>`, "Salvar", () => {
    const arquivo = $("#esc-foto-nova").files[0];
    const t = (id) => ($(id).value || "").trim();
    const escolha = { id: atual ? atual.id : escId(), nome: t("#esc-nome"), codigo: t("#esc-codigo"), loja: t("#esc-loja"), preco: t("#esc-preco"), observacao: t("#esc-obs"),
      escolhida: $("#esc-escolhida").checked, foto: (atual && atual.foto) || "", em: escAgora() };
    if (!(escolha.nome || escolha.codigo || arquivo || atual)) { avisar("Anote ao menos o nome, o código ou uma foto."); return false; }
    const guardar = (fotoNova) => escPor({ codigo, pasta: entrada.pasta, item_id: itemId, escolha, foto_nova: fotoNova });
    if (!arquivo) { guardar(""); return true; }
    escolha.foto = `fotos/celular-${escolha.id}-${escId()}.jpg`;
    escReduzir(arquivo).then((bytes) => escGuardarFoto(entrada.pasta + "/" + escolha.foto, bytes)).then(() => guardar(escolha.foto)).catch((e) => avisar(e.message || String(e)));
    return true;
  });
}
function escAmpliar(src) {
  const v = document.createElement("div");
  v.className = "esc-visor";
  v.innerHTML = '<img alt="foto"><button class="btn o peq">Fechar</button>';
  v.querySelector("img").src = src;
  v.addEventListener("click", (e) => { if (e.target.tagName === "IMG") v.classList.toggle("amplo"); else v.remove(); });
  document.body.appendChild(v);
}

document.addEventListener("click", (e) => {
  const foto = e.target.closest("img[data-esc-foto]");
  if (foto) { e.stopPropagation(); if (foto.src) escAmpliar(foto.src); return; }
  const b = e.target.closest("[data-esc-acao]");
  if (!b) return;
  e.stopPropagation();
  const { escAcao: acao, escProjeto: codigo, escItem: itemId, escEscolha: escolhaId } = b.dataset;
  if (acao === "lista") { estadoEsc.lista[codigo] = b.dataset.escLista; desenhar(); return; }
  if (acao === "atualizar") { if (!rvConectado()) { avisar("Conecte o Dropbox primeiro (botão acima)."); return; } escSincronizar(codigo, true); desenhar(); return; }
  if (acao === "anotar" || acao === "editar") { escFormulario(codigo, itemId, escolhaId); return; }
  const entrada = escEntrada(codigo), lista = escListaComFila(codigo);
  const item = lista && (lista.itens || []).find((i) => i.id === itemId), escolha = item && (item.escolhas || []).find((x) => x.id === escolhaId);
  if (!entrada || !escolha) return;
  if (acao === "apagar") { if (confirm("Apagar esta anotação?")) escPor({ codigo, pasta: entrada.pasta, item_id: itemId, remover: escolhaId }); return; }
  const marcada = Object.assign({}, escolha, { escolhida: !escolha.escolhida, em: escAgora() });
  delete marcada.esperando;
  escPor({ codigo, pasta: entrada.pasta, item_id: itemId, escolha: marcada });
}, true);
document.addEventListener("change", (e) => {
  if (e.target && e.target.id === "esc-foto-nova" && e.target.files[0]) $("#esc-foto-nome").textContent = "Foto escolhida: " + e.target.files[0].name;
});
window.addEventListener("online", () => escEnviarFila());
setTimeout(() => escEnviarFila(), 4000);
