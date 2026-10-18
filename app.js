/* Dudoo Web — app único (PWA). Sem dependências. Abas: Hoje · Projetos · Portal · Financeiro · Mais.
   Dados: GET <base>/dudoo_web_snapshot ; comandos: POST <base>/dudoo_web_comando (fila local, reenviada quando houver rede).
   Sem conexão configurada o app abre em modo demonstração com dados de exemplo. */
"use strict";

const CHAVE_CFG = "dudoo_web_cfg", CHAVE_FILA = "dudoo_web_fila", CHAVE_DADOS = "dudoo_web_dados", CHAVE_CRED = "dudoo_web_cred", CHAVE_PIN = "dudoo_web_pin", CHAVE_NOTAS_VISTAS = "dudoo_web_notas_vistas";
const $ = (s) => document.querySelector(s);
const ler = (k, padrao) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento: segue em memória */ } };
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso) => { const [a, m, d] = String(iso || "").split("-"); return d ? `${d}/${m}` : ""; };

const estado = {
  aba: "hoje", projeto: null, subProjeto: "resumo", subPortal: "entregas", fin: "escritorio", finSub: "receber",
  filtroNotas: "__todas", dados: null, demo: true, fila: ler(CHAVE_FILA, []), liberado: false, liberadoEm: 0, ultimaAtualizacao: "", mes: "", erroConexao: "",
};

// ---------------------------------------------------------------- dados
const cfg = () => ler(CHAVE_CFG, { base: "", token: "" });

// Garante a estrutura nova do financeiro (por mês) mesmo com foto antiga/demonstração.
function normalizarFinanceiro(d) {
  d.notas = Array.isArray(d.notas) ? d.notas : [];
  d.conteudo = Object.assign({ semana: [], ideias: [], concluidos: 0, total: 0, contadores: {}, series: [], formatos: [] }, d.conteudo || {});
  const f = d.financeiro = d.financeiro || {};
  const agora = new Date(), mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
  f.mes_atual = f.mes_atual || mesAtual;
  f.meses = f.meses || [f.mes_atual];
  for (const k of ["escritorio", "pessoal"]) {
    const c = f[k] = f[k] || {};
    if (!c.por_mes) c.por_mes = { [f.mes_atual]: { a_receber: c.a_receber || [], a_pagar: c.a_pagar || [] } };
    c.projecao = c.projecao || [];
  }
  f.contas = Array.isArray(f.contas) ? f.contas : [];
  return d;
}

async function carregar(forcar) {
  const c = cfg();
  estado.erroConexao = "";
  if (!c.base || !c.token) {
    estado.demo = true;
    estado.dados = normalizarFinanceiro(estado.dados || JSON.parse(JSON.stringify(window.DUDOO_DEMO)));
    return;
  }
  estado.demo = false;
  try {
    const r = await fetch(`${c.base.replace(/\/$/, "")}/dudoo_web_snapshot`, { headers: { "X-Dudoo-Token": c.token } });
    if (!r.ok) throw new Error(r.status === 403 ? "Chave de acesso não aceita pelo Wix." : `Erro ${r.status} do serviço.`);
    const j = await r.json();
    if (j.vazio || !j.hoje) throw new Error("O Dudoo ainda não publicou os dados. Abra o Dudoo no computador.");
    estado.dados = normalizarFinanceiro(j);
    gravar(CHAVE_DADOS, estado.dados);
    if (typeof processarPlantasRecebidas === "function") processarPlantasRecebidas(j);          // prévias de planta pedidas pelo Quadro
    estado.ultimaAtualizacao = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    estado.erroConexao = String(e.message || e);
    const cache = ler(CHAVE_DADOS, null);
    estado.dados = cache ? normalizarFinanceiro(cache) : null;      // com conexão configurada, nunca cair em dados de exemplo
    if (forcar) avisar(estado.erroConexao);
  }
}

function comando(tipo, payload, aplicarLocal) {
  const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, tipo, payload, criado: new Date().toISOString(), status: "pendente" };
  estado.fila.push(item);
  gravar(CHAVE_FILA, estado.fila);
  if (aplicarLocal) aplicarLocal();
  enviarFila();
  desenhar();
}

async function enviarFila() {
  const c = cfg();
  if (estado.demo || !c.base) return;                      // demonstração: fica só marcado como pendente
  for (const item of estado.fila.filter((i) => i.status === "pendente")) {
    try {
      const r = await fetch(`${c.base.replace(/\/$/, "")}/dudoo_web_comando`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Dudoo-Token": c.token },
        body: JSON.stringify({ id: item.id, tipo: item.tipo, payload: item.payload, criado: item.criado }),
      });
      if (!r.ok) throw new Error(r.status);
      item.status = "enviado";
    } catch (e) { break; }
  }
  estado.fila = estado.fila.filter((i) => i.status === "pendente" || (Date.now() - Date.parse(i.criado)) < 86400000);
  gravar(CHAVE_FILA, estado.fila);
  desenhar();
}
const pendentes = () => estado.fila.filter((i) => i.status === "pendente").length;

const numeroBr = (v) => parseFloat(String(v || "").replace(/\./g, "").replace(",", "."));

// Popup de baixo (folha): fica fora do #app, então redesenhar a tela não apaga o que a pessoa digitou.
function fecharFolha() { const f = document.getElementById("folha"); if (f) f.remove(); }
function abrirFolha(titulo, camposHtml, rotulo, aoConfirmar) {
  fecharFolha();
  const f = document.createElement("div");
  f.id = "folha";
  f.innerHTML = `<div class="folha-fundo" data-folha="fechar"></div><div class="folha-caixa"><h2>${esc(titulo)}</h2>${camposHtml}
    <button class="btn" id="folha-ok">${esc(rotulo)}</button><button class="btn o" data-folha="fechar">Cancelar</button></div>`;
  document.body.appendChild(f);
  f.addEventListener("click", (e) => { if (e.target.closest('[data-folha="fechar"]')) fecharFolha(); });
  document.getElementById("folha-ok").addEventListener("click", () => { if (aoConfirmar() !== false) fecharFolha(); });
}

// Copiar texto (18/10/2026, Eduardo: "botão pra copiar o texto" nas notas): clipboard do iOS/Chrome, com plano B (campo escondido) pra contexto sem permissão.
async function copiarTexto(texto) {
  const t = String(texto || "");
  if (!t) { avisar("Nada pra copiar."); return; }
  try {
    await navigator.clipboard.writeText(t);
    avisar("Texto copiado.");
    return;
  } catch (e) { /* cai no plano B */ }
  try {
    const campo = document.createElement("textarea");
    campo.value = t; campo.setAttribute("readonly", ""); campo.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(campo); campo.select(); campo.setSelectionRange(0, t.length);
    const ok = document.execCommand("copy");
    campo.remove();
    avisar(ok ? "Texto copiado." : "Não consegui copiar: segure o texto e escolha Copiar.");
  } catch (e) { avisar("Não consegui copiar: segure o texto e escolha Copiar."); }
}

function avisar(texto) {
  const a = $("#aviso"); a.textContent = texto; a.hidden = false;
  clearTimeout(avisar.t); avisar.t = setTimeout(() => { a.hidden = true; }, 3200);
}

// ---------------------------------------------------------------- Face ID (WebAuthn) com PIN de reserva
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hash = async (t) => b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("dudoo:" + t)));

