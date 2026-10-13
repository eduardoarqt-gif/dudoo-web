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
  aba: "hoje", projeto: null, subProjeto: "resumo", subPortal: "atividade", fin: "escritorio", finSub: "receber",
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
const ABAS = [["hoje", "Hoje"], ["projetos", "Projetos"], ["ideias", "Ideias"], ["portal", "Portal"], ["financeiro", "Financeiro"], ["mais", "Mais"]];

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
    <button class="atualizar" data-acao="atualizar">Atualizar</button></div></div>
    <form class="perg" data-form="pergunta"><input id="pergunta" placeholder="Pergunte ou peça algo ao Dudoo…" autocomplete="off"><button>Enviar</button></form>
    ${estado.demo ? '<div class="card toque" data-aba-ir="mais"><div class="t"><b>Conectar ao Dudoo</b><div class="p">Você está vendo dados de exemplo. Toque para colar o link de conexão.</div></div></div>' : ""}
    ${estado.erroConexao ? `<div class="card pendente"><div class="p" style="margin:0">${esc(estado.erroConexao)} Mostrando os últimos dados.</div></div>` : ""}
    <h2 class="sec">Precisa de você · ${d.hoje.precisa.length}</h2>
    ${d.hoje.precisa.map((i) => `<div class="card toque" data-precisa="${esc(i.id)}"><div class="linha"><div class="t">${esc(i.titulo)}<div class="p">${esc(i.detalhe)}</div></div><span class="pill ${i.cor || "c"} dir">${esc(i.badge)}</span></div></div>`).join("") || '<div class="vazio">Nada pendente agora.</div>'}
    <h2 class="sec">Agenda</h2>
    ${Object.keys(dias).sort().map((dia) => { const dt = new Date(dia + "T12:00"); return `<div class="card"><div class="p" style="margin:0 0 4px">${sem[dt.getDay()]} ${dataBr(dia)}${dia === hojeIso ? " · hoje" : ""}</div>${dias[dia].map((e) => `<div class="t">${esc(e.hora)} ${esc(e.titulo)}</div>`).join("")}</div>`; }).join("") || '<div class="vazio">Sem compromissos nesta semana.</div>'}`;
}

function telaProjetos() {
  const d = estado.dados;
  if (estado.projeto) {
    const p = d.projetos.find((x) => x.id === estado.projeto);
    if (!p) { estado.projeto = null; return telaProjetos(); }
    const abas = [["resumo", "Resumo"], ["tarefas", "Tarefas"], ["notas", "Notas"], ["portal", "Portal"]];
    let corpo = "";
    if (estado.subProjeto === "resumo") {
      corpo = `<h2 class="sec">Andamento</h2><div class="card">${p.frentes.map((f) => `<div class="linha" style="margin-bottom:10px"><div class="t">${esc(f.nome)}<div class="barra"><i style="width:${f.pct}%"></i></div></div><span class="val dir">${f.pct}%</span></div>`).join("")}</div>
        <h2 class="sec">Próximo prazo</h2><div class="card"><div class="t" style="color:${p.atrasado ? "var(--verm)" : "inherit"}">${esc(p.prazo)}</div></div>
        <h2 class="sec">Atalhos</h2><button class="btn o peq" data-acao="whatsapp-projeto">WhatsApp do cliente</button><button class="btn o peq" data-aba-ir="portal">Ver no portal</button>`;
    } else if (estado.subProjeto === "tarefas") {
      corpo = `<h2 class="sec">Tarefas · ${p.tarefas.filter((t) => !t.feita).length} abertas</h2>` +
        (p.tarefas.map((t) => `<div class="card"><div class="linha"><button class="check ${t.feita ? "ok" : ""}" data-tarefa="${esc(t.id)}" aria-label="Concluir"></button><div class="t ${t.feita ? "feita" : ""}">${esc(t.titulo)}</div></div></div>`).join("") || '<div class="vazio">Sem tarefas.</div>');
    } else if (estado.subProjeto === "notas") {
      corpo = blocoNotas(p.codigo);
    } else {
      corpo = `<h2 class="sec">Avisar o cliente</h2><div class="card"><textarea class="campo" id="aviso-texto" placeholder="Escreva o aviso para o portal…"></textarea><button class="btn" data-acao="publicar-aviso" data-projeto="${esc(p.id)}">Publicar no portal</button></div>`;
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
  return `<details class="card nota${n.pendente ? " pendente" : ""}"><summary><span class="t"><b>${esc(n.titulo)}</b><span class="p">${esc(quandoNota(n.atualizado))}${n.pendente ? " · aguardando o Dudoo" : ""}</span></span>${projeto}</summary>
    <div class="nota-texto">${esc(resto || "(sem mais texto)")}</div></details>`;
}
function blocoNotas(codigo) {
  const d = estado.dados, lista = todasNotas().filter((n) => (codigo === undefined ? true : codigo === "" ? !n.projeto : n.projeto === codigo));
  const opcoes = `<option value="">Sem projeto</option>` + d.projetos.map((p) => `<option value="${esc(p.codigo)}" ${p.codigo === codigo ? "selected" : ""}>${esc(p.codigo)} ${esc(p.nome)}</option>`).join("");
  return `<div class="card"><select class="campo" id="nota-projeto" style="margin-top:0">${opcoes}</select>
      <textarea class="campo" id="nota-texto" placeholder="Escreva a nota…"></textarea><button class="btn" data-acao="salvar-nota">Salvar nota</button></div>
    <h2 class="sec">${lista.length} nota(s)</h2>${lista.map(cartaoNota).join("") || '<div class="vazio">Nenhuma nota.</div>'}`;
}
function telaNotas() {
  const filtro = estado.filtroNotas;
  const d = estado.dados;
  const opcoes = [`<option value="__todas" ${filtro === "__todas" ? "selected" : ""}>Todas as notas</option>`, `<option value="" ${filtro === "" ? "selected" : ""}>Sem projeto</option>`]
    .concat(d.projetos.map((p) => `<option value="${esc(p.codigo)}" ${filtro === p.codigo ? "selected" : ""}>${esc(p.codigo)} ${esc(p.nome)}</option>`)).join("");
  return `<button class="voltar" data-acao="voltar-hoje">‹ Hoje</button><h1>Notas</h1><div class="mini">Sincronizadas com o Simplenote · etiqueta = número do projeto</div>
    <select class="campo" id="nota-filtro">${opcoes}</select>${blocoNotas(filtro === "__todas" ? undefined : filtro)}`;
}

function telaPortal() {
  const d = estado.dados.portal, abas = [["atividade", "Atividade"], ["acessos", "Acessos"], ["aviso", "Avisos"]];
  let corpo;
  if (estado.subPortal === "acessos") {
    corpo = d.acessos.map((a) => `<div class="card"><div class="linha"><div class="t"><b>${esc(a.cliente)}</b><div class="p">${esc(a.projeto)} · ${esc(a.quando)}${a.total ? ` · ${a.total} acessos` : ""}</div></div>${a.novo ? '<span class="pill v dir">NOVO</span>' : a.parado ? '<span class="pill c dir">PARADO</span>' : ""}</div></div>`).join("");
  } else if (estado.subPortal === "aviso") {
    const opcoes = estado.dados.projetos.map((p) => `<option value="${esc(p.id)}">${esc(p.codigo)} ${esc(p.nome)}</option>`).join("");
    corpo = `<div class="card"><select class="campo" id="aviso-projeto" style="margin-top:0">${opcoes}</select><textarea class="campo" id="aviso-texto" placeholder="Escreva o aviso para o portal…"></textarea><button class="btn" data-acao="publicar-aviso">Publicar no portal</button></div>`;
  } else {
    corpo = d.atividade.map((a) => `<div class="card"><div class="linha"><div class="t">${esc(a.titulo)}<div class="p">${esc(a.detalhe)}</div></div><span class="pill ${a.tipo} dir"></span></div></div>`).join("");
  }
  return `<h1>Portal do cliente</h1><div class="seg">${abas.map(([k, n]) => `<button data-subportal="${k}" class="${estado.subPortal === k ? "on" : ""}">${n}</button>`).join("")}</div>${corpo}`;
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
  const soma = (l, f) => l.filter(f).reduce((s, x) => s + x.valor, 0);
  const subs = [["receber", "A receber"], ["pagar", "A pagar"], ["projecao", "Projeção"]];
  let corpo = "";
  if (estado.finSub === "projecao") {
    corpo = (c.projecao.map((m) => `<div class="card"><div class="linha"><div class="t"><b>${esc(m.mes)}</b><div class="p">Entradas ${brl(m.entradas)} · Saídas ${brl(m.saidas)}</div></div><span class="val dir" style="color:${m.entradas >= m.saidas ? "var(--verde)" : "var(--verm)"}">${brl(m.entradas - m.saidas)}</span></div></div>`).join("")) || '<div class="vazio">Sem projeção para este escopo.</div>';
  } else {
    const lista = estado.finSub === "receber" ? dadosMes.a_receber : dadosMes.a_pagar;
    corpo = lista.map((x) => {
      const fechada = !aberta(x);
      const pend = x.id && estado.fila.some((i) => i.status === "pendente" && i.payload.conta_id === x.id);
      const podeBaixar = x.id && !fechada && !(estado.fin === "pessoal" && estado.finSub === "pagar" && x.grupo !== "despesas");
      const rotuloData = x.status === "vencida" ? "Venceu" : fechada ? (estado.finSub === "receber" ? "Recebida" : "Paga") : "Vence";
      return `<div class="card ${pend ? "pendente" : ""}"><div class="linha"><div class="t"><b>${esc(x.descricao)}</b><div class="p"><span style="color:${x.status === "vencida" ? "var(--verm)" : "inherit"}">${rotuloData} ${dataBr(x.venc)}</span>${x.projeto ? " · " + esc(x.projeto) : ""}${pend ? " · aguardando o Dudoo" : ""}</div></div><span class="val dir" style="${fechada ? "color:var(--texto2)" : ""}">${brl(x.valor)}</span></div>
        ${fechada ? '<div class="p">✓ Baixa registrada</div>' : podeBaixar ? `<button class="acao" data-baixa="${esc(x.id)}">✓ ${estado.finSub === "receber" ? (x.rt ? "Marcar recebida" : "Dar baixa") : "Marcar paga"}</button>` : '<div class="p">Baixa pelo Dudoo (cartão/financiamento).</div>'}</div>`;
    }).join("") || `<div class="vazio">Nada em ${esc(rotuloMes(mes))}.</div>`;
  }
  return `<h1>Financeiro</h1>
    <div class="seg"><button data-fin="escritorio" class="${estado.fin === "escritorio" ? "on" : ""}">Escritório</button><button data-fin="pessoal" class="${estado.fin === "pessoal" ? "on" : ""}">Pessoal</button></div>
    <div class="mes"><button data-mes="-1" ${idx <= 0 ? "disabled" : ""} aria-label="Mês anterior">‹</button><div><b>${esc(rotuloMes(mes))}</b>${mes === F.mes_atual ? '<span class="mini"> · mês atual</span>' : ""}</div><button data-mes="1" ${idx >= meses.length - 1 ? "disabled" : ""} aria-label="Próximo mês">›</button></div>
    <div class="kpis"><div class="kpi"><small>A receber</small><strong>${brl(soma(dadosMes.a_receber, aberta))}</strong><small>Recebido ${brl(soma(dadosMes.a_receber, (x) => !aberta(x)))}</small></div>
      <div class="kpi"><small>A pagar</small><strong>${brl(soma(dadosMes.a_pagar, aberta))}</strong><small>Pago ${brl(soma(dadosMes.a_pagar, (x) => !aberta(x)))}</small></div></div>
    <div class="seg">${subs.map(([k, n]) => `<button data-finsub="${k}" class="${estado.finSub === k ? "on" : ""}">${n}</button>`).join("")}</div>${corpo}
    ${estado.finSub === "receber" ? '<button class="fab" data-acao="nova-receber">+ Conta a receber</button>' : ""}`;
}

function blocoConexao() {
  return `<div class="p" style="margin:0 0 6px">Cole o link de conexão que o Dudoo copiou (Configurações → Dudoo Web → Copiar link de conexão do iPhone).</div>
    <textarea class="campo" id="cfg-link" placeholder="https://eduardoarqt-gif.github.io/dudoo-web/#c=..." style="min-height:70px;margin-top:0"></textarea>
    <button class="btn" data-acao="colar-link">Conectar</button>`;
}

function telaMais() {
  const ponto = estado.dados.usuario.ponto === "dentro";
  return `<h1>Mais</h1>
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
  const telas = { hoje: telaHoje, projetos: telaProjetos, ideias: telaIdeias, portal: telaPortal, financeiro: telaFinanceiro, mais: telaMais, notas: telaNotas };
  const y = window.scrollY;
  $("#app").innerHTML = telas[estado.aba]();
  desenharAbas();
  window.scrollTo(0, y);
  if (estado.aba === "ideias") ligarLeque();
}

