/* Dudoo Web — pareamento por código (18/11/2026). O Dudoo Arq gera um código de 8 caracteres (vale 5 min, uso único); aqui ele é trocado por uma chave PRÓPRIA do celular
   (dudoo_pareamento_trocar). A chave fica só no armazenamento deste aparelho: nunca vai em URL, nunca é escrita em log/aviso. Regras puras (sem tela), testadas em tests/test_dudoo_web_pareamento.py.
   Enquanto o método antigo (token no link) existir, ele continua como alternativa: com chave, só a chave é enviada; se a chave for recusada, o app tenta o token (se houver). */
"use strict";

const DudooPareamento = (() => {
  const BASE_PADRAO = "https://www.eduardoschmidt.arq.br/_functions";
  const TAMANHO_CODIGO = 8;

  // Só letras e números, em maiúsculas, até 8 (aceita "ABCD 2345", "abcd-2345" e colagem com espaços).
  const normalizarCodigo = (texto) => String(texto || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, TAMANHO_CODIGO);

  const rotuloDoAparelho = (agente) => {
    const ua = String(agente || "");
    if (/iPad/i.test(ua)) return "iPad";
    if (/iPhone/i.test(ua)) return "iPhone";
    if (/Android/i.test(ua)) return "Celular Android";
    return "Celular";
  };

  // ISO ('2026-11-18T10:00:00Z') -> DD/MM/AAAA no fuso do aparelho; vazio se não vier.
  const dataCompleta = (iso) => {
    const d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return "";
    const dois = (n) => String(n).padStart(2, "0");
    return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
  };

  const mensagemDaTroca = (status) => {
    if (status === 404) return "Código inválido, vencido ou já usado. No Dudoo do computador, gere outro em Configurações → Dudoo Web → Parear celular.";
    if (status === 429) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
    if (status === 400) return "Digite o código de 8 caracteres que aparece no Dudoo.";
    return `O serviço não respondeu direito (erro ${status}). Tente de novo em instantes.`;
  };

  // Troca o código pela chave do celular. Devolve {chave, chaveId, criadoEm}; em qualquer falha lança Error com texto em português (sem nunca citar chave/código).
  async function trocarCodigo(base, codigoDigitado, rotulo, buscar) {
    const codigo = normalizarCodigo(codigoDigitado);
    if (codigo.length !== TAMANHO_CODIGO) throw new Error(mensagemDaTroca(400));
    let r;
    try {
      r = await buscar(`${String(base || BASE_PADRAO).replace(/\/$/, "")}/dudoo_pareamento_trocar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo_pareamento: codigo, rotulo: rotulo || "" }),
      });
    } catch (e) { throw new Error("Sem conexão com o serviço. Confira a internet do celular e tente de novo."); }
    if (!r.ok) throw new Error(mensagemDaTroca(r.status));
    let j = null;
    try { j = await r.json(); } catch (e) { /* resposta sem corpo */ }
    const c = j && j.chave_dispositivo;
    if (!(c && c.chave)) throw new Error("O serviço não devolveu a chave do celular. Gere outro código e tente de novo.");
    return { chave: String(c.chave), chaveId: String(c.chaveId || ""), criadoEm: String(c.criadoEm || "") };
  }

  // Cabeçalho de autorização: com chave, SÓ a chave (o servidor decide só por ela quando vem); sem chave, o token do link antigo; sem nada, vazio.
  const cabecalhos = (c) => {
    c = c || {};
    if (c.chave) return { "X-Dudoo-Chave": c.chave };
    if (c.token) return { "X-Dudoo-Token": c.token };
    return {};
  };
  // `revogada`: a chave foi cancelada no Dudoo (e apagada daqui); o app continua "com conexão" para pedir novo pareamento em vez de cair em dados de exemplo.
  const temCredencial = (c) => !!(c && c.base && (c.chave || c.token || c.revogada));

  // Depois de um 403 com chave: pergunta ao servidor se foi revogada ou só não vale. Devolve "revogada" | "invalida" | "desconhecida" (rede/429).
  async function situacaoDaChave(base, chave, buscar) {
    try {
      const r = await buscar(`${String(base || BASE_PADRAO).replace(/\/$/, "")}/dudoo_chave_status`, { headers: { "X-Dudoo-Chave": chave } });
      if (r.ok) return "ativa";
      if (r.status === 403) {
        let j = null;
        try { j = await r.json(); } catch (e) { /* sem corpo */ }
        return j && j.erro === "chave_revogada" ? "revogada" : "invalida";
      }
      return "desconhecida";
    } catch (e) { return "desconhecida"; }
  }

  return { BASE_PADRAO, normalizarCodigo, rotuloDoAparelho, dataCompleta, mensagemDaTroca, trocarCodigo, cabecalhos, temCredencial, situacaoDaChave };
})();

if (typeof module !== "undefined" && module.exports) module.exports = DudooPareamento;