async function webauthnDisponivel() {
  try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch (e) { return false; }
}
async function desbloquear() {
  if (await webauthnDisponivel()) {
    try {
      const desafio = crypto.getRandomValues(new Uint8Array(32));
      const cred = ler(CHAVE_CRED, null);
      if (!cred) {
        const nova = await navigator.credentials.create({ publicKey: {
          challenge: desafio, rp: { name: "Dudoo Web" },
          user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "dudoo", displayName: "Dudoo" },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" }, timeout: 60000 } });
        gravar(CHAVE_CRED, { id: b64(nova.rawId) });
      } else {
        await navigator.credentials.get({ publicKey: { challenge: desafio, timeout: 60000, userVerification: "required",
          allowCredentials: [{ type: "public-key", id: deB64(cred.id) }] } });
      }
      return true;
    } catch (e) { return false; }
  }
  return false;
}
async function pedirPin() {
  const guardado = ler(CHAVE_PIN, "");
  const digitado = window.prompt(guardado ? "PIN do Financeiro" : "Crie um PIN (4 a 6 números) para o Financeiro");
  if (!digitado) return false;
  const h = await hash(digitado);
  if (!guardado) { if (!/^\d{4,6}$/.test(digitado)) { avisar("Use de 4 a 6 números."); return false; } gravar(CHAVE_PIN, h); return true; }
  return h === guardado;
}
async function liberarFinanceiro() {
  const ok = (await desbloquear()) || (await pedirPin());
  if (ok) { estado.liberado = true; estado.liberadoEm = Date.now(); desenhar(); } else { avisar("Não foi possível liberar o Financeiro."); }
}
document.addEventListener("visibilitychange", () => { if (document.hidden) estado.liberado = false; });

// ---------------------------------------------------------------- telas
const ABAS = [["hoje", "Hoje"], ["projetos", "Projetos"], ["ideias", "Marketing"], ["financeiro", "Financeiro"], ["ferramentas", "Ferramentas"]];

function desenharAbas() {
  const n = estado.dados ? estado.dados.hoje.precisa.length : 0;
  $("#abas").innerHTML = ABAS.map(([k, nome]) =>
    `<button data-aba="${k}" class="${estado.aba === k ? "on" : ""}"><i></i>${nome}${k === "hoje" && n ? `<span class="n">${n}</span>` : ""}</button>`).join("");
}

function telaHoje() {
  const d = estado.dados, hoje = new Date();
  const dias = d.hoje.agenda.reduce((m, e) => { (m[e.dia] = m[e.dia] || []).push(e); return m; }, {});
  const sem = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
  const hojeIso = hoje.toISOString().slice(0, 10);
  const data = hoje.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const hora = hoje.getHours(), saud = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  return `<div class="topo"><div><h1>${saud}, ${esc(d.usuario.nome)}!</h1><div class="mini">${esc(data)} · ${d.projetos.filter((p) => p.estado === "ativo").length} projetos ativos</div>${estado.demo ? '<span class="demo">dados de exemplo</span>' : ""}</div>
    <div class="topo-botoes"><button class="atualizar" data-aba-ir="notas" aria-label="Notas">Notas${novasNotas() ? `<span class="nbadge">${novasNotas()}</span>` : ""}</button>
    <button class="atualizar" data-aba-ir="leads" aria-label="Leads">Leads${leadsDevidos() ? `<span class="nbadge">${leadsDevidos()}</span>` : ""}</button>
    <button class="atualizar" data-acao="atualizar">Atualizar</button></div></div>
    <form class="perg" data-form="pergunta"><input id="pergunta" placeholder="Pergunte ou peça algo ao Dudoo…" autocomplete="off"><button>Enviar</button></form>
    <button class="btn o atalho" data-acao="nova-tarefa">+ Nova tarefa</button>
    <button class="btn o atalho" data-acao="cadastro-lead">Cadastro de leads</button>
    ${estado.demo ? '<div class="card toque" data-aba-ir="mais"><div class="t"><b>Conectar ao Dudoo</b><div class="p">Você está vendo dados de exemplo. Toque para colar o link de conexão.</div></div></div>' : ""}
    ${estado.erroConexao ? `<div class="card pendente"><div class="p" style="margin:0">${esc(estado.erroConexao)} Mostrando os últimos dados.</div></div>` : ""}
    <h2 class="sec">Precisa de você · ${d.hoje.precisa.length}</h2>
    ${d.hoje.precisa.map((i) => `<div class="card toque" data-precisa="${esc(i.id)}"><div class="linha"><div class="t">${esc(i.titulo)}<div class="p">${esc(i.detalhe)}</div></div><span class="pill ${i.cor || "c"} dir">${esc(i.badge)}</span></div></div>`).join("") || '<div class="vazio">Nada pendente agora.</div>'}
    <h2 class="sec">Tarefas · ${(d.hoje.tarefas || []).length}</h2>
    ${(d.hoje.tarefas || []).map((t) => `<div class="card"><div class="linha"><button class="check" data-tarefa-hoje="${esc(t.id)}" aria-label="Concluir"></button><div class="t">${esc(t.titulo)}<div class="p">${t.projeto ? esc(t.projeto) : "Sem projeto"}${t.prazo ? ` · <span style="color:${t.atrasada ? "var(--verm)" : "inherit"}">${t.atrasada ? "atrasada · " : ""}${dataBr(t.prazo)}</span>` : ""}</div></div></div></div>`).join("") || '<div class="vazio">Sem tarefas abertas.</div>'}
    <h2 class="sec">Agenda</h2>
    ${Object.keys(dias).sort().map((dia) => { const dt = new Date(dia + "T12:00"); return `<div class="card"><div class="p" style="margin:0 0 4px">${sem[dt.getDay()]} ${dataBr(dia)}${dia === hojeIso ? " · hoje" : ""}</div>${dias[dia].map((e) => `<div class="t">${esc(e.hora)} ${esc(e.titulo)}</div>`).join("")}</div>`; }).join("") || '<div class="vazio">Sem compromissos nesta semana.</div>'}`;
}

function telaProjetos() {
  const d = estado.dados;
  if (estado.projeto) {
    const p = d.projetos.find((x) => x.id === estado.projeto);
    if (!p) { estado.projeto = null; return telaProjetos(); }
    const abas = [["resumo", "Resumo"], ["tarefas", "Tarefas"], ["cronograma", "Cronograma"], ["orcamento", "Orçamento"], ["notas", "Notas"], ["portal", "Portal"]];
    let corpo = "";
    if (estado.subProjeto === "resumo") {
      corpo = `<h2 class="sec">Andamento</h2><div class="card">${p.frentes.map((f) => `<div class="linha" style="margin-bottom:10px"><div class="t">${esc(f.nome)}<div class="barra"><i style="width:${f.pct}%"></i></div></div><span class="val dir">${f.pct}%</span></div>`).join("")}</div>
        <h2 class="sec">Próximo prazo</h2><div class="card"><div class="t" style="color:${p.atrasado ? "var(--verm)" : "inherit"}">${esc(p.prazo)}</div></div>
        <h2 class="sec">Atalhos</h2><button class="btn o peq" data-acao="whatsapp-projeto">WhatsApp do cliente</button><button class="btn o peq" data-subprojeto="portal">Ver no portal</button>`;
    } else if (estado.subProjeto === "tarefas") {
      corpo = `<h2 class="sec">Tarefas · ${p.tarefas.filter((t) => !t.feita).length} abertas</h2><button class="btn o atalho" data-acao="nova-tarefa">+ Nova tarefa</button>` +
        (p.tarefas.map((t) => `<div class="card"><div class="linha"><button class="check ${t.feita ? "ok" : ""}" data-tarefa="${esc(t.id)}" aria-label="Concluir"></button><div class="t ${t.feita ? "feita" : ""}">${esc(t.titulo)}</div></div></div>`).join("") || '<div class="vazio">Sem tarefas.</div>');
    } else if (estado.subProjeto === "cronograma") {
      corpo = corpoCronograma(p);
    } else if (estado.subProjeto === "orcamento") {
      corpo = corpoObra(p);
    } else if (estado.subProjeto === "notas") {
      corpo = blocoNotas(p.codigo);
    } else {
      corpo = corpoPortal(p);
    }
    return `<button class="voltar" data-acao="voltar">‹ Projetos</button><h1>${esc(p.codigo)} ${esc(p.nome)}</h1><div class="mini">${esc(p.sub)}</div>
      <div class="seg">${abas.map(([k, n]) => `<button data-subprojeto="${k}" class="${estado.subProjeto === k ? "on" : ""}">${n}</button>`).join("")}</div>${corpo}`;
  }
  const ativos = d.projetos.filter((p) => p.estado === "ativo"), outros = d.projetos.filter((p) => p.estado !== "ativo");
  const card = (p) => `<div class="card toque" data-projeto="${esc(p.id)}"><div class="linha"><div class="t"><b>${esc(p.codigo)} ${esc(p.nome)}</b><div class="p">${esc(p.sub)}</div></div><span class="pill ${p.estado === "ativo" ? "v" : "a"} dir">${p.estado === "ativo" ? "ATIVO" : "PAUSADO"}</span></div>
    <div class="barra"><i style="width:${p.pct}%"></i></div><div class="p">${p.pct}% · ${p.tarefas.filter((t) => !t.feita).length} tarefas abertas · <span style="color:${p.atrasado ? "var(--verm)" : "inherit"}">${esc(p.prazo)}</span></div></div>`;
  return `<h1>Projetos</h1><div class="mini">${ativos.length} ativos</div><h2 class="sec">Ativos</h2>${ativos.map(card).join("")}${outros.length ? `<h2 class="sec">Pausados</h2>${outros.map(card).join("")}` : ""}`;
}

// ---------------------------------------------------------------- notas (ligadas ao projeto pela etiqueta = número do projeto)
const todasNotas = () => (estado.dados && estado.dados.notas) || [];
const notasVistasEm = () => ler(CHAVE_NOTAS_VISTAS, "");
function novasNotas() {
  const visto = notasVistasEm();
  if (!visto) return 0;
  return todasNotas().filter((n) => !n.pendente && String(n.atualizado || "") > visto).length;
}
function marcarNotasVistas() {
  const maior = todasNotas().reduce((m, n) => (String(n.atualizado || "") > m ? String(n.atualizado) : m), "");
  gravar(CHAVE_NOTAS_VISTAS, maior || new Date().toISOString());
}
const quandoNota = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : `${dataBr(iso.slice(0, 10))} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`; };
function cartaoNota(n) {
  const resto = String(n.texto || "").split("\n").slice(1).join("\n").trim();
  const projeto = n.projeto ? `<span class="pill c">${esc(n.projeto)}</span>` : "";
  if (!n.gerada && !n.longa && !n.pendente && !String(n.id).startsWith("novo-")) {      // toque abre pra EDITAR (17/10/2026)
    return `<div class="card nota toque" data-nota-editar="${esc(n.id)}"><div class="linha"><div class="t"><b>${esc(n.titulo)}</b><div class="p">${esc(quandoNota(n.atualizado))}</div>
      ${resto ? `<div class="nota-previa">${esc(resto.slice(0, 160))}</div>` : ""}</div>${projeto}</div></div>`;
  }
  const aviso = n.gerada ? "gerada pelo Dudoo (só leitura)" : n.longa ? "nota longa: edite no Dudoo" : "";
  return `<details class="card nota${n.pendente ? " pendente" : ""}"><summary><span class="t"><b>${esc(n.titulo)}</b><span class="p">${esc(quandoNota(n.atualizado))}${n.pendente ? " · aguardando o Dudoo" : ""}${aviso ? " · " + aviso : ""}</span></span>${projeto}</summary>
    <div class="nota-texto">${esc(resto || "(sem mais texto)")}</div>
    <button class="btn o peq" style="margin-top:10px" data-copiar-nota="${esc(n.id)}">Copiar texto</button></details>`;
}
function blocoNotas(codigo) {
  const d = estado.dados, lista = todasNotas().filter((n) => (codigo === undefined ? true : codigo === "" ? !n.projeto : n.projeto === codigo));
  // 17/10/2026: sem o cartão fixo de "Salvar nota" (criava nota repetida sem querer); a nota existente abre pra EDITAR ao tocar,
  // e a nova abre numa folha pelo botão.
  return `<div class="linha" style="margin-top:6px"><h2 class="sec" style="flex:1;margin:14px 0 8px">${lista.length} nota(s)</h2><button class="btn o peq" data-acao="nova-nota" data-cod-nota="${esc(codigo || "")}">+ Nova nota</button></div>${lista.map(cartaoNota).join("") || '<div class="vazio">Nenhuma nota.</div>'}`;
}
function abrirNota(id) {
  const n = todasNotas().find((x) => x.id === id);
  if (!n) return;
  abrirFolha("Editar nota", `<button class="btn o peq" style="margin-bottom:8px" data-copiar-nota="${esc(n.id)}">Copiar texto</button><textarea class="campo" id="nota-ed" style="min-height:280px">${esc(n.texto)}</textarea><div class="mini">A 1ª linha é o título. Salvar edita esta nota (não cria outra).</div>`, "Salvar", () => {
    const texto = ($("#nota-ed").value || "").trim();
    if (!texto) { avisar("A nota não pode ficar vazia."); return false; }
    if (texto === String(n.texto || "").trim()) { avisar("Nada mudou."); return false; }
    comando("editar_nota", { nota_id: n.id, texto, base: n.atualizado }, () => {
      n.texto = texto; n.titulo = texto.split("\n")[0].slice(0, 80); n.atualizado = new Date().toISOString(); n.pendente = true;
    });
    avisar("Nota guardada. O Dudoo grava e manda pro Simplenote quando estiver aberto.");
  });
}
function telaNotas(embutida) {
  const filtro = estado.filtroNotas;
  const d = estado.dados;
  const opcoes = [`<option value="__todas" ${filtro === "__todas" ? "selected" : ""}>Todas as notas</option>`, `<option value="" ${filtro === "" ? "selected" : ""}>Sem projeto</option>`]
    .concat(d.projetos.map((p) => `<option value="${esc(p.codigo)}" ${filtro === p.codigo ? "selected" : ""}>${esc(p.codigo)} ${esc(p.nome)}</option>`)).join("");
  return `${embutida ? "" : '<button class="voltar" data-acao="voltar-hoje">‹ Hoje</button><h1>Notas</h1>'}<div class="mini">Sincronizadas com o Simplenote · etiqueta = número do projeto</div>
    <select class="campo" id="nota-filtro">${opcoes}</select>${blocoNotas(filtro === "__todas" ? undefined : filtro)}`;
}

// ---------------------------------------------------------------- leads (WhatsApp com texto pronto + "Enviei?")
const CHAVE_LEAD_AGUARDA = "dudoo_web_lead_aguarda";
const leadsLista = () => (estado.dados && estado.dados.leads) || [];
const leadsDevidos = () => leadsLista().filter((l) => l.devido).length;
const rotuloStatus = (s) => String(s || "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
// Ao cadastrar um lead pelo app: oferece já abrir o WhatsApp com a 1ª mensagem padrão (18/10/2026, Eduardo). A frase vem do Dudoo (`leads_modelo_primeira`,
// com {nome} e {tipo}); sem ela, a mesma frase embutida. O nome e o telefone saem do próprio texto colado.
const MODELO_PRIMEIRA = "Oi {nome}! Aqui é o Eduardo Schmidt, arquiteto. Vi que você solicitou contato pelo nosso anúncio sobre projeto de {tipo}. Você já tem o imóvel?";
function lerLeadDoTexto(texto) {
  const pega = (re) => { const m = String(texto || "").match(re); return m ? m[1].trim() : ""; };
  return { nome: pega(/nome\s*:\s*(.+)/i), telefone: pega(/telefone\s*:\s*(.+)/i), tipo: pega(/tipo\s+d[oa]\s+im[oó]vel\s*:\s*(.+)/i) };
}
function primeiraMensagem(lead) {
  const modelo = (estado.dados && estado.dados.leads_modelo_primeira) || MODELO_PRIMEIRA;
  return modelo.replace("{nome}", String(lead.nome || "").split(" ")[0]).replace("{tipo}", String(lead.tipo || "").toLowerCase() || "arquitetura");
}
function oferecerPrimeiraMensagem(texto) {
  const lead = lerLeadDoTexto(texto);
  if (!lead.telefone || !lead.nome) return;
  abrirFolha("Mandar a 1ª mensagem agora?", `<div class="mini" style="margin-bottom:8px">Lead enviado ao Dudoo. Quer já abrir o WhatsApp de ${esc(lead.nome)} com a mensagem padrão? (Edite se precisar.)</div><textarea class="campo" id="lead-msg" style="min-height:150px">${esc(primeiraMensagem(lead))}</textarea>`, "Abrir WhatsApp", () => {
    const msg = ($("#lead-msg").value || "").trim();
    window.open(linkWhatsapp(lead.telefone, msg), "_blank");
  });
}
function linkWhatsapp(tel, texto) {
  let n = String(tel || "").replace(/\D/g, "");
  if (n.length === 10 || n.length === 11) n = "55" + n;
  return "https://wa.me/" + n + (texto ? "?text=" + encodeURIComponent(texto) : "");
}
function telaLeads() {
  const aguarda = ler(CHAVE_LEAD_AGUARDA, null);
  const lista = leadsLista();
  const cartao = (l) => `<div class="card"><div class="linha"><div class="t"><b>${esc(l.nome)}</b><div class="p">${esc(rotuloStatus(l.status))}${l.origem ? " · " + esc(l.origem) : ""}${l.ultimo_contato ? " · último contato " + esc(l.ultimo_contato.split("-").reverse().join("/")) : " · sem contato"}</div></div>${l.devido ? `<span class="pill c dir">MSG ${l.numero}</span>` : ""}</div>
    ${l.devido && l.texto ? `<div class="p" style="margin:6px 0">${esc(l.texto.slice(0, 160))}${l.texto.length > 160 ? "…" : ""}</div>` : ""}
    ${l.telefone ? `<button class="btn peq" data-lead-wa="${esc(l.id)}">WhatsApp${l.devido ? " com a mensagem" : ""}</button>` : '<div class="p">Sem telefone cadastrado.</div>'}</div>`;
  return `<button class="voltar" data-acao="voltar-hoje">‹ Hoje</button><h1>Leads</h1><div class="mini">${lista.length} em andamento · ${leadsDevidos()} com follow-up hoje</div>
    <button class="btn o atalho" data-acao="cadastro-lead">+ Cadastro de leads</button>
    ${aguarda ? `<div class="card toque" data-lead-confirmar="1"><div class="t"><b>Você enviou a mensagem para ${esc(aguarda.nome)}?</b><div class="p">Toque para confirmar e registrar o contato.</div></div></div>` : ""}
    ${lista.map(cartao).join("") || '<div class="vazio">Nenhum lead em andamento.</div>'}`;
}
function perguntarEnviei() {
  const a = ler(CHAVE_LEAD_AGUARDA, null);
  if (!a || document.getElementById("folha")) return;
  abrirFolha(`Enviou a mensagem para ${a.nome}?`, a.numero ? `<div class="p">Mensagem ${a.numero} do follow-up.</div>` : "", "Sim, enviei", () => {
    if (a.numero) comando("lead_followup_enviado", { lead_id: a.id, numero: a.numero }, () => {
      const l = leadsLista().find((x) => x.id === a.id);
      if (l) { l.devido = false; l.ultimo_contato = new Date().toISOString().slice(0, 10); l.etapa = a.numero; }
    });
    gravar(CHAVE_LEAD_AGUARDA, null);
    avisar(a.numero ? "Contato registrado." : "Ok.");
  });
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && ler(CHAVE_LEAD_AGUARDA, null)) perguntarEnviei(); });

