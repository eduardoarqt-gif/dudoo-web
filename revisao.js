/* Dudoo Web — Revisar PDF (Ferramentas → Revisar PDF). 30/10/2026, Eduardo: corrigir projetos no iPad — abrir o último PDF gerado pelo Dudoo (ou um arquivo)
   e anotar/desenhar por cima com o Apple Pencil; o resultado volta pro Dropbox do projeto, em PROJETO/PDF/A revisar, como "<nome> - A REVISAR.pdf".
   Reaproveita o motor de desenho do Quadro (quadro.js): cada página do PDF é uma página do Quadro com o PDF renderizado de fundo (PDF.js) e os traços em
   vetor por cima. Ao salvar, o iPad cola os traços no PDF original (pdf-lib), sem passar pelo Wix — o arquivo vai direto pro Dropbox (API, autorização
   própria do iPad, código colado como no Dudoo do computador). Sem conexão com o Dropbox, o PDF anotado sai pela folha de compartilhar do iPad. */
"use strict";

const CHAVE_DBX = "dudoo_web_dbx";
const BD_PDFS = { nome: "dudoo_web_pdfs", loja: "pdfs" };
const URL_PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const URL_PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const URL_PDFLIB = "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
const LADO_LONGO_LOGICO = 1600;                // a página do Quadro (unidades lógicas) tem o lado maior assim
const LADO_LONGO_IMAGEM = 3200;                // pixels do PDF renderizado de fundo (dá pra ampliar bem na planta)
const ESCOPOS_DBX = "files.content.read files.content.write";
const SUFIXO_REVISAO = " - A REVISAR";

const estadoRevisao = { docs: {}, blobs: new Map(), scripts: {}, verificador: "", baixando: "" };

// ---------------------------------------------------------------- carregar bibliotecas (só quando precisa)
function rvCarregarScript(url) {
  if (estadoRevisao.scripts[url]) return estadoRevisao.scripts[url];
  estadoRevisao.scripts[url] = new Promise((ok, erro) => {
    const s = document.createElement("script");
    s.src = url; s.onload = () => ok(); s.onerror = () => { delete estadoRevisao.scripts[url]; erro(new Error("Sem conexão pra carregar o leitor de PDF. Tente de novo com internet.")); };
    document.head.appendChild(s);
  });
  return estadoRevisao.scripts[url];
}
async function rvPdfJs() {
  await rvCarregarScript(URL_PDFJS);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL_PDFJS_WORKER;
  return window.pdfjsLib;
}

// ---------------------------------------------------------------- guardar o PDF original no iPad (IndexedDB)
function rvAbrirBd() {
  return new Promise((ok, erro) => {
    if (!window.indexedDB) { erro(new Error("sem IndexedDB")); return; }
    const r = indexedDB.open(BD_PDFS.nome, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(BD_PDFS.loja);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  });
}
async function rvGuardarBytes(id, bytes) {
  const bd = await rvAbrirBd();
  await new Promise((ok, erro) => { const t = bd.transaction(BD_PDFS.loja, "readwrite"); t.objectStore(BD_PDFS.loja).put(bytes, id); t.oncomplete = ok; t.onerror = () => erro(t.error); });
}
async function rvLerBytes(id) {
  const bd = await rvAbrirBd();
  return new Promise((ok) => { const r = bd.transaction(BD_PDFS.loja).objectStore(BD_PDFS.loja).get(id); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); });
}
async function rvApagarBytes(id) {
  try { const bd = await rvAbrirBd(); bd.transaction(BD_PDFS.loja, "readwrite").objectStore(BD_PDFS.loja).delete(id); } catch (e) { /* segue */ }
  delete estadoRevisao.docs[id];
}

// ---------------------------------------------------------------- Dropbox (API direto do iPad; autorização com código colado, PKCE, sem segredo)
const rvDbx = () => ler(CHAVE_DBX, { refresh: "", access: "", expira: 0 });
const rvAppKey = () => ((estado.dados && estado.dados.revisao_pdf) || {}).app_key || "";
const rvConectado = () => !!(rvDbx().refresh && rvAppKey());
const rvBase64Url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
// Cabeçalho Dropbox-API-Arg só aceita ASCII: acentos viram \uXXXX.
const rvJsonAscii = (o) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4));