// ---------------------------------------------------------------- ideias (Central de Conteúdo) — leque "de cinema"
const NOMES_FORMATO = { feed: "Feed", carrossel: "Carrossel", reels: "Reels", stories: "Stories", site: "Site / Blog", faq: "FAQ" };
estado.captura = { formatos: [], texto: "" };
estado.leque = { escopo: "semana", indice: 0 };
const conteudo = () => (estado.dados && estado.dados.conteudo) || { semana: [], ideias: [], contadores: {}, formatos: [] };
const listaDoLeque = () => (estado.leque.escopo === "semana" ? conteudo().semana : conteudo().ideias.filter((i) => i.situacao === "solta" || i.situacao === "aceita"));

function cartaoLeque(i, n) {
  const feita = i.situacao === "arquivada", aceita = i.situacao === "aceita";
  const chips = Object.keys(NOMES_FORMATO).map((k) =>
    `<button class="chip${(i.formatos || []).includes(k) ? " on" : ""}" data-formato="${k}" data-ideia="${esc(i.id)}">${NOMES_FORMATO[k]}</button>`).join("");
  return `<div class="carta${feita ? " feita-c" : ""}" data-n="${n}">
    <div><span class="pill c">${esc(i.serie || "Sem série")}</span>${i.prioridade === "alta" ? ' <span class="pill a">alta</span>' : ""}</div>
    <h3>${esc(i.titulo)}</h3>
    <div class="chips">${chips}</div>
    <div class="carta-acoes">${feita ? '<span class="pill v">concluída</span>' : `
      <button class="btn peq" data-ideia-acao="aceitar" data-ideia="${esc(i.id)}">${aceita ? "Aceita ✓" : "Aceitar"}</button>
      <button class="btn o peq" data-ideia-acao="executado" data-ideia="${esc(i.id)}">Executado</button>
      <button class="btn o peq" data-ideia-acao="adiar" data-ideia="${esc(i.id)}">Adiar</button>
      <button class="btn o peq" data-ideia-acao="descartar" data-ideia="${esc(i.id)}">Descartar</button>`}</div></div>`;
}