// Portal do cliente DENTRO do projeto (17/10/2026: saiu do menu de baixo): Entregas, Atividade, Acessos e Avisos só deste projeto.
function corpoPortal(p) {
  const d = estado.dados.portal || { acessos: [], atividade: [] }, abas = [["entregas", "Entregas"], ["atividade", "Atividade"], ["acessos", "Acessos"], ["aviso", "Avisos"]];
  const sub = abas.some(([k]) => k === estado.subPortal) ? estado.subPortal : "entregas";
  let corpo;
  if (sub === "acessos") {
    corpo = (d.acessos || []).filter((a) => a.projeto === p.codigo).map((a) => `<div class="card"><div class="linha"><div class="t"><b>${esc(a.cliente)}</b><div class="p">${esc(a.quando)}${a.total ? ` · ${a.total} acessos` : ""}</div></div>${a.novo ? '<span class="pill v dir">NOVO</span>' : a.parado ? '<span class="pill c dir">PARADO</span>' : ""}</div></div>`).join("") || '<div class="vazio">Nenhum acesso recente neste projeto.</div>';
  } else if (sub === "aviso") {
    corpo = `<h2 class="sec">Avisar o cliente</h2><div class="card"><textarea class="campo" id="aviso-texto" placeholder="Escreva o aviso para o portal…"></textarea><button class="btn" data-acao="publicar-aviso" data-projeto="${esc(p.id)}">Publicar no portal</button></div>`;
  } else if (sub === "atividade") {
    corpo = (d.atividade || []).filter((a) => String(a.detalhe || "").startsWith(p.codigo)).map((a) => `<div class="card"><div class="linha"><div class="t">${esc(a.titulo)}<div class="p">${esc(a.detalhe)}</div></div><span class="pill ${a.tipo} dir"></span></div></div>`).join("") || '<div class="vazio">Nenhuma atividade recente neste projeto.</div>';
  } else {
    corpo = blocoEntregas(p);
  }
  return `<div class="seg">${abas.map(([k, n]) => `<button data-subportal="${k}" class="${sub === k ? "on" : ""}">${n}</button>`).join("")}</div>${corpo}`;
}

const MESES_NOME = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const rotuloMes = (m) => { const [a, n] = String(m).split("-"); return `${MESES_NOME[Number(n) - 1] || m} ${a}`; };

function telaFinanceiro() {
  if (!estado.liberado) {
    return `<div class="bloqueio"><h1>Financeiro</h1><div class="mini">Protegido por Face ID.</div><button class="btn" data-acao="liberar">Liberar com Face ID</button></div>`;
  }
  const F = estado.dados.financeiro, c = F[estado.fin];
  const meses = F.meses, mes = meses.includes(estado.mes) ? estado.mes : (meses.includes(F.mes_atual) ? F.mes_atual : meses[0]);
  estado.mes = mes;
  const idx = meses.indexOf(mes), dadosMes = c.por_mes[mes] || { a_receber: [], a_pagar: [] };
  const aberta = (x) => x.status !== "paga" && x.status !== "recebida";
  const soma = (l, f) => l.filter((x) => !x.fora_resumo && f(x)).reduce((s, x) => s + x.valor, 0);
  const subs = [["receber", "A receber"], ["pagar", "A pagar"], ["projecao", "Projeção"]];
  let corpo = "";
  if (estado.finSub === "projecao") {
    corpo = (c.projecao.map((m) => `<div class="card"><div class="linha"><div class="t"><b>${esc(m.mes)}</b><div class="p">Entradas ${brl(m.entradas)} · Saídas ${brl(m.saidas)}</div></div><span class="val dir" style="color:${m.entradas >= m.saidas ? "var(--verde)" : "var(--verm)"}">${brl(m.entradas - m.saidas)}</span></div></div>`).join("")) || '<div class="vazio">Sem projeção para este escopo.</div>';
  } else {
    const lista = estado.finSub === "receber" ? dadosMes.a_receber : dadosMes.a_pagar;
    corpo = lista.map((x) => {
      const fechada = !aberta(x);
      const pend = x.id && estado.fila.some((i) => i.status === "pendente" && i.payload.conta_id === x.id);
      const semBaixa = estado.fin === "pessoal" && estado.finSub === "pagar" && x.grupo === "gilberto";   // Contas Gilberto: só consulta
      const podeBaixar = x.id && !fechada && !semBaixa;
      const rotuloData = x.status === "vencida" ? "Venceu" : fechada ? (estado.finSub === "receber" ? "Recebida" : "Paga") : "Vence";
      const podeDesfazer = x.id && fechada && !semBaixa;
      return `<div class="card ${fechada ? "fechada" : ""} ${pend ? "pendente" : ""}"><div class="linha"><div class="t"><b>${esc(x.descricao)}</b><div class="p"><span style="color:${x.status === "vencida" ? "var(--verm)" : "inherit"}">${rotuloData} ${dataBr(fechada && x.baixa_em ? x.baixa_em : x.venc)}</span>${x.projeto ? " · " + esc(x.projeto) : ""}${pend ? " · aguardando o Dudoo" : ""}${x.fora_resumo ? " · fora do total" : ""}</div></div><span class="val dir">${brl(x.valor)}</span></div>
        ${fechada ? `<div class="rodape-baixa"><div class="p">✓ Baixa registrada</div>${podeDesfazer ? `<button class="desfaz" data-desfazer="${esc(x.id)}" aria-label="Desfazer baixa" title="Desfazer baixa">↶</button>` : ""}</div>` : podeBaixar ? `<button class="acao" data-baixa="${esc(x.id)}">✓ ${estado.finSub === "receber" ? (x.rt ? "Marcar recebida" : "Dar baixa") : "Marcar paga"}</button>` : `<div class="p">${semBaixa ? "Conta de terceiro: só consulta." : x.grupo === "cartoes" ? "Fatura estimada: baixa pelo Dudoo." : ""}</div>`}</div>`;
    }).join("") || `<div class="vazio">Nada em ${esc(rotuloMes(mes))}.</div>`;
  }
  return `<h1>Financeiro</h1>
    <div class="seg"><button data-fin="escritorio" class="${estado.fin === "escritorio" ? "on" : ""}">Escritório</button><button data-fin="pessoal" class="${estado.fin === "pessoal" ? "on" : ""}">Pessoal</button></div>
    <div class="mes"><button data-mes="-1" ${idx <= 0 ? "disabled" : ""} aria-label="Mês anterior">‹</button><div><b>${esc(rotuloMes(mes))}</b>${mes === F.mes_atual ? '<span class="mini"> · mês atual</span>' : ""}</div><button data-mes="1" ${idx >= meses.length - 1 ? "disabled" : ""} aria-label="Próximo mês">›</button></div>
    <div class="kpis"><div class="kpi"><small>A receber</small><strong>${brl(soma(dadosMes.a_receber, aberta))}</strong><small>Recebido ${brl(soma(dadosMes.a_receber, (x) => !aberta(x)))}</small></div>
      <div class="kpi"><small>A pagar</small><strong>${brl(soma(dadosMes.a_pagar, aberta))}</strong><small>Pago ${brl(soma(dadosMes.a_pagar, (x) => !aberta(x)))}</small></div></div>
    <div class="seg">${subs.map(([k, n]) => `<button data-finsub="${k}" class="${estado.finSub === k ? "on" : ""}">${n}</button>`).join("")}</div>${corpo}
    ${estado.finSub === "receber" ? '<button class="fab" data-acao="nova-receber">+ Conta a receber</button>' : estado.finSub === "pagar" ? '<button class="fab" data-acao="nova-pagar">+ Conta a pagar</button>' : ""}`;
}