async function rvIniciarAutorizacao() {
  const chave = rvAppKey();
  if (!chave) { avisar("O Dudoo ainda não mandou a chave do Dropbox. Abra o Dudoo no computador e atualize."); return; }
  const verificador = rvBase64Url(crypto.getRandomValues(new Uint8Array(48)));
  const desafio = rvBase64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador)));
  estadoRevisao.verificador = verificador;
  const url = "https://www.dropbox.com/oauth2/authorize?" + new URLSearchParams({ client_id: chave, response_type: "code", token_access_type: "offline",
    code_challenge: desafio, code_challenge_method: "S256", scope: ESCOPOS_DBX }).toString();
  window.open(url, "_blank");
  abrirFolha("Conectar o Dropbox", `<div class="mini">Autorize na página do Dropbox que abriu (conta do escritório). Ele mostra um código: copie e cole aqui.</div>
    <label class="rot">Código do Dropbox</label><input class="campo" id="rv-codigo" autocomplete="off" autocapitalize="off">`, "Conectar", () => {
    const codigo = ($("#rv-codigo").value || "").trim();
    if (!codigo) return false;
    rvConcluirAutorizacao(codigo);
    return true;
  });
}
async function rvConcluirAutorizacao(codigo) {
  try {
    const r = await fetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: codigo, grant_type: "authorization_code", client_id: rvAppKey(), code_verifier: estadoRevisao.verificador }) });
    const j = await r.json();
    if (!r.ok || !j.refresh_token) throw new Error(j.error_description || j.error || "O Dropbox não aceitou o código.");
    gravar(CHAVE_DBX, { refresh: j.refresh_token, access: j.access_token, expira: Date.now() + (j.expires_in || 14000) * 1000 - 60000 });
    avisar("Dropbox conectado.");
    desenhar();
  } catch (e) { avisar("Não consegui conectar: " + (e.message || e)); }
}
async function rvToken(forcar) {
  const c = rvDbx();
  if (!forcar && c.access && Date.now() < c.expira) return c.access;
  if (!c.refresh) throw new Error("Conecte o Dropbox primeiro.");
  const r = await fetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: c.refresh, client_id: rvAppKey() }) });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error("O Dropbox pediu pra conectar de novo.");
  gravar(CHAVE_DBX, { refresh: c.refresh, access: j.access_token, expira: Date.now() + (j.expires_in || 14000) * 1000 - 60000 });
  return j.access_token;
}
function rvErroDbx(texto) {
  if (/missing_scope|files\.content/.test(texto)) return "O Dropbox ainda não liberou ler/gravar arquivos pro app. No computador: dropbox.com/developers/apps → o app do Dudoo → Permissions → ligue files.content.read e files.content.write → Submit. Depois conecte de novo aqui.";
  if (/not_found/.test(texto)) return "O arquivo não está mais no Dropbox (ou ainda está subindo do computador).";
  return "Dropbox: " + texto.slice(0, 160);
}
async function rvChamarDbx(url, opcoes) {
  let token = await rvToken(false);
  let r = await fetch(url, Object.assign({}, opcoes, { headers: Object.assign({}, opcoes.headers, { Authorization: "Bearer " + token }) }));
  if (r.status === 401) { token = await rvToken(true); r = await fetch(url, Object.assign({}, opcoes, { headers: Object.assign({}, opcoes.headers, { Authorization: "Bearer " + token }) })); }
  if (!r.ok) throw new Error(rvErroDbx(await r.text().catch(() => "")));
  return r;
}
async function rvBaixar(caminho) {
  const r = await rvChamarDbx("https://content.dropboxapi.com/2/files/download", { method: "POST", headers: { "Dropbox-API-Arg": rvJsonAscii({ path: caminho }) } });
  return r.arrayBuffer();
}
async function rvEnviar(caminho, bytes) {
  const r = await rvChamarDbx("https://content.dropboxapi.com/2/files/upload", { method: "POST", headers: { "Content-Type": "application/octet-stream",
    "Dropbox-API-Arg": rvJsonAscii({ path: caminho, mode: "add", autorename: true, mute: true }) }, body: bytes });
  return r.json();
}

// ---------------------------------------------------------------- tela (Ferramentas → Revisar PDF)
const rvDados = () => (estado.dados && estado.dados.revisao_pdf) || {};
const rvRascunhosPdf = () => rascunhos().filter((q) => q.tipo === "pdf");
function rvDataHora(iso) { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }

