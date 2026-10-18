/* Dudoo Web — Quadro (Ferramentas → Quadro). 18/10/2026, Eduardo: desenhar à mão no iPhone (dedo ou Apple Pencil) e desenhar em cima das plantas de projeto.
   O desenho é uma lista de itens NO MESMO FORMATO do Quadro do Dudoo do computador (lápis, marcador, linha, seta, retângulo, elipse, texto), em unidades lógicas
   da página; cada página é mandada pelo comando `salvar_quadro_pagina`. Planta de fundo: o app só mostra uma prévia leve (pedida com `pedir_planta`); no Dudoo
   entra a planta real, na mesma posição, e o traço fica por cima. Tela inteira em branco: as ferramentas ficam recolhidas atrás de um botão. */
"use strict";

const CHAVE_QUADROS = "dudoo_web_quadros", CHAVE_SO_PENCIL = "dudoo_web_so_pencil";
const FORMATOS_QUADRO = { paisagem: [1600, 900], paisagem_a3: [1600, 1131], retrato_a3: [1131, 1600], quadrado: [1200, 1200] };
const CORES_QUADRO = ["#1F1E1B", "#5B5953", "#B24F39", "#E2572B", "#C9A24A", "#4C7A45", "#1F6FB5", "#76668A", "#FFFFFF", "#F5D547"];
const CORES_MARCADOR = ["#F5D547", "#9BE56B", "#6FD3F5", "#F59BC5", "#F5A74B"];
const ESPESSURAS = { lapis: [2, 4, 8], marcador: [18, 26, 40], forma: [3, 5, 9] };
const LIMITE_COMANDO_BYTES = 380000;                 // a fila do Wix guarda cada comando num item (~500 KB); acima disso, simplifica mais
const LIMITE_HISTORICO_QUADRO = 60;

const rascunhos = () => ler(CHAVE_QUADROS, []);
const gravarRascunhos = (lista) => gravar(CHAVE_QUADROS, lista);
const novoLocalId = () => "ip-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------------------------------------------------------------- geometria (a mesma conta do Dudoo: quadro_web_service.formato_pelo_aspecto / caixa_que_cabe)
function formatoPeloAspecto(largura, altura) {
  const a = largura / Math.max(1, altura);
  if (a < 0.85) return "retrato_a3";
  if (a < 1.2) return "quadrado";
  if (a < 1.55) return "paisagem_a3";
  return "paisagem";
}
function caixaQueCabe(lp, ap, li, ai) {
  const e = Math.min(lp / Math.max(1, li), ap / Math.max(1, ai));
  const w = li * e, h = ai * e;
  return { x: (lp - w) / 2, y: (ap - h) / 2, w, h };
}
// Douglas-Peucker: tira os pontos que não mudam o traço (o comando tem tamanho máximo).
function simplificarTraco(pts, tolerancia) {
  if (pts.length < 3) return pts.slice();
  const t2 = tolerancia * tolerancia;
  const manter = new Array(pts.length).fill(false);
  manter[0] = manter[pts.length - 1] = true;
  const pilha = [[0, pts.length - 1]];
  while (pilha.length) {
    const [a, b] = pilha.pop();
    let maior = 0, indice = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distSeg2(pts[i], pts[a], pts[b]);
      if (d > maior) { maior = d; indice = i; }
    }
    if (maior > t2 && indice > 0) { manter[indice] = true; pilha.push([a, indice], [indice, b]); }
  }
  return pts.filter((_p, i) => manter[i]);
}
function distSeg2(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], c2 = dx * dx + dy * dy;
  const t = c2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / c2));
  const x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1];
  return x * x + y * y;
}
const arred = (n) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- IndexedDB das prévias de planta (imagens não cabem no localStorage)
const BD_PLANTAS = { nome: "dudoo_web_plantas", loja: "plantas" };
function abrirBd() {
  return new Promise((ok, erro) => {
    if (!window.indexedDB) { erro(new Error("sem IndexedDB")); return; }
    const r = indexedDB.open(BD_PLANTAS.nome, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(BD_PLANTAS.loja);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  });
}
async function guardarPlanta(chave, imagem) {
  try { const bd = await abrirBd(); bd.transaction(BD_PLANTAS.loja, "readwrite").objectStore(BD_PLANTAS.loja).put(imagem, chave); } catch (e) { /* segue em memória */ }
  estadoQuadro.plantas[chave] = imagem;
}
async function lerPlanta(chave) {
  if (estadoQuadro.plantas[chave]) return estadoQuadro.plantas[chave];
  try {
    const bd = await abrirBd();
    const v = await new Promise((ok) => { const r = bd.transaction(BD_PLANTAS.loja).objectStore(BD_PLANTAS.loja).get(chave); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); });
    if (v) estadoQuadro.plantas[chave] = v;
    return v || null;
  } catch (e) { return null; }
}