function blocoConexao() {
  return `<div class="p" style="margin:0 0 6px">Cole o link de conexão que o Dudoo copiou (Configurações → Dudoo Web → Copiar link de conexão do iPhone).</div>
    <textarea class="campo" id="cfg-link" placeholder="https://eduardoarqt-gif.github.io/dudoo-web/#c=..." style="min-height:70px;margin-top:0"></textarea>
    <button class="btn" data-acao="colar-link">Conectar</button>`;
}

// Ferramentas (18/10/2026): o mesmo menu do Dudoo do computador — Ferramentas → Geral · Notas · Quadro. Regra: toda tela do app segue o menu e a sub-aba do PC.
const SUBS_FERRAMENTAS = [["geral", "Geral"], ["notas", "Notas"], ["quadro", "Quadro"]];
function telaFerramentas() {
  const sub = estado.subFerr || "geral";
  const menu = `<div class="seg">${SUBS_FERRAMENTAS.map(([k, nome]) => `<button class="${sub === k ? "on" : ""}" data-sub-ferr="${k}">${nome}${k === "notas" && novasNotas() ? ` · ${novasNotas()}` : ""}</button>`).join("")}</div>`;
  const corpo = sub === "notas" ? telaNotas(true) : sub === "quadro" ? (typeof telaQuadroLista === "function" ? telaQuadroLista() : "") : telaMais();
  return `<h1>Ferramentas</h1>${menu}${corpo}`;
}

function telaMais() {
  const ponto = estado.dados.usuario.ponto === "dentro";
  return `<h2 class="sec">Geral</h2>
    <h2 class="sec">Ponto</h2><div class="card"><div class="linha"><div class="t">${ponto ? "Você está com o ponto aberto" : "Ainda não bateu o ponto"}</div></div><button class="btn" data-acao="ponto">${ponto ? "Registrar saída" : "Registrar entrada"}</button></div>
    <h2 class="sec">Conexão com o Dudoo</h2><div class="card"><div class="p" style="margin:0 0 8px">${estado.demo ? "Modo demonstração (dados de exemplo)." : "Conectado" + (estado.ultimaAtualizacao ? " · atualizado às " + estado.ultimaAtualizacao : "")}${estado.erroConexao ? " · " + esc(estado.erroConexao) : ""}${pendentes() ? ` · ${pendentes()} ação(ões) aguardando envio` : ""}</div>
      ${blocoConexao()}</div>
    <h2 class="sec">Sobre</h2><div class="card"><div class="p" style="margin:0">Dudoo Web 1.0 · Adicione à Tela de Início para abrir como app.</div></div>`;
}

function telaSemDados() {
  return `<div class="bloqueio"><h1>Sem dados ainda</h1><div class="mini">${esc(estado.erroConexao || "Conecte o app ao Dudoo.")}</div>
    <button class="btn" data-acao="atualizar">Tentar de novo</button>
    <div class="card" style="margin-top:18px;text-align:left">${blocoConexao()}</div></div>`;
}

function desenhar() {
  if (!estado.dados) { $("#app").innerHTML = telaSemDados(); desenharAbas(); return; }
  if (!notasVistasEm()) marcarNotasVistas();             // 1ª vez: o que já existe não conta como "nova"
  const telas = { hoje: telaHoje, projetos: telaProjetos, ideias: telaIdeias, financeiro: telaFinanceiro, ferramentas: telaFerramentas, mais: telaFerramentas, notas: telaFerramentas, leads: telaLeads };
  const y = window.scrollY;
  $("#app").innerHTML = telas[estado.aba]();
  desenharAbas();
  window.scrollTo(0, y);
  if (estado.aba === "ideias") ligarLeque();
  if (estado.aba === "projetos" && estado.projeto && estado.subProjeto === "cronograma") montarCronograma();
}

// ---------------------------------------------------------------- ideias (Central de Conteúdo) — leque "de cinema"
const NOMES_FORMATO = { feed: "Feed", carrossel: "Carrossel", reels: "Reels", stories: "Stories", site: "Site / Blog", faq: "FAQ" };
estado.captura = { formatos: [], texto: "", imagens: [], link: "", mostrarLink: false };
estado.alvoImagem = "";
estado.leque = { escopo: "semana", indice: 0 };
const conteudo = () => (estado.dados && estado.dados.conteudo) || { semana: [], ideias: [], contadores: {}, formatos: [] };
const listaDoLeque = () => (estado.leque.escopo === "semana" ? conteudo().semana : conteudo().ideias.filter((i) => i.situacao === "solta" || i.situacao === "aceita"));

function cartaoLeque(i, n) {
  const feita = i.situacao === "arquivada", aceita = i.situacao === "aceita";
  const chips = Object.keys(NOMES_FORMATO).map((k) =>
    `<button class="chip${(i.formatos || []).includes(k) ? " on" : ""}" data-formato="${k}" data-ideia="${esc(i.id)}">${NOMES_FORMATO[k]}</button>`).join("");
  return `<div class="carta${feita ? " feita-c" : ""}" data-n="${n}">
    <div><span class="pill c">${esc(i.serie || "Sem série")}</span>${i.prioridade === "alta" ? ' <span class="pill a">alta</span>' : ""}</div>
    ${i.aviso ? `<div><span class="pill v">${esc(i.aviso)}</span></div>` : ""}
    <h3>${esc(i.titulo)}</h3>
    ${i.miniatura ? `<div class="mini-caixa"><img class="mini-ideia" src="${i.miniatura}" alt="">${i.video ? '<span class="mini-video">▶ vídeo</span>' : ""}${(i.imagens || 0) > 1 ? `<span class="mini-video">${i.imagens} imagens</span>` : ""}</div>` : ""}
    <div class="chips">${chips}</div>
    <div class="carta-acoes">${feita ? '<span class="pill v">concluída</span>' : `
      <button class="btn peq" data-ideia-acao="aceitar" data-ideia="${esc(i.id)}">${aceita ? "Aceita ✓" : "Aceitar"}</button>
      <button class="btn o peq" data-ideia-acao="executado" data-ideia="${esc(i.id)}">Executado</button>
      <button class="btn o peq" data-ideia-acao="adiar" data-ideia="${esc(i.id)}">Adiar</button>
      <button class="btn o peq" data-ideia-acao="descartar" data-ideia="${esc(i.id)}">Descartar</button>
      <button class="btn o peq" data-ideia-acao="imagem" data-ideia="${esc(i.id)}">+ Imagem</button>`}</div></div>`;
}

const ROTULO_TIPO_POST = { feed: "Feed", stories: "Stories", reels: "Reels" };
const ROTULO_STATUS_POST = { rascunho: "Rascunho", planejado: "Planejado", agendado: "Agendado", processando: "Publicando…", publicado: "Publicado", falha: "Falhou" };
const COR_STATUS_POST = { publicado: "v", agendado: "a", processando: "a", falha: "r", planejado: "c", rascunho: "c" };
const postsMarketing = () => (estado.dados && estado.dados.marketing && estado.dados.marketing.posts) || [];

function subMenuMarketing() {
  const sub = estado.subMkt || "ideias", n = postsMarketing().filter((p) => p.status !== "publicado").length;
  return `<div class="seg"><button class="${sub === "ideias" ? "on" : ""}" data-sub-mkt="ideias">Ideias</button>
    <button class="${sub === "posts" ? "on" : ""}" data-sub-mkt="posts">Posts · ${n}</button></div>`;
}

// Posts planejados (calendário do Marketing): agrupados por dia; toque abre a edição (legenda, dia e hora).
function telaPosts() {
  const posts = postsMarketing(), hoje = new Date().toISOString().slice(0, 10);
  const grupos = posts.reduce((m, p) => { (m[p.data] = m[p.data] || []).push(p); return m; }, {});
  const dias = Object.keys(grupos).sort();
  const cartao = (p) => `<div class="card toque" data-post="${esc(p.id)}"><div class="linha">${p.miniatura ? `<img class="mini-banco" src="${p.miniatura}" alt="">` : ""}
    <div class="t"><b>${esc(p.titulo || (p.legenda || "").split("\n")[0] || "(sem título)")}</b>
    <div class="p">${esc(ROTULO_TIPO_POST[p.tipo] || p.tipo)} · ${esc(p.hora || "sem hora")}${p.projeto ? " · " + esc(p.projeto) : ""}${p.erro ? ` · <span style="color:var(--verm)">${esc(p.erro)}</span>` : ""}</div></div>
    <span class="pill ${COR_STATUS_POST[p.status] || "c"} dir">${esc(ROTULO_STATUS_POST[p.status] || p.status)}</span></div></div>`;
  return `<h1>Marketing</h1>${subMenuMarketing()}
    <div class="mini" style="margin:8px 0 4px">${posts.filter((p) => p.status !== "publicado").length} post(s) a publicar nos próximos dias · toque num post pra editar</div>
    ${dias.map((dia) => `<h2 class="sec">${dia === hoje ? "Hoje" : esc(dataBr(dia))} · ${grupos[dia].length}</h2>${grupos[dia].map(cartao).join("")}`).join("") || '<div class="vazio">Nenhum post planejado pros próximos dias.</div>'}`;
}

function fotosDoPost(p) {
  const fotos = p.fotos && p.fotos.length ? p.fotos : (p.miniatura ? [{ u: p.miniatura, v: false }] : []);
  if (!fotos.length) return p.midias ? `<div class="mini" style="margin:6px 0">${p.midias} mídia(s) neste post (a prévia só aparece quando o arquivo está no computador).</div>` : "";
  return `<div class="fotos-post">${fotos.map((f) => `<div class="foto-post"><img src="${f.u}" alt="">${f.v ? '<span class="mini-video">▶</span>' : ""}</div>`).join("")}</div>`
    + (p.midias > fotos.length ? `<div class="mini">Mostrando ${fotos.length} de ${p.midias}.</div>` : "");
}