function telaRevisar() {
  const d = rvDados(), pdfs = d.pdfs || [], meus = rvRascunhosPdf();
  const conexao = !d.app_key ? `<div class="vazio">O Dudoo do computador ainda não mandou a chave do Dropbox. Abra o Dudoo e atualize.</div>`
    : rvConectado() ? `<div class="card"><div class="linha"><div class="t"><b>Dropbox conectado</b><div class="p">Os PDFs são baixados e o resultado volta pra pasta A revisar do projeto.</div></div>
        <button class="btn o peq" data-rv-acao="reconectar">Reconectar</button></div></div>`
    : `<div class="card"><div class="t"><b>Conectar o Dropbox</b><div class="p">Uma vez só: libera baixar o PDF e guardar o revisado.</div></div><button class="btn" data-rv-acao="conectar" style="margin-top:8px">Conectar o Dropbox</button></div>`;
  const cartaoPdf = (p, i) => `<div class="card toque" data-rv-pdf="${i}"><div class="linha"><div class="t"><b>${esc(p.nome)}</b>
      <div class="p">${esc(p.projeto)} · ${esc(rvDataHora(p.em))} · ${Math.round(p.kb / 1024 * 10) / 10 > 1 ? (p.kb / 1024).toFixed(1) + " MB" : p.kb + " KB"}</div></div>
      <button class="btn peq">${estadoRevisao.baixando === p.path ? "Baixando…" : "Abrir"}</button></div></div>`;
  const cartaoMeu = (q) => `<div class="card toque" data-rv-abrir="${esc(q.local_id)}"><div class="linha"><div class="t"><b>${esc(q.titulo)}</b>
      <div class="p">${q.paginas.filter((p) => p.itens.length).length} de ${q.paginas.length} página(s) anotada(s)${q.projeto ? " · " + esc(q.projeto) : ""} · ${q.enviado_em ? "salvo no Dropbox " + esc(rvDataHora(q.enviado_em)) : "ainda não salvo"}</div></div>
      <button class="btn o peq" data-rv-apagar="${esc(q.local_id)}">Apagar</button></div></div>`;
  return `<h2 class="sec" style="margin-top:14px">Revisar PDF</h2>${conexao}
    <div class="linha" style="gap:8px;margin-top:8px"><label class="btn o" style="flex:1;text-align:center">+ Adicionar arquivo<input type="file" id="rv-arquivo" accept="application/pdf,.pdf" hidden></label></div>
    <h2 class="sec">PDFs recentes do Dudoo · ${pdfs.length}</h2>${pdfs.map(cartaoPdf).join("") || '<div class="vazio">Nenhum PDF recente. Gere um no Dudoo (relações, demonstrativo…) e atualize.</div>'}
    <h2 class="sec">Revisões neste iPad · ${meus.length}</h2>${meus.map(cartaoMeu).join("") || '<div class="vazio">Nenhuma revisão em andamento.</div>'}
    <div class="mini" style="margin-top:6px">Anote com o Apple Pencil (toque no ✎ pra ver as ferramentas) e toque em ✓ pra guardar em PROJETO/PDF/A revisar do projeto.</div>`;
}

document.addEventListener("click", async (e) => {
  const q = (s) => e.target.closest(s);
  let el;
  if ((el = q("[data-rv-acao]"))) { if (el.dataset.rvAcao === "conectar" || el.dataset.rvAcao === "reconectar") rvIniciarAutorizacao(); return; }
  if ((el = q("[data-rv-apagar]"))) {
    e.stopPropagation();
    const id = el.dataset.rvApagar;
    if (confirm("Apagar esta revisão do iPad? (O que já foi salvo no Dropbox continua lá.)")) { gravarRascunhos(rascunhos().filter((x) => x.local_id !== id)); rvApagarBytes(id); desenhar(); }
    return;
  }
  if ((el = q("[data-rv-abrir]"))) { rvAbrirRascunho(el.dataset.rvAbrir); return; }
  if ((el = q("[data-rv-pdf]"))) { rvAbrirRecente((rvDados().pdfs || [])[+el.dataset.rvPdf]); return; }
}, true);
document.addEventListener("change", (e) => {
  if (e.target && e.target.id === "rv-arquivo" && e.target.files && e.target.files[0]) { const f = e.target.files[0]; e.target.value = ""; rvEscolherProjeto(f); }
});