const estadoQuadro = { aberto: null, pagina: 0, ferramenta: "lapis", cor: CORES_QUADRO[0], corMarcador: CORES_MARCADOR[0], largura: 1, soPencil: ler(CHAVE_SO_PENCIL, false),
  barra: false, plantas: {}, imagensFundo: {}, historico: [], refazer: [], zoom: 1, ox: 0, oy: 0, ponteiros: new Map(), traco: null, forma: null, gesto: null,
  ultimoPencil: 0, apagou: false, esperando: null, relogio: null };

// ---------------------------------------------------------------- lista (Ferramentas → Quadro)
function telaQuadroLista() {
  const lista = rascunhos(), doDudoo = (estado.dados && estado.dados.quadros) || [];
  const cartao = (q) => `<div class="card toque" data-quadro-abrir="${esc(q.local_id)}"><div class="linha"><div class="t"><b>${esc(q.titulo || "Quadro")}</b>
      <div class="p">${q.paginas.length} página(s)${q.projeto ? " · " + esc(q.projeto) : ""} · ${q.pendente ? "ainda não enviado" : "enviado ao Dudoo"}</div></div>
      <button class="btn o peq" data-quadro-apagar="${esc(q.local_id)}">Apagar</button></div></div>`;
  return `<div class="linha" style="margin-top:6px"><h2 class="sec" style="flex:1;margin:14px 0 8px">Desenhar</h2></div>
    <div class="linha" style="gap:8px"><button class="btn" data-acao="quadro-novo" style="flex:1">+ Novo quadro</button>
    <button class="btn o" data-acao="quadro-planta" style="flex:1">+ Sobre planta</button></div>
    <h2 class="sec">Meus desenhos neste iPhone · ${lista.length}</h2>${lista.map(cartao).join("") || '<div class="vazio">Nenhum desenho ainda.</div>'}
    <h2 class="sec">Quadros do Dudoo · ${doDudoo.length}</h2>
    ${doDudoo.map((q) => `<div class="card"><div class="t"><b>${esc(q.nome)}</b><div class="p">${q.paginas} página(s)${q.projeto ? " · " + esc(q.projeto) : ""}</div></div></div>`).join("") || '<div class="vazio">Nenhum quadro no Dudoo.</div>'}
    <div class="mini" style="margin-top:6px">Aqui você cria quadros novos e desenha sobre as plantas dos projetos. Editar um quadro que já existe no computador fica pro próximo passo.</div>`;
}

function novoRascunho(opcoes) {
  const retrato = window.innerHeight > window.innerWidth;
  const q = Object.assign({ local_id: novoLocalId(), titulo: "Quadro do iPhone " + new Date().toLocaleDateString("pt-BR"), projeto: "",
    formato: retrato ? "retrato_a3" : "paisagem_a3", paginas: [{ itens: [], fundo_planta: null }], pendente: true, atualizado: new Date().toISOString() }, opcoes || {});
  const lista = rascunhos(); lista.unshift(q); gravarRascunhos(lista);
  return q;
}

function escolherPlanta() {
  const d = estado.dados, disp = d.plantas_disponiveis || {};
  const projetos = (d.projetos || []).filter((p) => (disp[p.codigo] || []).length);
  if (!projetos.length) { avisar("Nenhum projeto com planta cadastrada no Dudoo ainda."); return; }
  const optProj = projetos.map((p) => `<option value="${esc(p.codigo)}">${esc(p.codigo)} ${esc(p.nome)}</option>`).join("");
  abrirFolha("Desenhar sobre a planta", `<label class="rot">Projeto</label><select class="campo" id="pl-proj">${optProj}</select>
    <label class="rot">Pavimento</label><select class="campo" id="pl-pav"></select>
    <div class="mini">O Dudoo do computador precisa estar aberto pra mandar a planta; o desenho entra por cima da planta real no Quadro do Dudoo.</div>`, "Abrir", () => {
    const projeto = $("#pl-proj").value, pavimento = $("#pl-pav").value;
    if (!projeto || !pavimento) return false;
    const proj = projetos.find((p) => p.codigo === projeto);
    const q = novoRascunho({ titulo: `${projeto} · ${pavimento}`, projeto, paginas: [{ itens: [], fundo_planta: { projeto, pavimento } }] });
    setTimeout(() => abrirQuadro(q.local_id), 200);
    return true;
  });
  const preencher = () => { $("#pl-pav").innerHTML = (disp[$("#pl-proj").value] || []).map((n) => `<option>${esc(n)}</option>`).join(""); };
  $("#pl-proj").addEventListener("change", preencher);
  preencher();
}