function editarPost(id) {
  const p = postsMarketing().find((x) => x.id === id);
  if (!p) return;
  if (!p.editavel) {
    abrirFolha(p.status === "publicado" ? "Post publicado" : "Post do calendário antigo",
      `<div class="p" style="margin:8px 0">${esc(ROTULO_TIPO_POST[p.tipo] || p.tipo)} · ${esc(dataBr(p.data))} ${esc(p.hora || "")}</div>
       ${fotosDoPost(p)}<div class="card" style="white-space:pre-wrap">${esc(p.legenda || "(sem legenda)")}</div>
       <div class="p">${p.status === "publicado" ? "Já foi publicado: não dá mais pra alterar." : "Este post vem do calendário antigo do Feed: dá pra ver aqui, mas só se edita no Dudoo do computador."}</div>`,
      "Fechar", () => true);
    return;
  }
  const campos = `<div class="p" style="margin:6px 0">${esc(ROTULO_TIPO_POST[p.tipo] || p.tipo)} · ${esc(ROTULO_STATUS_POST[p.status] || p.status)}${p.midias ? ` · ${p.midias} mídia(s)` : ""}</div>
    ${fotosDoPost(p)}<label class="rot">Legenda</label><textarea class="campo" id="po-legenda" style="min-height:140px">${esc(p.legenda || "")}</textarea>
    <label class="rot">Dia</label><input class="campo" id="po-data" type="date" value="${esc(p.data || "")}">
    <label class="rot">Hora (opcional)</label><input class="campo" id="po-hora" type="time" value="${esc(p.hora || "")}">
    <button class="btn o" id="po-tirar" style="margin-top:12px">Tirar do calendário</button>`;
  abrirFolha("Editar post", campos, "Salvar", () => {
    const legenda = $("#po-legenda").value, data = $("#po-data").value || "", hora = $("#po-hora").value || "";
    if (!data) { avisar("Escolha o dia do post."); return false; }
    comando("editar_post", { id: p.id, legenda, data, hora }, () => { p.legenda = legenda; p.data = data; p.hora = hora; });
    avisar("Alteração enviada. O Dudoo do computador aplica assim que estiver aberto.");
  });
  const tirar = document.getElementById("po-tirar");
  if (tirar) tirar.addEventListener("click", () => {
    comando("desprogramar_post", { id: p.id }, () => { const lista = postsMarketing(), i = lista.indexOf(p); if (i >= 0) lista.splice(i, 1); });
    fecharFolha();
    avisar("Post tirado do calendário (vira rascunho no Dudoo do computador).");
  });
}

function telaIdeias() {
  if ((estado.subMkt || "ideias") === "posts") return telaPosts();
  const c = conteudo(), ct = c.contadores || {}, lista = listaDoLeque();
  const todas = c.ideias.filter((i) => i.situacao !== "arquivada");
  const captura = Object.keys(NOMES_FORMATO).map((k) =>
    `<button class="chip${estado.captura.formatos.includes(k) ? " on" : ""}" data-cap-formato="${k}">${NOMES_FORMATO[k]}</button>`).join("");
  return `<h1>Marketing</h1>${subMenuMarketing()}<div class="mini">${ct.ideias || 0} ideias · ${ct.planejados || 0} planejadas · ${ct.em_producao || 0} em produção · ${ct.publicados || 0} publicadas</div>
    <div class="card" style="margin-top:12px"><textarea class="campo" id="ideia-texto" style="margin-top:0;min-height:74px" placeholder="Acabou de ter uma ideia? Escreva ou dite aqui…">${esc(estado.captura.texto)}</textarea>
      <div class="cap-barra">
        <button class="cap-ic" data-acao="cap-mic" aria-label="Ditar"><svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0M12 17v4"/></svg></button>
        <button class="cap-ic" data-acao="cap-foto" aria-label="Imagem"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-2h6l2 2h3v11H4Z"/><circle cx="12" cy="13" r="3.2"/></svg></button>
        <button class="cap-ic${estado.captura.mostrarLink || estado.captura.link ? " on" : ""}" data-acao="cap-link" aria-label="Link"><svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/></svg></button>
        <input type="file" id="ideia-arquivo" accept="image/*" multiple hidden><input type="file" id="ideia-arquivo-card" accept="image/*" hidden>
      </div>
      ${estado.captura.mostrarLink || estado.captura.link ? `<input class="campo" id="ideia-link" inputmode="url" placeholder="Cole o link (matéria, post, referência)" value="${esc(estado.captura.link)}">` : ""}
      ${estado.captura.imagens.length ? `<div class="cap-fotos">${estado.captura.imagens.map((im, n) =>
        `<div class="cap-foto"><img src="${im}" alt=""><button data-acao="cap-remover" data-n="${n}" aria-label="Remover">×</button></div>`).join("")}</div>` : ""}
      <div class="chips" style="margin-top:8px">${captura}</div><button class="btn" data-acao="guardar-ideia">Guardar ideia</button></div>
    <div class="seg"><button class="${estado.leque.escopo === "semana" ? "on" : ""}" data-escopo="semana">Da semana · ${c.concluidos || 0}/${c.total || 0}</button>
      <button class="${estado.leque.escopo === "todas" ? "on" : ""}" data-escopo="todas">Todas abertas</button></div>
    ${lista.length ? `<div class="leque"><div class="trilho" id="trilho">${lista.map(cartaoLeque).join("")}</div></div>
      <div class="pontos" id="pontos">${lista.map((_, n) => `<i data-n="${n}"></i>`).join("")}</div>` : '<div class="vazio">Nenhuma ideia ainda. Anote a primeira acima, sem organizar agora.</div>'}
    <h2 class="sec">Banco de ideias · ${todas.length}</h2>
    ${todas.map((i) => `<div class="card"><div class="linha">${i.miniatura ? `<img class="mini-banco" src="${i.miniatura}" alt="">` : ""}<div class="t"><b>${esc(i.titulo)}</b><div class="p">${esc(i.serie || "Sem série")}${(i.formatos || []).length ? " · " + i.formatos.map((f) => NOMES_FORMATO[f] || f).join(", ") : ""}</div></div>
      <span class="pill ${i.situacao === "aceita" ? "v" : i.situacao === "adiada" ? "a" : "c"}">${esc(i.situacao)}</span></div></div>`).join("") || '<div class="vazio">O banco está vazio.</div>'}`;
}

// Leque: scroll horizontal com snap; cada carta escala, gira e desfoca conforme a distância do centro.
function ligarLeque() {
  const trilho = $("#trilho"); if (!trilho) return;
  const cartas = [...trilho.querySelectorAll(".carta")];
  const centro = () => trilho.scrollLeft + trilho.clientWidth / 2;
  const marcarPontos = () => document.querySelectorAll("#pontos i").forEach((p, n) => p.classList.toggle("on", n === estado.leque.indice));
  const aplicar = () => {
    let melhor = 0, menor = 1e9;
    cartas.forEach((el, n) => {
      const c = el.offsetLeft + el.offsetWidth / 2, d = (c - centro()) / el.offsetWidth;     // ±1 = uma carta de distância
      const ad = Math.min(Math.abs(d), 2);
      el.style.transform = `perspective(900px) rotateY(${(-d * 28).toFixed(1)}deg) scale(${(1 - ad * 0.14).toFixed(3)}) translateZ(${(-ad * 40).toFixed(0)}px)`;
      el.style.opacity = Math.max(0.35, 1 - ad * 0.38).toFixed(2);
      el.style.filter = ad > 0.35 ? `blur(${Math.min(ad * 2.2, 4).toFixed(1)}px)` : "none";
      el.style.zIndex = String(10 - Math.round(ad * 3));
      if (Math.abs(d) < menor) { menor = Math.abs(d); melhor = n; }
    });
    if (melhor !== estado.leque.indice) { estado.leque.indice = melhor; marcarPontos(); }
  };
  trilho.addEventListener("scroll", () => requestAnimationFrame(aplicar), { passive: true });
  const alvo = cartas[Math.min(estado.leque.indice, cartas.length - 1)];
  if (alvo) trilho.scrollLeft = alvo.offsetLeft - (trilho.clientWidth - alvo.offsetWidth) / 2;
  aplicar();
  marcarPontos();
}

// Foto do iPhone é grande: reduz pra caber num comando (limite do item no Wix ~500 KB) — 1280 px, JPEG, abaixo de ~330 KB.
function comprimirImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo), img = new Image();
    img.onload = () => {
      let lado = 1280, q = 0.74, saida = "";
      for (let t = 0; t < 6; t++) {
        const f = Math.min(1, lado / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * f)); c.height = Math.max(1, Math.round(img.height * f));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        saida = c.toDataURL("image/jpeg", q);
        if (saida.length * 0.75 < 330000) break;
        lado = Math.round(lado * 0.8); q = Math.max(0.5, q - 0.06);
      }
      URL.revokeObjectURL(url); resolve(saida);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("imagem")); };
    img.src = url;
  });
}

function acaoIdeia(id, acao) {
  if (acao === "imagem") {
    estado.alvoImagem = id;
    const campo = $("#ideia-arquivo-card"); if (campo) { campo.value = ""; campo.click(); }
    return;
  }
  const c = conteudo();
  if (!c.ideias.concat(c.semana).some((i) => i.id === id)) return;
  comando("acao_ideia", { ideia_id: id, acao }, () => {
    const listas = [c.semana, c.ideias];
    if (acao === "aceitar") listas.forEach((l) => l.forEach((i) => { if (i.id === id) i.situacao = "aceita"; }));
    else if (acao === "executado") {
      listas.forEach((l) => l.forEach((i) => { if (i.id === id) i.situacao = "arquivada"; }));
      c.concluidos = c.semana.filter((i) => i.situacao === "arquivada").length;
    } else { c.semana = c.semana.filter((i) => i.id !== id); c.ideias = c.ideias.filter((i) => i.id !== id); c.total = c.semana.length; }
  });
  avisar({ aceitar: "Ideia aceita.", executado: "Marcada como executada.", adiar: "Ideia adiada.", descartar: "Ideia descartada." }[acao]);
}


// ---------------------------------------------------------------- obra: cronograma e orçamento (17/10/2026)
// O desenho do cronograma é o MESMO do portal do cliente (cronograma.js, gerado por tools/gerar_cronograma_dudoo_web.py).
const projetoAtual = () => ((estado.dados && estado.dados.projetos) || []).find((x) => x.id === estado.projeto);
const hojeISO = () => new Date().toISOString().slice(0, 10);
const brCompleta = (iso) => { const [a, m, d] = String(iso || "").slice(0, 10).split("-"); return d ? `${d}/${m}/${a}` : "—"; };

function blocoEntregas(p) {
  const lista = p.entregas || [];
  if (!lista.length) return `<h2 class="sec">Entregas publicadas</h2><div class="vazio">Nenhuma entrega publicada no portal (ou o Dudoo aberto no computador ainda não é a versão que envia a lista).</div>`;
  const dias = (iso) => Math.max(0, Math.round((Date.now() - Date.parse(iso + "T12:00")) / 86400000));
  const rotulo = { cliente: "cliente", tecnico: "engenheiro/fornecedor" };
  const situacao = (e) => e.st === "aprovado" ? '<span class="pill v">Aprovado</span>' : e.st === "revisao_pedida" ? '<span class="pill a">Revisão pedida</span>'
    : e.requer && e.publico.includes("cliente") ? `<span class="pill a">Aguardando${e.em ? ` há ${dias(e.em)} d` : ""}</span>` : '<span class="pill">Só consulta</span>';
  const linha = (e) => { const miolo = `<div class="linha"><div class="t"><b>${esc(e.nome)}</b><div class="p">${[e.cat, e.em ? brCompleta(e.em) : "", e.publico.map((x) => rotulo[x] || x).join(" + ")].filter(Boolean).map(esc).join(" · ")}</div>
      ${e.st === "revisao_pedida" && e.obs ? `<div class="p" style="margin-top:4px">“${esc(e.obs)}”</div>` : ""}</div>${situacao(e)}</div>`;
    return e.link ? `<a class="card toque" style="display:block;color:inherit;text-decoration:none" href="${esc(e.link)}" target="_blank" rel="noopener">${miolo}</a>` : `<div class="card">${miolo}</div>`; };
  return `<h2 class="sec">Entregas publicadas · ${lista.length}</h2>${lista.map(linha).join("")}<div class="mini">Toque para abrir no Dropbox. Aprovar e publicar continua no Dudoo.</div>`;
}