// ---------------------------------------------------------------- abrir um PDF
function rvProjetoDoCaminho(caminho) {
  const lista = rvDados().projetos || [];
  return lista.find((p) => String(caminho).toLowerCase().startsWith((p.pasta + "/").toLowerCase())) || null;
}
async function rvAbrirRecente(p) {
  if (!p) return;
  if (!rvConectado()) { avisar("Conecte o Dropbox primeiro (botão acima)."); return; }
  if (estadoRevisao.baixando) return;
  estadoRevisao.baixando = p.path; desenhar();
  try {
    avisar("Baixando o PDF…");
    const bytes = await rvBaixar(p.path);
    const proj = rvProjetoDoCaminho(p.path);
    await rvCriarRevisao(bytes, { nome: p.nome, caminho: p.path, projetoPasta: proj ? proj.pasta : "", projeto: p.projeto });
  } catch (e) { avisar(e.message || String(e)); }
  estadoRevisao.baixando = ""; desenhar();
}
function rvEscolherProjeto(arquivo) {
  const projetos = rvDados().projetos || [];
  if (!projetos.length) { avisar("O Dudoo ainda não mandou a lista de projetos. Abra o Dudoo no computador e atualize."); return; }
  const opcoes = projetos.map((p) => `<option value="${esc(p.codigo)}">${esc(p.codigo)} ${esc(p.nome)}</option>`).join("");
  abrirFolha("Revisar arquivo", `<div class="mini"><b>${esc(arquivo.name)}</b></div><label class="rot">Projeto (onde o revisado vai ficar guardado)</label><select class="campo" id="rv-proj">${opcoes}</select>`, "Abrir", () => {
    const proj = projetos.find((p) => p.codigo === $("#rv-proj").value);
    rvLerArquivo(arquivo).then((bytes) => rvCriarRevisao(bytes, { nome: arquivo.name, caminho: "", projetoPasta: proj ? proj.pasta : "", projeto: proj ? proj.codigo : "" }))
      .catch((e) => avisar(e.message || String(e)));
    return true;
  });
}
const rvLerArquivo = (arquivo) => arquivo.arrayBuffer();

async function rvCriarRevisao(bytes, origem) {
  const pdfjs = await rvPdfJs();
  const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  const paginas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const vp = (await doc.getPage(i)).getViewport({ scale: 1 }), f = LADO_LONGO_LOGICO / Math.max(vp.width, vp.height);
    paginas.push({ itens: [], dim: [Math.round(vp.width * f * 10) / 10, Math.round(vp.height * f * 10) / 10], fundo_pdf: i - 1 });
  }
  const id = novoLocalId(), titulo = origem.nome.replace(/\.pdf$/i, "");
  await rvGuardarBytes(id, bytes);
  estadoRevisao.docs[id] = doc;
  const lista = rascunhos();
  lista.unshift({ local_id: id, tipo: "pdf", titulo, projeto: origem.projeto || "", formato: "paisagem", paginas,
    pdf: { nome: origem.nome, caminho: origem.caminho, projeto_pasta: origem.projetoPasta, paginas: doc.numPages }, pendente: true, atualizado: new Date().toISOString() });
  gravarRascunhos(lista);
  abrirQuadro(id);
}
async function rvAbrirRascunho(id) {
  const q = rascunhos().find((x) => x.local_id === id);
  if (!q) return;
  if (!(await rvDocDe(q))) { avisar("O PDF original não está mais neste iPad. Apague esta revisão e abra o arquivo de novo."); return; }
  abrirQuadro(id);
}
async function rvDocDe(q) {
  if (estadoRevisao.docs[q.local_id]) return estadoRevisao.docs[q.local_id];
  const bytes = await rvLerBytes(q.local_id);
  if (!bytes) return null;
  const pdfjs = await rvPdfJs();
  return (estadoRevisao.docs[q.local_id] = await pdfjs.getDocument({ data: bytes.slice(0) }).promise);
}