function telaIdeias() {
  const c = conteudo(), ct = c.contadores || {}, lista = listaDoLeque();
  const todas = c.ideias.filter((i) => i.situacao !== "arquivada");
  const captura = Object.keys(NOMES_FORMATO).map((k) =>
    `<button class="chip${estado.captura.formatos.includes(k) ? " on" : ""}" data-cap-formato="${k}">${NOMES_FORMATO[k]}</button>`).join("");
  return `<h1>Ideias</h1><div class="mini">${ct.ideias || 0} ideias · ${ct.planejados || 0} planejadas · ${ct.em_producao || 0} em produção · ${ct.publicados || 0} publicadas</div>
    <div class="card" style="margin-top:12px"><textarea class="campo" id="ideia-texto" style="margin-top:0;min-height:74px" placeholder="Acabou de ter uma ideia? Escreva ou dite aqui…">${esc(estado.captura.texto)}</textarea>
      <div class="chips" style="margin-top:8px">${captura}</div><button class="btn" data-acao="guardar-ideia">Guardar ideia</button></div>
    <div class="seg"><button class="${estado.leque.escopo === "semana" ? "on" : ""}" data-escopo="semana">Da semana · ${c.concluidos || 0}/${c.total || 0}</button>
      <button class="${estado.leque.escopo === "todas" ? "on" : ""}" data-escopo="todas">Todas abertas</button></div>
    ${lista.length ? `<div class="leque"><div class="trilho" id="trilho">${lista.map(cartaoLeque).join("")}</div></div>
      <div class="pontos" id="pontos">${lista.map((_, n) => `<i data-n="${n}"></i>`).join("")}</div>` : '<div class="vazio">Nenhuma ideia ainda. Anote a primeira acima, sem organizar agora.</div>'}
    <h2 class="sec">Banco de ideias · ${todas.length}</h2>
    ${todas.map((i) => `<div class="card"><div class="linha"><div class="t"><b>${esc(i.titulo)}</b><div class="p">${esc(i.serie || "Sem série")}${(i.formatos || []).length ? " · " + i.formatos.map((f) => NOMES_FORMATO[f] || f).join(", ") : ""}</div></div>
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

function acaoIdeia(id, acao) {
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

// ---------------------------------------------------------------- ações
document.addEventListener("click", async (e) => {
  const q = (s) => e.target.closest(s);
  const d = estado.dados;
  let el;
  if ((el = q("[data-aba]"))) { estado.aba = el.dataset.aba; estado.projeto = null; desenhar(); window.scrollTo(0, 0); if (estado.aba === "financeiro" && !estado.liberado) liberarFinanceiro(); return; }
  if ((el = q("[data-aba-ir]"))) { estado.aba = el.dataset.abaIr; if (estado.aba === "notas") marcarNotasVistas(); desenhar(); window.scrollTo(0, 0); return; }
  if ((el = q("[data-projeto]"))) { estado.projeto = el.dataset.projeto; estado.subProjeto = "resumo"; desenhar(); window.scrollTo(0, 0); return; }
  if ((el = q("[data-subprojeto]"))) { estado.subProjeto = el.dataset.subprojeto; desenhar(); return; }
  if ((el = q("[data-subportal]"))) { estado.subPortal = el.dataset.subportal; desenhar(); return; }
  if ((el = q("[data-fin]"))) { estado.fin = el.dataset.fin; desenhar(); return; }
  if ((el = q("[data-mes]"))) {
    const m = estado.dados.financeiro.meses, i = m.indexOf(estado.mes) + Number(el.dataset.mes);
    if (i >= 0 && i < m.length) { estado.mes = m[i]; desenhar(); }
    return;
  }
  if ((el = q("[data-finsub]"))) { estado.finSub = el.dataset.finsub; desenhar(); return; }
  if ((el = q("[data-tarefa]"))) {
    const p = d.projetos.find((x) => x.id === estado.projeto), t = p && p.tarefas.find((x) => x.id === el.dataset.tarefa);
    if (t) comando("concluir_tarefa", { projeto: p.id, tarefa_id: t.id, feita: !t.feita }, () => { t.feita = !t.feita; });
    return;
  }
  if ((el = q("[data-baixa]"))) {
    const pm = d.financeiro[estado.fin].por_mes[estado.mes] || { a_receber: [], a_pagar: [] };
    const lista = estado.finSub === "receber" ? pm.a_receber : pm.a_pagar, c = lista.find((x) => x.id === el.dataset.baixa);
    if (!c) return;
    const tipo = estado.finSub === "receber" ? (c.rt ? "marcar_rt_recebida" : "marcar_conta_receber_recebida") : "marcar_conta_pagar_paga";
    comando(tipo, { conta_id: c.id, projeto: c.projeto || "", escopo: estado.fin, data: new Date().toISOString().slice(0, 10) }, () => { c.status = estado.finSub === "receber" ? "recebida" : "paga"; });
    avisar("Baixa registrada. O Dudoo aplica assim que estiver aberto.");
    return;
  }
  if ((el = q("[data-precisa]"))) {
    const item = d.hoje.precisa.find((x) => x.id === el.dataset.precisa);
    if (item && item.tipo === "lead" && item.telefone) { window.open("https://wa.me/" + String(item.telefone).replace(/\D/g, ""), "_blank"); }
    else if (item && item.projeto) { estado.aba = "projetos"; estado.projeto = item.projeto; estado.subProjeto = "resumo"; desenhar(); }
    else if (item && item.tipo === "pagar") { estado.aba = "financeiro"; estado.finSub = "pagar"; desenhar(); if (!estado.liberado) liberarFinanceiro(); }
    return;
  }
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
    else if (a === "salvar-nota") {
      const texto = (($("#nota-texto") || {}).value || "").trim(), codigo = ($("#nota-projeto") || {}).value || "";
      if (!texto) { avisar("Escreva a nota antes de salvar."); return; }
      const proj = d.projetos.find((x) => x.codigo === codigo);
      const completo = proj ? `${proj.codigo} ${proj.nome}\n${texto}` : texto;
      const nova = { id: "novo-" + Date.now(), titulo: completo.split("\n")[0].slice(0, 80), texto: completo, projeto: codigo, atualizado: new Date().toISOString(), pendente: true };
      comando("criar_nota", { texto, projeto: codigo, local_id: nova.id }, () => { d.notas.unshift(nova); });
      avisar("Nota guardada. Vai pro Simplenote quando o Dudoo estiver aberto.");
    }
    else if (a === "guardar-ideia") {
      const texto = (($("#ideia-texto") || {}).value || "").trim();
      if (!texto) { avisar("Escreva a ideia antes de guardar."); return; }
      const nova = { id: "novo-" + Date.now(), titulo: texto.split("\n")[0].slice(0, 90), serie: "", prioridade: "normal", situacao: "solta",
        formatos: estado.captura.formatos.slice(), projeto: "", pecas: [], criado_em: new Date().toISOString().slice(0, 10), origem: "iphone" };
      const c = conteudo();
      comando("criar_ideia", { texto, formatos: nova.formatos, local_id: nova.id }, () => { c.ideias.unshift(nova); c.contadores.ideias = (c.contadores.ideias || 0) + 1; });
      estado.captura = { formatos: [], texto: "" };
      avisar("Ideia guardada. O Dudoo recebe assim que estiver aberto.");
    }
    else if (a === "liberar") liberarFinanceiro();
    else if (a === "ponto") { const dentro = d.usuario.ponto === "dentro"; comando("ponto", { tipo: dentro ? "saida" : "entrada" }, () => { d.usuario.ponto = dentro ? "fora" : "dentro"; }); avisar(dentro ? "Saída registrada." : "Entrada registrada."); }
    else if (a === "publicar-aviso") {
      const texto = ($("#aviso-texto") || {}).value || "", projeto = el.dataset.projeto || ($("#aviso-projeto") || {}).value || estado.projeto;
      if (!texto.trim()) { avisar("Escreva o aviso antes de publicar."); return; }
      comando("publicar_aviso", { projeto, texto: texto.trim() });
      avisar("Aviso enviado para publicação no portal.");
      if ($("#aviso-texto")) $("#aviso-texto").value = "";
    } else if (a === "nova-receber") {
      const descricao = window.prompt("Descrição da conta a receber"); if (!descricao) return;
      const valor = parseFloat((window.prompt("Valor (R$)") || "").replace(/\./g, "").replace(",", ".")); if (!(valor > 0)) { avisar("Valor inválido."); return; }
      const venc = window.prompt("Vencimento (AAAA-MM-DD)", new Date().toISOString().slice(0, 10)); if (!venc) return;
      const nova = { id: "novo-" + Date.now(), descricao, valor, venc, status: "aberta", projeto: estado.projeto || "" };
      comando("criar_conta_receber", { descricao, valor, vencimento: venc, projeto: nova.projeto, escopo: estado.fin, local_id: nova.id }, () => {
        const pm = d.financeiro[estado.fin].por_mes[venc.slice(0, 7)];
        if (pm) pm.a_receber.unshift(nova);
      });
    } else if (a === "colar-link") {
      const texto = (($("#cfg-link") || {}).value || "").trim();
      const ok = conectarPorLink(texto);
      if (!ok) { avisar("Link inválido. Copie de novo no Dudoo."); return; }
      await carregar(true); await enviarFila(); desenhar(); avisar(estado.erroConexao || "Conectado ao Dudoo.");
    } else if (a === "whatsapp-projeto") avisar("Abre o WhatsApp do cliente quando o Dudoo estiver conectado.");
  }
});
document.addEventListener("change", (e) => {
  if (e.target && e.target.id === "nota-filtro") { estado.filtroNotas = e.target.value; desenhar(); }
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