function corpoCronograma(p) {
  if (!p.cronograma) return '<div class="vazio">Sem cronograma por aqui: o projeto ainda não tem um no Dudoo, ou o Dudoo aberto no computador é de uma versão que ainda não envia o cronograma.</div>';
  return `<div class="cg-moldura"><div id="cg-caixa"></div></div><div class="mini" style="margin-top:8px">Toque numa etapa para ajustar % executado, datas e duração. O Dudoo grava quando estiver aberto.</div>`;
}

function montarCronograma() {
  const p = projetoAtual(), caixa = $("#cg-caixa");
  if (!p || !p.cronograma || !caixa || !window.CronogramaObra) return;
  window.__cgAoEtapa = (_id, etapaId, nome) => abrirEtapa(etapaId, nome);
  window.CronogramaObra.montar(caixa, p.id, p.cronograma);
}

function abrirEtapa(etapaId, nome) {
  const p = projetoAtual(), l = p && p.cronograma && p.cronograma.linhas.find((x) => x.id === etapaId);
  if (!l) return;
  const pend = estado.fila.some((i) => i.status === "pendente" && i.payload.etapa_id === etapaId);
  const campos = `<div class="mini">${esc(nome || l.nome)} · previsto ${brCompleta(l.inicio)} → ${brCompleta(l.fim)}${pend ? " · alteração aguardando o Dudoo" : ""}</div>
    <label class="rot">% executado: <b id="e-prog-v">${Number(l.progresso) || 0}%</b></label>
    <input type="range" id="e-prog" min="0" max="100" step="5" value="${Number(l.progresso) || 0}" style="width:100%" oninput="document.getElementById('e-prog-v').textContent=this.value+'%'">
    <label class="rot">Início previsto <span class="mini">(passa a data fixa; as etapas que dependem dela se ajustam)</span></label><input class="campo" id="e-ini" type="date" value="${esc(l.inicio || "")}">
    <label class="rot">Duração (dias úteis)</label><input class="campo" id="e-dur" type="number" inputmode="numeric" min="1" value="${Number(l.dias_uteis) || 1}">
    <label class="rot">Início real</label><input class="campo" id="e-ri" type="date" value="${esc(l.real_inicio || "")}">
    <label class="rot">Término real</label><input class="campo" id="e-rf" type="date" value="${esc(l.real_fim || "")}">`;
  abrirFolha("Ajustar etapa", campos, "Salvar", () => {
    const novo = { prog: Number($("#e-prog").value), ini: $("#e-ini").value, dur: Number($("#e-dur").value), ri: $("#e-ri").value, rf: $("#e-rf").value };
    const payload = { projeto: p.codigo, etapa_id: etapaId };
    if (novo.prog !== (Number(l.progresso) || 0)) payload.progresso = novo.prog;
    if (novo.ini && novo.ini !== l.inicio) payload.data_inicio = novo.ini;
    if (novo.dur && novo.dur !== (Number(l.dias_uteis) || 1)) payload.duracao_dias = novo.dur;
    if (novo.ri !== (l.real_inicio || "")) payload.data_inicio_real = novo.ri;
    if (novo.rf !== (l.real_fim || "")) payload.data_fim_real = novo.rf;
    if (novo.ri && novo.rf && novo.rf < novo.ri) { avisar("O término real não pode ser antes do início real."); return false; }
    if (Object.keys(payload).length === 2) { avisar("Nada mudou."); return false; }
    comando("cronograma_etapa", payload, () => {
      if (payload.progresso !== undefined) { l.progresso = payload.progresso; if (payload.progresso >= 100 && !l.real_fim) l.real_fim = hojeISO(); }
      if ("data_inicio_real" in payload) l.real_inicio = payload.data_inicio_real;
      if ("data_fim_real" in payload) l.real_fim = payload.data_fim_real;
    });
    avisar(payload.data_inicio || payload.duracao_dias ? "Enviado. O Dudoo recalcula as datas quando estiver aberto." : "Enviado ao Dudoo.");
  });
}

const FILTROS_OBRA = [["todos", "Todos"], ["faltam", "Falta comprar"], ["contratados", "Contratados"]];
const FALTAM = ["A cotar", "Cotação solicitada", "Cotado"], FECHADOS = ["Contratado", "Concluído"];

function corpoObra(p) {
  const o = p.orcamento;
  if (!o) return '<div class="vazio">Sem orçamento por aqui: o projeto ainda não tem um no Dudoo, ou o Dudoo aberto no computador é de uma versão que ainda não envia o orçamento.</div>';
  const filtro = estado.filtroObra || "todos";
  const passa = (i) => filtro === "todos" || (filtro === "faltam" ? FALTAM.includes(i.st) : FECHADOS.includes(i.st));
  const pill = (st) => `<span class="pill ${FECHADOS.includes(st) ? "v" : FALTAM.includes(st) ? "a" : ""}">${esc(st)}</span>`;
  const porCat = {};
  o.itens.filter(passa).forEach((i) => { (porCat[i.cat || "Sem categoria"] = porCat[i.cat || "Sem categoria"] || []).push(i); });
  const cats = Object.keys(porCat).map((c) => {
    const lista = porCat[c], soma = lista.reduce((t, i) => t + (FECHADOS.includes(i.st) && i.contr ? i.contr : i.orc), 0);
    return `<details class="card obra-cat"${filtro !== "todos" ? " open" : ""}><summary><b>${esc(c)}</b><span class="val dir">${brl(soma)}</span><div class="p">${lista.length} ${lista.length === 1 ? "item" : "itens"}</div></summary>
      ${lista.map((i) => `<div class="linha obra-item" data-obra-item="${esc(i.id)}"><div class="t">${esc(i.nome)}<div class="p">${[i.amb, i.forn, i.qtd ? `${String(i.qtd).replace(".", ",")} ${i.un || ""}`.trim() : ""].filter(Boolean).map(esc).join(" · ")} ${pill(i.st)}${i.prazo ? ` · ${esc(i.prazo)}` : ""}</div></div>
        <span class="val dir">${brl(FECHADOS.includes(i.st) && i.contr ? i.contr : i.orc)}</span></div>`).join("")}</details>`;
  }).join("");
  return `<div class="kpis"><div class="kpi"><small>Orçado</small><strong>${brl(o.total_orcado)}</strong><small>${o.faltam} falta(m) comprar</small></div>
    <div class="kpi"><small>Contratado</small><strong>${brl(o.total_contratado)}</strong><small>Pago ${brl(o.total_pago)} · saldo ${brl(o.saldo)}</small></div></div>
    <select class="campo" id="obra-filtro">${FILTROS_OBRA.map(([k, n]) => `<option value="${k}" ${k === filtro ? "selected" : ""}>${n}</option>`).join("")}</select>
    ${o.itens_omitidos ? '<div class="vazio">Os itens deste orçamento só aparecem no Dudoo (a foto ficou pesada demais).</div>' : cats || '<div class="vazio">Nenhum item neste filtro.</div>'}<div class="mini" style="margin-top:8px">Toque num item para mudar a situação, o valor ou o prazo.</div>`;
}

function abrirItemObra(itemId) {
  const p = projetoAtual(), i = p && p.orcamento && p.orcamento.itens.find((x) => x.id === itemId);
  if (!i) return;
  const pend = estado.fila.some((x) => x.status === "pendente" && x.payload.item_id === itemId);
  const opcoes = p.orcamento.situacoes.map((s) => `<option value="${esc(s)}" ${s === i.st ? "selected" : ""}>${esc(s)}</option>`).join("");
  const campos = `<div class="mini">${esc(i.nome)}${pend ? " · alteração aguardando o Dudoo" : ""}</div>
    <label class="rot">Situação</label><select class="campo" id="o-st">${opcoes}</select>
    <label class="rot">Valor orçado (total, R$)</label><input class="campo" id="o-orc" inputmode="decimal" data-mascara="dinheiro" value="${i.orc ? String(i.orc).replace(".", ",") : ""}">
    <label class="rot">Quantidade</label><input class="campo" id="o-qtd" inputmode="decimal" value="${i.qtd != null ? String(i.qtd).replace(".", ",") : ""}">
    <label class="rot">Valor contratado (total, R$) <span class="mini">— só ao marcar Contratado</span></label><input class="campo" id="o-contr" inputmode="decimal" data-mascara="dinheiro" value="${i.contr ? String(i.contr).replace(".", ",") : ""}">
    <label class="rot">Prazo de entrega</label><input class="campo" id="o-prazo" value="${esc(i.prazo || "")}" placeholder="Ex.: 30 dias úteis">
    <label class="rot">Fornecedor</label><input class="campo" id="o-forn" value="${esc(i.forn || "")}">
    <label class="rot">Motivo <span class="mini">— só ao marcar "Não comprar agora"</span></label><input class="campo" id="o-motivo">`;
  abrirFolha("Item do orçamento", campos, "Salvar", () => {
    const st = $("#o-st").value, payload = { projeto: p.codigo, item_id: itemId };
    const orc = numeroBr($("#o-orc").value), qtd = numeroBr($("#o-qtd").value), contr = numeroBr($("#o-contr").value);
    if (st !== i.st) payload.status = st;
    if (!Number.isNaN(orc) && orc !== (i.orc || 0)) payload.valor_orcado = orc;
    if (!Number.isNaN(qtd) && qtd !== Number(i.qtd)) payload.quantidade = qtd;
    if ($("#o-prazo").value.trim() !== (i.prazo || "")) payload.prazo_entrega = $("#o-prazo").value.trim();
    if ($("#o-forn").value.trim() !== (i.forn || "")) payload.fornecedor = $("#o-forn").value.trim();
    if (st === "Contratado" && st !== i.st) {
      if (Number.isNaN(contr) || contr <= 0) { avisar("Informe o valor contratado."); return false; }
      payload.valor_contratado = contr;
    }
    if (payload.status === "Não comprar agora" && $("#o-motivo").value.trim()) payload.motivo = $("#o-motivo").value.trim();
    if (Object.keys(payload).length === 2) { avisar("Nada mudou."); return false; }
    comando("orcamento_item", payload, () => {
      if (payload.status) i.st = payload.status;
      if (payload.valor_orcado !== undefined) i.orc = payload.valor_orcado;
      if (payload.quantidade !== undefined) i.qtd = payload.quantidade;
      if (payload.valor_contratado !== undefined) i.contr = payload.valor_contratado;
      if (payload.prazo_entrega !== undefined) i.prazo = payload.prazo_entrega;
      if (payload.fornecedor !== undefined) i.forn = payload.fornecedor;
    });
    avisar("Enviado ao Dudoo. Os totais atualizam quando ele gravar.");
  });
}