// ---------------------------------------------------------------- tela de desenho
function abrirQuadro(localId) {
  const q = rascunhos().find((x) => x.local_id === localId);
  if (!q) return;
  fecharQuadro(false);
  estadoQuadro.aberto = q; estadoQuadro.pagina = 0; estadoQuadro.historico = []; estadoQuadro.refazer = []; estadoQuadro.barra = false;
  const tela = document.createElement("div");
  tela.id = "qd";
  tela.innerHTML = `<canvas id="qd-c"></canvas>
    <button id="qd-menu" aria-label="Ferramentas do desenho">✎</button>
    <div id="qd-barra" hidden></div><div id="qd-aviso" hidden></div>`;
  document.body.appendChild(tela);
  document.body.classList.add("qd-aberto");
  ligarCanvas();
  redimensionarQuadro(true);
  desenharBarra();
  carregarFundoDaPagina();
  window.addEventListener("resize", aoRedimensionar);
}
function aoRedimensionar() { redimensionarQuadro(false); }

function fecharQuadro(salvar) {
  const q = estadoQuadro.aberto;
  if (q) {
    if (salvar !== false) salvarRascunho(true);
    clearInterval(estadoQuadro.relogio);
    window.removeEventListener("resize", aoRedimensionar);
  }
  const t = $("#qd"); if (t) t.remove();
  document.body.classList.remove("qd-aberto");
  estadoQuadro.aberto = null; estadoQuadro.esperando = null;
  if (q) desenhar();
}

const paginaAtual = () => estadoQuadro.aberto.paginas[estadoQuadro.pagina];
const dimensoesQuadro = () => FORMATOS_QUADRO[estadoQuadro.aberto.formato] || FORMATOS_QUADRO.paisagem;

function salvarRascunho(marcarPendente) {
  const q = estadoQuadro.aberto; if (!q) return;
  q.atualizado = new Date().toISOString();
  if (marcarPendente) q.pendente = true;
  const lista = rascunhos(); const i = lista.findIndex((x) => x.local_id === q.local_id);
  if (i >= 0) lista[i] = q; else lista.unshift(q);
  gravarRascunhos(lista);
}