// ---------------------------------------------------------------- fundo da página (chamado pelo Quadro)
async function carregarFundoPdf(i, pg) {
  const eq = estadoQuadro, q = eq.aberto;
  for (const k of Object.keys(eq.imagensFundo)) if (+k !== i) delete eq.imagensFundo[k];         // só a página atual fica decodificada (memória do iPad)
  try {
    const chave = q.local_id + "|" + pg.fundo_pdf;
    let url = estadoRevisao.blobs.get(chave);
    if (!url) {
      avisoQuadro("Carregando a página…");
      const doc = await rvDocDe(q);
      if (!doc) { avisoQuadro("PDF original não encontrado neste iPad.", 4000); return; }
      const pagina = await doc.getPage(pg.fundo_pdf + 1), base = pagina.getViewport({ scale: 1 });
      const vp = pagina.getViewport({ scale: Math.min(LADO_LONGO_IMAGEM / Math.max(base.width, base.height), 6) });
      const tela = document.createElement("canvas"); tela.width = Math.round(vp.width); tela.height = Math.round(vp.height);
      const g = tela.getContext("2d"); g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, tela.width, tela.height);
      await pagina.render({ canvasContext: g, viewport: vp }).promise;
      const blob = await new Promise((ok) => tela.toBlob(ok, "image/jpeg", 0.92));
      url = URL.createObjectURL(blob);
      estadoRevisao.blobs.set(chave, url);
      if (estadoRevisao.blobs.size > 6) { const velho = estadoRevisao.blobs.keys().next().value; URL.revokeObjectURL(estadoRevisao.blobs.get(velho)); estadoRevisao.blobs.delete(velho); }
      avisoQuadro("", 1);
    }
    if (eq.aberto === q && eq.pagina === i) usarImagemFundo(i, url);
  } catch (e) { avisoQuadro("Não consegui desenhar a página: " + (e.message || e), 5000); }
}

// ---------------------------------------------------------------- salvar: colar os traços no PDF original e mandar pro Dropbox
const rvHex = (hex) => { const h = String(hex || "#000000").replace("#", ""); return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]; };
const rvTextoSeguro = (t) => String(t).replace(/[^ -ÿ\n]/g, "?");        // fonte padrão do PDF só tem Latin-1 (acentos do português cabem)

function rvDesenharItem(P, pagina, vp, escala, fonte, it) {
  const rgb = rvHex(it.cor), cor = P.rgb(rgb[0], rgb[1], rgb[2]);
  const pt = (x, y) => { const [px, py] = vp.convertToPdfPoint(x, y); return { x: px, y: py }; };
  const esp = Math.max(0.3, (it.espessura || 3) / escala), opac = it.tipo === "marcador" ? 0.45 : 1;
  const linha = (a, b) => pagina.drawLine({ start: pt(a[0], a[1]), end: pt(b[0], b[1]), thickness: esp, color: cor, opacity: opac, lineCap: P.LineCapStyle.Round });
  if (it.tipo === "lapis" || it.tipo === "marcador") {
    const pts = it.pontos || [];
    if (pts.length === 1) linha(pts[0], [pts[0][0] + 0.01, pts[0][1]]);
    if (it.tipo === "marcador" && pts.length > 1) {                                  // um traço só (sem sobreposição que escurece as juntas): caminho SVG
      const c = pts.map((p) => pt(p[0], p[1]));
      pagina.drawSvgPath("M " + c.map((p) => `${p.x.toFixed(2)} ${(-p.y).toFixed(2)}`).join(" L "), { x: 0, y: 0, borderColor: cor, borderWidth: esp, borderOpacity: opac, borderLineCap: P.LineCapStyle.Butt });
    } else for (let i = 0; i < pts.length - 1; i++) linha(pts[i], pts[i + 1]);
  } else if (it.tipo === "linha" || it.tipo === "seta") {
    linha([it.x1, it.y1], [it.x2, it.y2]);
    if (it.tipo === "seta") {
      const a = Math.atan2(it.y2 - it.y1, it.x2 - it.x1), t = 10 + (it.espessura || 4) * 2.2;
      linha([it.x2, it.y2], [it.x2 - t * Math.cos(a - 0.45), it.y2 - t * Math.sin(a - 0.45)]);
      linha([it.x2, it.y2], [it.x2 - t * Math.cos(a + 0.45), it.y2 - t * Math.sin(a + 0.45)]);
    }
  } else if (it.tipo === "retangulo") {
    const c = [[it.x, it.y], [it.x + it.w, it.y], [it.x + it.w, it.y + it.h], [it.x, it.y + it.h]];
    for (let i = 0; i < 4; i++) linha(c[i], c[(i + 1) % 4]);
  } else if (it.tipo === "elipse") {
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2, rx = Math.abs(it.w / 2), ry = Math.abs(it.h / 2), n = 48;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2; linha([cx + rx * Math.cos(a), cy + ry * Math.sin(a)], [cx + rx * Math.cos(b), cy + ry * Math.sin(b)]); }
  } else if (it.tipo === "texto") {
    const tam = (it.tamanho || 28) / escala;
    String(it.texto || "").split("\n").forEach((l, i) => {
      const p = pt(it.x, it.y + (i * 1.25 * (it.tamanho || 28)) + (it.tamanho || 28) * 0.85);
      pagina.drawText(rvTextoSeguro(l), { x: p.x, y: p.y, size: tam, font: fonte, color: cor, rotate: P.degrees((vp.rotation || 0) % 360) });   // página girada: o texto gira junto, pra ler em pé na tela
    });
  }
}