// ---------------------------------------------------------------- ações
document.addEventListener("click", async (e) => {
  const q = (s) => e.target.closest(s);
  const d = estado.dados;
  let el;
  if ((el = q("[data-aba]"))) { estado.aba = el.dataset.aba; estado.projeto = null; desenhar(); window.scrollTo(0, 0); if (estado.aba === "financeiro" && !estado.liberado) liberarFinanceiro(); return; }
  if ((el = q("[data-aba-ir]"))) {
    estado.aba = el.dataset.abaIr;
    if (estado.aba === "notas") { estado.aba = "ferramentas"; estado.subFerr = "notas"; marcarNotasVistas(); }
    else if (estado.aba === "mais") { estado.aba = "ferramentas"; estado.subFerr = "geral"; }
    desenhar(); window.scrollTo(0, 0); return;
  }
  if ((el = q("[data-sub-ferr]"))) { estado.subFerr = el.dataset.subFerr; if (estado.subFerr === "notas") marcarNotasVistas(); desenhar(); return; }
  if ((el = q("[data-quadro-abrir]"))) { if (typeof abrirQuadro === "function") abrirQuadro(el.dataset.quadroAbrir); return; }
  if ((el = q("[data-quadro-apagar]"))) {
    const id = el.dataset.quadroApagar;
    if (confirm("Apagar este desenho do iPhone? (O que já foi enviado ao Dudoo continua lá.)")) { gravarRascunhos(rascunhos().filter((x) => x.local_id !== id)); desenhar(); }
    return;
  }
  if ((el = q("[data-projeto]"))) { estado.projeto = el.dataset.projeto; estado.subProjeto = "resumo"; estado.subPortal = "entregas"; desenhar(); window.scrollTo(0, 0); return; }
  if ((el = q("[data-subprojeto]"))) { estado.subProjeto = el.dataset.subprojeto; desenhar(); return; }
  if ((el = q("[data-obra-item]"))) { abrirItemObra(el.dataset.obraItem); return; }
  if ((el = q("[data-copiar-nota]"))) {
    const nota = todasNotas().find((x) => x.id === el.dataset.copiarNota);
    const campo = $("#nota-ed");                                           // na folha de edição copia o que está no campo agora
    copiarTexto(campo && el.closest("#folha") ? campo.value : String((nota && nota.texto) || ""));
    return;
  }
  if ((el = q("[data-nota-editar]"))) { abrirNota(el.dataset.notaEditar); return; }
  if ((el = q("[data-subportal]"))) { estado.subPortal = el.dataset.subportal; desenhar(); return; }
  if ((el = q("[data-fin]"))) { estado.fin = el.dataset.fin; desenhar(); return; }
  if ((el = q("[data-mes]"))) {
    const m = estado.dados.financeiro.meses, i = m.indexOf(estado.mes) + Number(el.dataset.mes);
    if (i >= 0 && i < m.length) { estado.mes = m[i]; desenhar(); }
    return;
  }
  if ((el = q("[data-finsub]"))) { estado.finSub = el.dataset.finsub; desenhar(); return; }
  if ((el = q("[data-tarefa-hoje]"))) {
    const id = el.dataset.tarefaHoje, lista = d.hoje.tarefas || [], t = lista.find((x) => x.id === id);
    if (!t) return;
    if (id.startsWith("novo-")) { avisar("Aguarde: o Dudoo ainda vai gravar essa tarefa."); return; }
    comando("concluir_tarefa", { tarefa_id: id, feita: true }, () => {
      lista.splice(lista.indexOf(t), 1);
      (d.projetos || []).forEach((p) => p.tarefas.forEach((x) => { if (x.id === id) x.feita = true; }));
    });
    return;
  }
  if ((el = q("[data-tarefa]"))) {
    const p = d.projetos.find((x) => x.id === estado.projeto), t = p && p.tarefas.find((x) => x.id === el.dataset.tarefa);
    if (t) comando("concluir_tarefa", { projeto: p.id, tarefa_id: t.id, feita: !t.feita }, () => { t.feita = !t.feita; });
    return;
  }
  if ((el = q("[data-baixa]"))) {
    const pm = d.financeiro[estado.fin].por_mes[estado.mes] || { a_receber: [], a_pagar: [] };
    const lista = estado.finSub === "receber" ? pm.a_receber : pm.a_pagar, c = lista.find((x) => x.id === el.dataset.baixa);
    if (!c) return;
    const receber = estado.finSub === "receber", escopo = estado.fin, hoje = new Date().toISOString().slice(0, 10);
    const tipo = receber ? (c.rt ? "marcar_rt_recebida" : "marcar_conta_receber_recebida") : "marcar_conta_pagar_paga";
    const contas = d.financeiro.contas || [];
    // As mesmas perguntas do "Marcar pago" do Dudoo: de qual conta, data do pagamento e valor pago (pode diferir do lançado).
    const campos = `<label class="rot">${receber ? "Em qual conta caiu o recebimento?" : "De qual conta foi o pagamento?"}</label>
      <select class="campo" id="f-conta"><option value="">Não informar</option>${contas.map((n) => `<option>${esc(n)}</option>`).join("")}</select>
      <label class="rot">${receber ? "Data do recebimento" : "Data do pagamento"}</label><input class="campo" id="f-data" type="date" value="${hoje}">
      <label class="rot">${receber ? "Valor recebido (R$)" : "Valor pago (R$) — pode ser diferente do lançado"}</label>
      <input class="campo" id="f-valor" inputmode="decimal" data-mascara="dinheiro" value="${esc(c.valor.toFixed(2).replace(".", ","))}">`;
    abrirFolha(`${receber ? (c.rt ? "Marcar recebida" : "Dar baixa") : "Marcar paga"} — ${c.descricao}`, campos, "Confirmar baixa", () => {
      const data = ($("#f-data").value || hoje), conta = $("#f-conta").value, valor = numeroBr($("#f-valor").value);
      if (!(valor > 0)) { avisar("Valor inválido."); return false; }
      const difere = Math.abs(valor - c.valor) > 0.005;
      comando(tipo, { conta_id: c.id, projeto: c.projeto || "", escopo, grupo: c.grupo || "", data, conta_origem: conta, valor_pago: difere ? valor : 0 },
        () => { c.status = receber ? "recebida" : "paga"; c.baixa_em = data; });
      avisar("Baixa registrada. O Dudoo aplica assim que estiver aberto.");
    });
    return;
  }
  if ((el = q("[data-desfazer]"))) {
    const pm = d.financeiro[estado.fin].por_mes[estado.mes] || { a_receber: [], a_pagar: [] };
    const receber = estado.finSub === "receber", lista = receber ? pm.a_receber : pm.a_pagar, c = lista.find((x) => x.id === el.dataset.desfazer);
    if (!c) return;
    const natureza = receber ? (c.rt ? "rt" : "receber") : "pagar";
    comando("desfazer_baixa", { conta_id: c.id, projeto: c.projeto || "", escopo: estado.fin, grupo: c.grupo || "", natureza },
      () => { c.status = (c.venc && c.venc < new Date().toISOString().slice(0, 10)) ? "vencida" : "aberta"; c.baixa_em = ""; });
    avisar("Baixa desfeita. O Dudoo aplica assim que estiver aberto.");
    return;
  }
  if ((el = q("[data-lead-wa]"))) {
    const l = leadsLista().find((x) => x.id === el.dataset.leadWa);
    if (l) { gravar(CHAVE_LEAD_AGUARDA, { id: l.id, nome: l.nome, numero: l.devido ? l.numero : 0 }); window.open(linkWhatsapp(l.telefone, l.devido ? l.texto : ""), "_blank"); }
    return;
  }
  if (q("[data-lead-confirmar]")) { perguntarEnviei(); return; }
  if ((el = q("[data-precisa]"))) {
    const item = d.hoje.precisa.find((x) => x.id === el.dataset.precisa);
    if (item && item.tipo === "lead") { estado.aba = "leads"; desenhar(); window.scrollTo(0, 0); }
    else if (item && item.projeto) { estado.aba = "projetos"; estado.projeto = item.projeto; estado.subProjeto = "resumo"; desenhar(); }
    else if (item && item.tipo === "pagar") { estado.aba = "financeiro"; estado.finSub = "pagar"; desenhar(); if (!estado.liberado) liberarFinanceiro(); }
    return;
  }
  if ((el = q("[data-sub-mkt]"))) { estado.subMkt = el.dataset.subMkt; desenhar(); return; }
  if ((el = q("[data-post]"))) { editarPost(el.dataset.post); return; }
  if ((el = q("[data-escopo]"))) { estado.leque.escopo = el.dataset.escopo; estado.leque.indice = 0; desenhar(); return; }
  if ((el = q("[data-cap-formato]"))) {
    const t = $("#ideia-texto"); if (t) estado.captura.texto = t.value;
    const k = el.dataset.capFormato, l = estado.captura.formatos, i = l.indexOf(k);
    if (i >= 0) l.splice(i, 1); else l.push(k);
    desenhar(); return;
  }
  if ((el = q("[data-formato]"))) {
    const id = el.dataset.ideia, k = el.dataset.formato, c = conteudo();
    comando("alternar_formato_ideia", { ideia_id: id, formato: k }, () => {
      [c.semana, c.ideias].forEach((l) => l.forEach((i) => {
        if (i.id !== id) return;
        i.formatos = i.formatos || [];
        const p = i.formatos.indexOf(k);
        if (p >= 0) i.formatos.splice(p, 1); else i.formatos.push(k);
      }));
    });
    return;
  }
  if ((el = q("[data-ideia-acao]"))) { acaoIdeia(el.dataset.ideia, el.dataset.ideiaAcao); return; }
  if ((el = q("[data-acao]"))) {
    const a = el.dataset.acao;
    if (a === "atualizar") { await carregar(true); await enviarFila(); desenhar(); avisar(estado.demo ? "Modo demonstração." : "Atualizado."); }
    else if (a === "voltar") { estado.projeto = null; desenhar(); }
    else if (a === "voltar-hoje") { estado.aba = "hoje"; desenhar(); }
    else if (a === "nova-nota") {
      const fixo = el.dataset.codNota || "";
      const opcoes = `<option value="">Sem projeto</option>` + d.projetos.map((p) => `<option value="${esc(p.codigo)}" ${p.codigo === fixo ? "selected" : ""}>${esc(p.codigo)} ${esc(p.nome)}</option>`).join("");
      abrirFolha("Nova nota", `<select class="campo" id="nota-projeto" style="margin-top:0">${opcoes}</select><textarea class="campo" id="nota-texto" placeholder="Escreva a nota…" style="min-height:200px"></textarea>`, "Salvar nota", () => {
        const texto = ($("#nota-texto").value || "").trim(), codigo = $("#nota-projeto").value || "";
        if (!texto) { avisar("Escreva a nota antes de salvar."); return false; }
        const proj = d.projetos.find((x) => x.codigo === codigo);
        const completo = proj ? `${proj.codigo} ${proj.nome}\n${texto}` : texto;
        const nova = { id: "novo-" + Date.now(), titulo: completo.split("\n")[0].slice(0, 80), texto: completo, projeto: codigo, atualizado: new Date().toISOString(), pendente: true };
        comando("criar_nota", { texto, projeto: codigo, local_id: nova.id }, () => { d.notas.unshift(nova); });
        avisar("Nota guardada. Vai pro Simplenote quando o Dudoo estiver aberto.");
      });
    }
    else if (a === "cap-mic") {
      const t = $("#ideia-texto"); if (t) t.focus();
      avisar("Toque no microfone do teclado do iPhone para ditar.");
    }
    else if (a === "cap-foto") { const campo = $("#ideia-arquivo"); if (campo) { campo.value = ""; campo.click(); } }
    else if (a === "cap-link") {
      const t = $("#ideia-texto"); if (t) estado.captura.texto = t.value;
      estado.captura.mostrarLink = !estado.captura.mostrarLink; desenhar();
      setTimeout(() => { const l = $("#ideia-link"); if (l) l.focus(); }, 50);
    }
    else if (a === "cap-remover") {
      const t = $("#ideia-texto"); if (t) estado.captura.texto = t.value;
      estado.captura.imagens.splice(Number(el.dataset.n), 1); desenhar();
    }
    else if (a === "guardar-ideia") {
      let texto = (($("#ideia-texto") || {}).value || "").trim();
      const link = (($("#ideia-link") || {}).value || estado.captura.link || "").trim();
      const imagens = estado.captura.imagens.slice();
      if (!texto && link) texto = link;
      if (!texto && imagens.length) texto = "Ideia com imagem";
      if (!texto) { avisar("Escreva a ideia antes de guardar."); return; }
      const corpo = link && texto !== link ? texto + String.fromCharCode(10) + link : texto;
      const nova = { id: "novo-" + Date.now(), titulo: texto.split(String.fromCharCode(10))[0].slice(0, 90), serie: "", prioridade: "normal",
        situacao: "solta", formatos: estado.captura.formatos.slice(), projeto: "", pecas: [], criado_em: new Date().toISOString().slice(0, 10),
        origem: "iphone", miniatura: imagens[0] || "" };
      const c = conteudo();
      comando("criar_ideia", { texto: corpo, formatos: nova.formatos, local_id: nova.id }, () => { c.ideias.unshift(nova); c.contadores.ideias = (c.contadores.ideias || 0) + 1; });
      imagens.forEach((im, n) => comando("anexar_imagem_ideia", { local_id: nova.id, imagem: im, ordem: n }));
      estado.captura = { formatos: [], texto: "", imagens: [], link: "", mostrarLink: false };
      avisar(imagens.length ? "Ideia e imagem guardadas. O Dudoo recebe assim que estiver aberto." : "Ideia guardada. O Dudoo recebe assim que estiver aberto.");
    }
    else if (a === "liberar") liberarFinanceiro();
    else if (a === "ponto") { const dentro = d.usuario.ponto === "dentro"; comando("ponto", { tipo: dentro ? "saida" : "entrada" }, () => { d.usuario.ponto = dentro ? "fora" : "dentro"; }); avisar(dentro ? "Saída registrada." : "Entrada registrada."); }
    else if (a === "publicar-aviso") {
      const texto = ($("#aviso-texto") || {}).value || "", projeto = el.dataset.projeto || ($("#aviso-projeto") || {}).value || estado.projeto;
      if (!texto.trim()) { avisar("Escreva o aviso antes de publicar."); return; }
      comando("publicar_aviso", { projeto, texto: texto.trim() });
      avisar("Aviso enviado para publicação no portal.");
      if ($("#aviso-texto")) $("#aviso-texto").value = "";
    } else if (a === "cadastro-lead") {
      // Cadastro de leads (18/10/2026): cola o texto que a agência manda ("Novo Lead Cadastrado! Nome: … Telefone: …") e o Dudoo cadastra como o atalho "Cadastre o lead:".
      abrirFolha("Cadastro de leads", `<label class="rot">Texto do lead (cole como a agência mandou)</label><textarea class="campo" id="lead-texto" style="min-height:240px" placeholder="🎉 Novo Lead Cadastrado! 🎉&#10;Nome: …&#10;Telefone: …&#10;Tipo do Imóvel: …&#10;Tamanho (m²): …&#10;Localização: …&#10;Criativo: …"></textarea><div class="mini">O Dudoo do computador cadastra o lead quando estiver aberto.</div>`, "Cadastrar lead", () => {
        const texto = ($("#lead-texto").value || "").trim();
        if (!texto) { avisar("Cole o texto do lead."); return false; }
        if (!/nome\s*:/i.test(texto)) { avisar('Não achei a linha "Nome:" no texto.'); return false; }
        comando("cadastrar_lead", { texto });
        avisar("Lead enviado. O Dudoo cadastra quando estiver aberto.");
        setTimeout(() => oferecerPrimeiraMensagem(texto), 250);        // a folha atual fecha ao confirmar; a oferta abre logo depois
      });
    } else if (a === "quadro-novo") {
      const q = novoRascunho(); abrirQuadro(q.local_id);
    } else if (a === "quadro-planta") {
      escolherPlanta();
    } else if (a === "nova-tarefa") {
      const hoje = new Date().toISOString().slice(0, 10);
      const projetos = (d.projetos || []).filter((p) => p.estado === "ativo")
        .map((p) => `<option value="${esc(p.codigo)}" ${p.id === estado.projeto ? "selected" : ""}>${esc(p.codigo)} ${esc(p.nome)}</option>`).join("");
      const campos = `<label class="rot">Tarefa</label><input class="campo" id="t-titulo" placeholder="Ex.: Ligar para o fornecedor" autocomplete="off">
        <label class="rot">Projeto</label><select class="campo" id="t-projeto"><option value="">Sem projeto</option>${projetos}</select>
        <label class="rot">Prazo (opcional)</label><input class="campo" id="t-prazo" type="date">`;
      abrirFolha("Nova tarefa", campos, "Criar", () => {
        const titulo = ($("#t-titulo").value || "").trim(), codigo = $("#t-projeto").value || "", prazo = $("#t-prazo").value || "";
        if (!titulo) { avisar("Escreva a tarefa."); return false; }
        const proj = d.projetos.find((x) => x.codigo === codigo);
        const nova = { id: "novo-" + Date.now(), titulo, feita: false, prazo };
        comando("criar_tarefa", { titulo, projeto: codigo, prazo, local_id: nova.id }, () => {
          if (proj) proj.tarefas.unshift(nova);
          d.hoje.tarefas = d.hoje.tarefas || [];
          d.hoje.tarefas.unshift({ id: nova.id, titulo, projeto: codigo, prazo, atrasada: !!prazo && prazo < hoje });
        });
        avisar(proj ? `Tarefa criada em ${proj.codigo}. O Dudoo grava assim que estiver aberto.` : "Tarefa criada. O Dudoo grava assim que estiver aberto.");
      });
      setTimeout(() => { const t = $("#t-titulo"); if (t) t.focus(); }, 60);
    } else if (a === "nova-receber" || a === "nova-pagar") {
      const receber = a === "nova-receber", escopo = estado.fin, hoje = new Date().toISOString().slice(0, 10);
      const pedeProjeto = receber && escopo === "escritorio";
      const projetos = (d.projetos || []).map((p) => `<option value="${esc(p.codigo)}" ${p.id === estado.projeto ? "selected" : ""}>${esc(p.codigo)} ${esc(p.nome)}</option>`).join("");
      const campos = `${pedeProjeto ? `<label class="rot">Projeto</label><select class="campo" id="n-projeto">${projetos}</select>` : ""}
        <label class="rot">Descrição</label><input class="campo" id="n-desc" placeholder="${receber ? "Ex.: Honorários — parcela 2" : "Ex.: Conta de luz"}">
        <label class="rot">Valor (R$)</label><input class="campo" id="n-valor" inputmode="decimal" data-mascara="dinheiro" placeholder="0,00">
        <label class="rot">Vencimento</label><input class="campo" id="n-venc" type="date" value="${hoje}">`;
      abrirFolha(`${receber ? "Nova conta a receber" : "Nova conta a pagar"} · ${escopo === "pessoal" ? "Pessoal" : "Escritório"}`, campos, "Criar", () => {
        const descricao = ($("#n-desc").value || "").trim(), valor = numeroBr($("#n-valor").value), venc = $("#n-venc").value;
        const projeto = pedeProjeto ? ($("#n-projeto").value || "") : "";
        if (!descricao) { avisar("Escreva a descrição."); return false; }
        if (!(valor > 0)) { avisar("Valor inválido."); return false; }
        if (!venc) { avisar("Escolha o vencimento."); return false; }
        const nova = { id: "novo-" + Date.now(), descricao, valor, venc, status: venc < hoje ? "vencida" : "aberta", projeto };
        comando(receber ? "criar_conta_receber" : "criar_conta_pagar", { descricao, valor, vencimento: venc, projeto, escopo, local_id: nova.id }, () => {
          const pm = d.financeiro[escopo].por_mes[venc.slice(0, 7)];
          if (pm) (receber ? pm.a_receber : pm.a_pagar).unshift(nova);
        });
        avisar("Conta criada. O Dudoo grava assim que estiver aberto.");
      });
    } else if (a === "colar-link") {
      const texto = (($("#cfg-link") || {}).value || "").trim();
      const ok = conectarPorLink(texto);
      if (!ok) { avisar("Link inválido. Copie de novo no Dudoo."); return; }
      await carregar(true); await enviarFila(); desenhar(); avisar(estado.erroConexao || "Conectado ao Dudoo.");
    } else if (a === "whatsapp-projeto") avisar("Abre o WhatsApp do cliente quando o Dudoo estiver conectado.");
  }
});
document.addEventListener("change", async (e) => {
  if (e.target && e.target.id === "nota-filtro") { estado.filtroNotas = e.target.value; desenhar(); return; }
  if (e.target && e.target.id === "obra-filtro") { estado.filtroObra = e.target.value; desenhar(); return; }
  if (e.target && e.target.id === "ideia-arquivo") {
    const t = $("#ideia-texto"); if (t) estado.captura.texto = t.value;
    const l = $("#ideia-link"); if (l) estado.captura.link = l.value;
    for (const arquivo of [...(e.target.files || [])].slice(0, 4 - estado.captura.imagens.length)) {
      try { estado.captura.imagens.push(await comprimirImagem(arquivo)); } catch (_) { avisar("Não consegui ler essa imagem."); }
    }
    desenhar(); return;
  }
  if (e.target && e.target.id === "ideia-arquivo-card" && e.target.files && e.target.files[0] && estado.alvoImagem) {
    const id = estado.alvoImagem; estado.alvoImagem = "";
    try {
      const im = await comprimirImagem(e.target.files[0]);
      const c = conteudo(), local = id.startsWith("novo-");
      comando("anexar_imagem_ideia", local ? { local_id: id, imagem: im } : { ideia_id: id, imagem: im }, () => {
        [c.semana, c.ideias].forEach((lista) => lista.forEach((i) => { if (i.id === id && !i.miniatura) i.miniatura = im; }));
      });
      avisar("Imagem anexada à ideia.");
    } catch (_) { avisar("Não consegui ler essa imagem."); }
  }
});
document.addEventListener("submit", (e) => {
  const f = e.target.closest("[data-form='pergunta']"); if (!f) return;
  e.preventDefault();
  const texto = $("#pergunta").value.trim(); if (!texto) return;
  comando("pergunta", { texto });
  avisar(estado.demo ? "Pergunta guardada (modo demonstração)." : "Pergunta enviada ao Dudoo."); $("#pergunta").value = "";
});

window.addEventListener("online", enviarFila);
// Link de conexão (#c=<base64url {b: endereço, t: chave}>): salva a conexão. Aceita o link inteiro ou só o trecho "c=...".
function conectarPorLink(texto) {
  try {
    const m = /c=([A-Za-z0-9_-]+)/.exec(String(texto || ""));
    if (!m) return false;
    let b = m[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    const c = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b), (ch) => ch.charCodeAt(0))));
    if (!(c && c.b && c.t)) return false;
    gravar(CHAVE_CFG, { base: String(c.b), token: String(c.t) });
    return true;
  } catch (e) { return false; }
}
function lerLinkDeConexao() {
  if (/[#&]c=/.test(location.hash || "")) {
    conectarPorLink(location.hash);
    history.replaceState(null, "", location.pathname + location.search);
  }
}

(async function iniciar() {
  lerLinkDeConexao();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* sem suporte: segue */ }
  estado.dados = ler(CHAVE_DADOS, null);
  await carregar(false);
  desenhar();
  enviarFila();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
})();