function ligarCanvas() {
  const c = $("#qd-c");
  c.style.touchAction = "none";
  c.addEventListener("pointerdown", ponteiroBaixo);
  c.addEventListener("pointermove", ponteiroMove);
  c.addEventListener("pointerup", ponteiroCima);
  c.addEventListener("pointercancel", ponteiroCima);
  c.addEventListener("wheel", (e) => { e.preventDefault(); zoomEm(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  $("#qd-menu").addEventListener("click", () => { estadoQuadro.barra = !estadoQuadro.barra; desenharBarra(); });
}

function redimensionarQuadro(ajustar) {
  const c = $("#qd-c"); if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(window.innerWidth * dpr); c.height = Math.round(window.innerHeight * dpr);
  c.style.width = window.innerWidth + "px"; c.style.height = window.innerHeight + "px";
  if (ajustar) ajustarVista();
  pintarQuadro();
}
function ajustarVista() {
  const [w, h] = dimensoesQuadro(), margem = 6;
  const z = Math.min((window.innerWidth - 2 * margem) / w, (window.innerHeight - 2 * margem) / h);
  estadoQuadro.zoom = z; estadoQuadro.ox = (window.innerWidth - w * z) / 2; estadoQuadro.oy = (window.innerHeight - h * z) / 2;
  estadoQuadro.zoomBase = z;
}
const paraTela = (x, y) => [estadoQuadro.ox + x * estadoQuadro.zoom, estadoQuadro.oy + y * estadoQuadro.zoom];
const paraPagina = (px, py) => [(px - estadoQuadro.ox) / estadoQuadro.zoom, (py - estadoQuadro.oy) / estadoQuadro.zoom];
function zoomEm(px, py, fator) {
  const base = estadoQuadro.zoomBase || 1, novo = Math.max(base * 0.5, Math.min(base * 8, estadoQuadro.zoom * fator)), f = novo / estadoQuadro.zoom;
  estadoQuadro.ox = px - (px - estadoQuadro.ox) * f; estadoQuadro.oy = py - (py - estadoQuadro.oy) * f; estadoQuadro.zoom = novo;
  pintarQuadro();
}

// ---------------------------------------------------------------- pintura
function pintarQuadro() {
  const c = $("#qd-c"); if (!c || !estadoQuadro.aberto) return;
  const dpr = window.devicePixelRatio || 1, g = c.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--qd-fora").trim() || "#E4E2DC";
  g.fillRect(0, 0, c.width, c.height);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const [w, h] = dimensoesQuadro(), z = estadoQuadro.zoom;
  g.save();
  g.translate(estadoQuadro.ox, estadoQuadro.oy); g.scale(z, z);
  g.fillStyle = "#FFFFFF"; g.shadowColor = "rgba(0,0,0,.18)"; g.shadowBlur = 10 / z; g.fillRect(0, 0, w, h); g.shadowBlur = 0;
  g.beginPath(); g.rect(0, 0, w, h); g.clip();
  const fundo = estadoQuadro.imagensFundo[estadoQuadro.pagina];
  if (fundo) { const b = caixaQueCabe(w, h, fundo.naturalWidth, fundo.naturalHeight); g.drawImage(fundo, b.x, b.y, b.w, b.h); }
  const pg = paginaAtual();
  for (const it of pg.itens) pintarItem(g, it);
  if (estadoQuadro.traco) pintarItem(g, estadoQuadro.traco);
  if (estadoQuadro.forma) pintarItem(g, estadoQuadro.forma);
  g.restore();
}
function pintarItem(g, it) {
  g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = it.cor; g.fillStyle = it.cor; g.lineWidth = it.espessura || 3; g.globalAlpha = it.tipo === "marcador" ? 0.45 : (it.opacidade || 1);
  if (it.tipo === "lapis" || it.tipo === "marcador") {
    const p = it.pontos; if (!p.length) return;
    g.beginPath(); g.moveTo(p[0][0], p[0][1]);
    if (p.length === 1) g.lineTo(p[0][0] + 0.01, p[0][1]);
    for (let i = 1; i < p.length - 1; i++) { const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2; g.quadraticCurveTo(p[i][0], p[i][1], mx, my); }
    if (p.length > 1) g.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
    g.stroke();
  } else if (it.tipo === "linha" || it.tipo === "seta") {
    g.beginPath(); g.moveTo(it.x1, it.y1); g.lineTo(it.x2, it.y2); g.stroke();
    if (it.tipo === "seta") {
      const a = Math.atan2(it.y2 - it.y1, it.x2 - it.x1), t = 10 + (it.espessura || 4) * 2.2;
      g.beginPath(); g.moveTo(it.x2, it.y2); g.lineTo(it.x2 - t * Math.cos(a - 0.45), it.y2 - t * Math.sin(a - 0.45));
      g.moveTo(it.x2, it.y2); g.lineTo(it.x2 - t * Math.cos(a + 0.45), it.y2 - t * Math.sin(a + 0.45)); g.stroke();
    }
  } else if (it.tipo === "retangulo") { g.strokeRect(it.x, it.y, it.w, it.h); }
  else if (it.tipo === "elipse") { g.beginPath(); g.ellipse(it.x + it.w / 2, it.y + it.h / 2, Math.abs(it.w / 2), Math.abs(it.h / 2), 0, 0, Math.PI * 2); g.stroke(); }
  else if (it.tipo === "texto") {
    g.globalAlpha = 1; g.font = `${it.tamanho || 28}px Jost, -apple-system, sans-serif`; g.textBaseline = "top";
    String(it.texto || "").split("\n").forEach((linha, i) => g.fillText(linha, it.x, it.y + i * (it.tamanho || 28) * 1.25));
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------- ponteiros: desenhar, apagar, formas, gestos de 2 dedos
const espessuraAtual = () => {
  const f = estadoQuadro.ferramenta, i = estadoQuadro.largura;
  return (f === "lapis" ? ESPESSURAS.lapis : f === "marcador" ? ESPESSURAS.marcador : ESPESSURAS.forma)[i];
};
const corAtual = () => (estadoQuadro.ferramenta === "marcador" ? estadoQuadro.corMarcador : estadoQuadro.cor);

function empurrarHistorico() {
  const pg = paginaAtual();
  estadoQuadro.historico.push(JSON.stringify(pg.itens));
  if (estadoQuadro.historico.length > LIMITE_HISTORICO_QUADRO) estadoQuadro.historico.shift();
  estadoQuadro.refazer = [];
}

function ponteiroBaixo(e) {
  const eq = estadoQuadro;
  e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId);
  if (e.pointerType === "pen") eq.ultimoPencil = Date.now();
  if (e.pointerType === "touch" && (eq.soPencil || Date.now() - eq.ultimoPencil < 1500) && eq.ponteiros.size === 0 && e.isPrimary) {
    eq.ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY, tipo: "ignorado" });      // palma / dedo com o Pencil em uso: só conta pra gesto de 2 dedos
    return;
  }
  eq.ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY, tipo: e.pointerType });
  const validos = [...eq.ponteiros.values()].filter((p) => p.tipo === "touch" || p.tipo === "ignorado");
  if (validos.length >= 2) {                                                              // 2 dedos: mover e ampliar a página (cancela o traço em curso)
    eq.traco = null; eq.forma = null; eq.gesto = gestoInicial();
    pintarQuadro();
    return;
  }
  const [x, y] = paraPagina(e.clientX, e.clientY);
  const f = eq.ferramenta;
  if (f === "lapis" || f === "marcador") {
    eq.traco = { tipo: f, pontos: [[x, y]], cor: corAtual(), espessura: espessuraAtual(), opacidade: 1 };
  } else if (f === "borracha") {
    empurrarHistorico(); eq.apagou = false; apagarEm(x, y);
  } else if (f === "texto") {
    eq.ponteiros.delete(e.pointerId); pedirTexto(x, y);
  } else {
    eq.forma = { tipo: f, x1: x, y1: y, x2: x, y2: y, cor: corAtual(), espessura: espessuraAtual() };
  }
  pintarQuadro();
}
function gestoInicial() {
  const p = [...estadoQuadro.ponteiros.values()].slice(0, 2);
  return { d0: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, cx0: (p[0].x + p[1].x) / 2, cy0: (p[0].y + p[1].y) / 2, z0: estadoQuadro.zoom, ox0: estadoQuadro.ox, oy0: estadoQuadro.oy };
}
function ponteiroMove(e) {
  const eq = estadoQuadro, p = eq.ponteiros.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX; p.y = e.clientY;
  if (eq.gesto) {
    const dois = [...eq.ponteiros.values()].slice(0, 2); if (dois.length < 2) return;
    const g = eq.gesto, d = Math.hypot(dois[0].x - dois[1].x, dois[0].y - dois[1].y) || 1, cx = (dois[0].x + dois[1].x) / 2, cy = (dois[0].y + dois[1].y) / 2;
    const base = eq.zoomBase || 1, novo = Math.max(base * 0.5, Math.min(base * 8, g.z0 * d / g.d0)), f = novo / g.z0;
    eq.zoom = novo; eq.ox = cx - (g.cx0 - g.ox0) * f; eq.oy = cy - (g.cy0 - g.oy0) * f;
    pintarQuadro();
    return;
  }
  if (p.tipo === "ignorado") return;
  const eventos = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of (eventos.length ? eventos : [e])) {
    const [x, y] = paraPagina(ev.clientX, ev.clientY);
    if (eq.traco) {
      const ult = eq.traco.pontos[eq.traco.pontos.length - 1];
      if (Math.hypot(x - ult[0], y - ult[1]) * eq.zoom >= 1.5) eq.traco.pontos.push([x, y]);
    } else if (eq.forma) { eq.forma.x2 = x; eq.forma.y2 = y; if (ev.shiftKey && (eq.forma.tipo === "linha" || eq.forma.tipo === "seta")) alinharReta(eq.forma); }
    else if (eq.ferramenta === "borracha") apagarEm(x, y);
  }
  pintarQuadro();
}
function alinharReta(f) {
  const dx = f.x2 - f.x1, dy = f.y2 - f.y1, a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(dx, dy);
  f.x2 = f.x1 + l * Math.cos(a); f.y2 = f.y1 + l * Math.sin(a);
}
function ponteiroCima(e) {
  const eq = estadoQuadro;
  if (!eq.ponteiros.has(e.pointerId)) return;
  eq.ponteiros.delete(e.pointerId);
  if (eq.gesto) { if (eq.ponteiros.size < 2) eq.gesto = null; if (eq.ponteiros.size === 0) pintarQuadro(); return; }
  const pg = paginaAtual();
  if (eq.traco) {
    const t = eq.traco; eq.traco = null;
    empurrarHistorico();
    t.pontos = simplificarTraco(t.pontos, 0.5 / Math.max(0.2, eq.zoom / (eq.zoomBase || 1))).map((p) => [arred(p[0]), arred(p[1])]);
    pg.itens.push(t);
  } else if (eq.forma) {
    const f = eq.forma; eq.forma = null;
    if (Math.hypot(f.x2 - f.x1, f.y2 - f.y1) > 4) {
      empurrarHistorico();
      if (f.tipo === "retangulo" || f.tipo === "elipse") pg.itens.push({ tipo: f.tipo, x: Math.min(f.x1, f.x2), y: Math.min(f.y1, f.y2), w: Math.abs(f.x2 - f.x1), h: Math.abs(f.y2 - f.y1), cor: f.cor, espessura: f.espessura });
      else pg.itens.push({ tipo: f.tipo, x1: f.x1, y1: f.y1, x2: f.x2, y2: f.y2, cor: f.cor, espessura: f.espessura });
    }
  }
  salvarRascunho(true);
  pintarQuadro();
}