async function rvMontarPdf(q) {
  await rvCarregarScript(URL_PDFLIB);
  const P = window.PDFLib, bytes = await rvLerBytes(q.local_id), doc = await rvDocDe(q);
  if (!bytes || !doc) throw new Error("O PDF original não está neste iPad.");
  const pdf = await P.PDFDocument.load(bytes, { ignoreEncryption: true }), fonte = await pdf.embedFont(P.StandardFonts.Helvetica), paginas = pdf.getPages();
  let anotadas = 0;
  for (let i = 0; i < q.paginas.length; i++) {
    const itens = q.paginas[i].itens;
    if (!itens.length || !paginas[i]) continue;
    const pj = await doc.getPage(i + 1), base = pj.getViewport({ scale: 1 }), escala = LADO_LONGO_LOGICO / Math.max(base.width, base.height), vp = pj.getViewport({ scale: escala });
    for (const it of itens) rvDesenharItem(P, paginas[i], vp, escala, fonte, it);
    anotadas++;
  }
  if (!anotadas) throw new Error("Nenhuma página foi anotada ainda.");
  return { bytes: await pdf.save(), anotadas };
}
const rvNomeSaida = (q) => String(q.pdf.nome || q.titulo).replace(/\.pdf$/i, "").replace(/\s*-\s*A REVISAR$/i, "") + SUFIXO_REVISAO + ".pdf";

async function salvarRevisaoPdf() {
  const q = estadoQuadro.aberto; if (!q) return;
  salvarRascunho(false);
  try {
    avisoQuadro("Montando o PDF com as suas anotações…");
    const { bytes, anotadas } = await rvMontarPdf(q), nome = rvNomeSaida(q);
    if (window.__revisaoTeste) { window.__revisaoTeste.saida = { nome, bytes }; avisoQuadro("(teste) PDF montado.", 2500); return; }
    let guardado = false;
    if (rvConectado() && q.pdf.projeto_pasta) {
      try {
        avisoQuadro("Guardando no Dropbox…");
        const meta = await rvEnviar(`${q.pdf.projeto_pasta}/PROJETO/PDF/A revisar/${nome}`, bytes);
        q.enviado_em = new Date().toISOString(); q.pendente = false; salvarRascunho(false);
        guardado = true;
        avisar(`${anotadas} página(s) anotada(s). Salvo no Dropbox: PROJETO/PDF/A revisar/${meta.name || nome}`);
        fecharQuadro(false);
      } catch (e) { avisoQuadro(e.message || String(e), 7000); }
    }
    if (!guardado) await rvCompartilhar(bytes, nome, !q.pdf.projeto_pasta ? "Projeto não identificado: o PDF sai pela folha de compartilhar." : "");
  } catch (e) { avisoQuadro(e.message || String(e), 6000); }
}
async function rvCompartilhar(bytes, nome, motivo) {
  const arquivo = new File([bytes], nome, { type: "application/pdf" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) { await navigator.share({ files: [arquivo], title: nome }); avisoQuadro(motivo || "PDF compartilhado.", 3000); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  avisoQuadro(motivo || "PDF baixado neste iPad.", 3500);
}