// ---------------------------------------------------------------- borracha (apaga o traço inteiro que o dedo toca) e texto
function distanciaAoItem(it, x, y) {
  if (it.tipo === "lapis" || it.tipo === "marcador") {
    let m = Infinity;
    for (let i = 0; i < it.pontos.length; i++) {
      const a = it.pontos[i], b = it.pontos[Math.min(i + 1, it.pontos.length - 1)];
      m = Math.min(m, Math.sqrt(distSeg2([x, y], a, b)) - (it.espessura || 3) / 2);
    }
    return m;
  }
  if (it.tipo === "linha" || it.tipo === "seta") return Math.sqrt(distSeg2([x, y], [it.x1, it.y1], [it.x2, it.y2])) - (it.espessura || 4) / 2;
  if (it.tipo === "retangulo" || it.tipo === "elipse") {
    const dx = Math.max(it.x - x, 0, x - (it.x + it.w)), dy = Math.max(it.y - y, 0, y - (it.y + it.h));
    const fora = Math.hypot(dx, dy);
    if (fora > 0) return fora;
    return Math.min(x - it.x, it.x + it.w - x, y - it.y, it.y + it.h - y);          // dentro: distância à borda
  }
  if (it.tipo === "texto") { const w = it.w || 300, h = (it.tamanho || 28) * 1.25 * String(it.texto || "").split("\n").length; return (x >= it.x && x <= it.x + w && y >= it.y && y <= it.y + h) ? 0 : 1e9; }
  return 1e9;
}
function apagarEm(x, y) {
  const pg = paginaAtual(), raio = 14 / estadoQuadro.zoom * (estadoQuadro.zoomBase || 1) + 4;
  const antes = pg.itens.length;
  pg.itens = pg.itens.filter((it) => distanciaAoItem(it, x, y) > raio);
  if (pg.itens.length !== antes) estadoQuadro.apagou = true;
}
function pedirTexto(x, y) {
  abrirFolha("Texto", `<textarea class="campo" id="qd-texto" style="min-height:120px" placeholder="Escreva e toque em Colocar"></textarea>`, "Colocar", () => {
    const texto = ($("#qd-texto").value || "").trim(); if (!texto) return false;
    empurrarHistorico();
    paginaAtual().itens.push({ tipo: "texto", x, y, w: 360, h: 80, texto, tamanho: 28, cor: estadoQuadro.cor });
    salvarRascunho(true); pintarQuadro();
  });
  setTimeout(() => { const t = $("#qd-texto"); if (t) t.focus(); }, 80);
}

// ---------------------------------------------------------------- barra de ferramentas recolhida (botão ✎ abre uma barra fina à esquerda)
const ICONES_Q = { lapis: "✏️", marcador: "🖍", borracha: "⌫", linha: "╱", seta: "➚", retangulo: "▭", elipse: "◯", texto: "T" };
function desenharBarra() {
  const b = $("#qd-barra"), eq = estadoQuadro; if (!b) return;
  b.hidden = !eq.barra;
  $("#qd-menu").classList.toggle("on", eq.barra);
  if (!eq.barra) return;
  const ferr = Object.keys(ICONES_Q).map((k) => `<button class="qd-b${eq.ferramenta === k ? " on" : ""}" data-qd-ferr="${k}" aria-label="${k}">${ICONES_Q[k]}</button>`).join("");
  const cores = (eq.ferramenta === "marcador" ? CORES_MARCADOR : CORES_QUADRO);
  const corSel = eq.ferramenta === "marcador" ? eq.corMarcador : eq.cor;
  const paleta = `<div class="qd-cores">${cores.map((c) => `<button class="qd-cor${c === corSel ? " on" : ""}" style="background:${c}" data-qd-cor="${c}" aria-label="cor ${c}"></button>`).join("")}</div>`;
  const larg = [0, 1, 2].map((i) => `<button class="qd-b${eq.largura === i ? " on" : ""}" data-qd-larg="${i}" aria-label="espessura ${i + 1}"><i style="height:${2 + i * 3}px"></i></button>`).join("");
  const n = eq.aberto.paginas.length;
  b.innerHTML = `${ferr}<hr>${larg}<hr>${paleta}<hr>
    <button class="qd-b" data-qd-acao="desfazer" aria-label="Desfazer">↶</button><button class="qd-b" data-qd-acao="refazer" aria-label="Refazer">↷</button>
    <button class="qd-b" data-qd-acao="ajustar" aria-label="Ajustar à tela">⤢</button><hr>
    <div class="qd-pag"><button class="qd-b" data-qd-acao="pag-menos">‹</button><span>${eq.pagina + 1}/${n}</span><button class="qd-b" data-qd-acao="pag-mais">›</button></div>
    <button class="qd-b" data-qd-acao="pag-nova" aria-label="Nova página">＋</button>
    <button class="qd-b${eq.soPencil ? " on" : ""}" data-qd-acao="so-pencil" aria-label="Só Apple Pencil" title="Só Apple Pencil">🖊</button><hr>
    <button class="qd-b ok" data-qd-acao="enviar" aria-label="Salvar e enviar ao Dudoo">✓</button><button class="qd-b" data-qd-acao="sair" aria-label="Fechar">✕</button>`;
}
function avisoQuadro(texto, ms) {
  const a = $("#qd-aviso"); if (!a) return;
  a.textContent = texto; a.hidden = false; clearTimeout(avisoQuadro.t);
  if (ms) avisoQuadro.t = setTimeout(() => { a.hidden = true; }, ms);
}

document.addEventListener("click", (e) => {
  const eq = estadoQuadro; if (!eq.aberto) return;
  const f = e.target.closest("[data-qd-ferr]"), c = e.target.closest("[data-qd-cor]"), l = e.target.closest("[data-qd-larg]"), a = e.target.closest("[data-qd-acao]");
  if (f) { eq.ferramenta = f.dataset.qdFerr; desenharBarra(); return; }
  if (c) { if (eq.ferramenta === "marcador") eq.corMarcador = c.dataset.qdCor; else eq.cor = c.dataset.qdCor; desenharBarra(); return; }
  if (l) { eq.largura = +l.dataset.qdLarg; desenharBarra(); return; }
  if (!a) return;
  const acao = a.dataset.qdAcao, pg = paginaAtual();
  if (acao === "desfazer" && eq.historico.length) { eq.refazer.push(JSON.stringify(pg.itens)); pg.itens = JSON.parse(eq.historico.pop()); salvarRascunho(true); pintarQuadro(); }
  else if (acao === "refazer" && eq.refazer.length) { eq.historico.push(JSON.stringify(pg.itens)); pg.itens = JSON.parse(eq.refazer.pop()); salvarRascunho(true); pintarQuadro(); }
  else if (acao === "ajustar") { ajustarVista(); pintarQuadro(); }
  else if (acao === "pag-menos" && eq.pagina > 0) { mudarPagina(eq.pagina - 1); }
  else if (acao === "pag-mais" && eq.pagina < eq.aberto.paginas.length - 1) { mudarPagina(eq.pagina + 1); }
  else if (acao === "pag-nova") { eq.aberto.paginas.push({ itens: [], fundo_planta: null }); salvarRascunho(true); mudarPagina(eq.aberto.paginas.length - 1); }
  else if (acao === "so-pencil") { eq.soPencil = !eq.soPencil; gravar(CHAVE_SO_PENCIL, eq.soPencil); desenharBarra(); avisoQuadro(eq.soPencil ? "Só o Apple Pencil desenha (dedo só move e amplia)." : "Dedo e Pencil desenham.", 2200); }
  else if (acao === "enviar") { enviarQuadro(); }
  else if (acao === "sair") { fecharQuadro(true); }
});

function mudarPagina(i) {
  const eq = estadoQuadro;
  eq.pagina = i; eq.historico = []; eq.refazer = [];
  carregarFundoDaPagina();
  desenharBarra(); pintarQuadro();
}

// ---------------------------------------------------------------- planta de fundo (prévia leve; no Dudoo entra a real)
async function carregarFundoDaPagina() {
  const eq = estadoQuadro, i = eq.pagina, pg = paginaAtual();
  delete eq.imagensFundo[i];
  clearInterval(eq.relogio); eq.esperando = null;
  if (!pg.fundo_planta) { pintarQuadro(); return; }
  const chave = `${pg.fundo_planta.projeto}|${pg.fundo_planta.pavimento}`;
  let url = await lerPlanta(chave);
  if (!url) {
    eq.esperando = chave;
    comando("pedir_planta", { projeto: pg.fundo_planta.projeto, pavimento: pg.fundo_planta.pavimento });
    avisoQuadro("Pedindo a planta ao Dudoo… (o Dudoo do computador precisa estar aberto)");
    eq.relogio = setInterval(async () => {                                              // a prévia chega na próxima foto do Dudoo
      await carregar(true);
      const v = await lerPlanta(chave);
      if (v) { clearInterval(eq.relogio); eq.esperando = null; usarImagemFundo(i, v); avisoQuadro("Planta recebida.", 1800); }
    }, 8000);
    pintarQuadro();
    return;
  }
  usarImagemFundo(i, url);
}
function usarImagemFundo(i, url) {
  const img = new Image();
  img.onload = () => { estadoQuadro.imagensFundo[i] = img; pintarQuadro(); };
  img.src = url;
}
// Chamado a cada foto nova do Dudoo: guarda as prévias de planta pedidas e avisa que chegaram (o Dudoo as tira da foto).
async function processarPlantasRecebidas(d) {
  for (const p of (d && d.plantas_pedidas) || []) {
    if (!p || !p.imagem) continue;
    await guardarPlanta(`${p.projeto}|${p.pavimento}`, p.imagem);
    comando("planta_recebida", { projeto: p.projeto, pavimento: p.pavimento });
  }
}

// ---------------------------------------------------------------- envio ao Dudoo (uma página por comando)
function itensDaPagina(pg, tolerancia) {
  return pg.itens.map((it) => ((it.tipo === "lapis" || it.tipo === "marcador") ? Object.assign({}, it, { pontos: simplificarTraco(it.pontos, tolerancia).map((p) => [arred(p[0]), arred(p[1])]) }) : it));
}
function enviarQuadro() {
  const q = estadoQuadro.aberto; if (!q) return;
  salvarRascunho(false);
  let enviados = 0;
  q.paginas.forEach((pg, indice) => {
    if (!pg.itens.length && !pg.fundo_planta && indice > 0) return;
    let itens = itensDaPagina(pg, 0.4), carga;
    for (let tol = 0.4; tol <= 6; tol *= 1.7) {                                        // simplifica mais até o comando caber
      itens = itensDaPagina(pg, tol);
      carga = { local_id: q.local_id, titulo: q.titulo, projeto: q.projeto, formato: q.formato, indice, itens, fundo_planta: pg.fundo_planta || null };
      if (JSON.stringify(carga).length <= LIMITE_COMANDO_BYTES) break;
    }
    comando("salvar_quadro_pagina", carga);
    enviados++;
  });
  q.pendente = false; salvarRascunho(false);
  avisar(enviados ? "Quadro enviado. O Dudoo guarda quando estiver aberto." : "Nada pra enviar ainda.");
  fecharQuadro(false);
}
