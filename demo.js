// Dados de exemplo (modo demonstração): o app usa isto até ser ligado ao Dudoo do escritório (Mais → Conexão).
window.DUDOO_DEMO = {
  atualizado_em: new Date().toISOString(),
  usuario: { nome: "Eduardo", ponto: "fora" },
  hoje: {
    precisa: [
      { id: "a1", tipo: "aprovacao", titulo: "Cliente aprovou o layout do térreo", detalhe: "015-26 Deane e Vinicius · há 2 h", badge: "APROVAÇÃO", cor: "v", projeto: "015-26" },
      { id: "a2", tipo: "comentario", titulo: "Responder comentário no portal", detalhe: "021-26 Ventisol · Planta baixa", badge: "COMENTÁRIO", cor: "a", projeto: "021-26" },
      { id: "a3", tipo: "lead", titulo: "Follow-up 3/5 — Darlan Portugal", detalhe: "Abrir o WhatsApp com o texto pronto", badge: "LEAD", cor: "c", telefone: "" },
      { id: "a4", tipo: "pagar", titulo: "INSS vence amanhã", detalhe: "Escritório · R$ 1.412,00", badge: "PAGAR", cor: "r" }
    ],
    agenda: [
      { dia: "2026-10-12", hora: "08:00", titulo: "Jr · Nossa Senhora de Aparecida" },
      { dia: "2026-10-14", hora: "15:30", titulo: "Reunião Ventisol" },
      { dia: "2026-10-14", hora: "18:00", titulo: "Casa Cor · Happy hour" },
      { dia: "2026-10-16", hora: "08:30", titulo: "Evento Somma" },
      { dia: "2026-10-17", hora: "10:00", titulo: "Outlet / calça" }
    ]
  },
  notas: [
    { id: "n1", titulo: "015-26 Deane E Vinicius", texto: "015-26 Deane E Vinicius" + String.fromCharCode(10) + "Cliente quer trocar o piso da varanda por porcelanato 120x120. Ver prazo com o fornecedor.", projeto: "015-26", atualizado: new Date().toISOString() },
    { id: "n2", titulo: "Ideias para a vitrine da semana", texto: "Ideias para a vitrine da semana" + String.fromCharCode(10) + "Mostrar antes e depois da cozinha do Elliott.", projeto: "", atualizado: new Date(Date.now() - 86400000).toISOString() }
  ],
  conteudo: {
    concluidos: 0, total: 3, contadores: { ideias: 4, planejados: 2, em_producao: 1, publicados: 0 },
    series: ["Fato ou Mito", "Antes e depois", "Dicas"],
    semana: [
      { id: "c1", titulo: "Luz branca ilumina mais que luz amarela?", serie: "Fato ou Mito", prioridade: "alta", situacao: "solta", formatos: ["reels", "stories"], pecas: [] },
      { id: "c2", titulo: "Antes e depois: Casa Bosque das Mansões", serie: "Antes e depois", prioridade: "normal", situacao: "aceita", formatos: ["feed", "reels"], pecas: [] },
      { id: "c3", titulo: "3 erros comuns na escolha do piso", serie: "Dicas", prioridade: "normal", situacao: "solta", formatos: ["carrossel"], pecas: [] }
    ],
    ideias: [
      { id: "c1", titulo: "Luz branca ilumina mais que luz amarela?", serie: "Fato ou Mito", situacao: "solta", formatos: ["reels", "stories"] },
      { id: "c2", titulo: "Antes e depois: Casa Bosque das Mansões", serie: "Antes e depois", situacao: "aceita", formatos: ["feed", "reels"] },
      { id: "c3", titulo: "3 erros comuns na escolha do piso", serie: "Dicas", situacao: "solta", formatos: ["carrossel"] },
      { id: "c4", titulo: "Casa térrea é mais barata?", serie: "Fato ou Mito", situacao: "solta", formatos: [] }
    ]
  },
  projetos: [
    { id: "015-26", codigo: "015-26", nome: "Deane e Vinicius", sub: "Casa Palmas · Projeto executivo", estado: "ativo", pct: 46, prazo: "Projetos de interiores — 22/08 (51 dias de atraso)", atrasado: true,
      frentes: [{ nome: "Arquitetônico", pct: 80 }, { nome: "Interiores", pct: 12 }],
      tarefas: [{ id: "t1", titulo: "Revisar projeto elétrico", feita: false }, { id: "t2", titulo: "Detalhar forro da sala", feita: false }] },
    { id: "021-26", codigo: "021-26", nome: "Ventisol", sub: "PT Imaruim · Estudo preliminar", estado: "ativo", pct: 50, prazo: "Apresentação em 2 dias", atrasado: false,
      frentes: [{ nome: "Estudo preliminar", pct: 50 }],
      tarefas: [{ id: "t3", titulo: "Fazer orçamento refeitório", feita: false }, { id: "t4", titulo: "Vídeo de apto?", feita: false }] },
    { id: "032-26", codigo: "032-26", nome: "Elliott", sub: "Casa Campeche · Acompanhamento mensal", estado: "ativo", pct: 39, prazo: "8 pendências", atrasado: false,
      frentes: [{ nome: "Arquitetônico", pct: 80 }, { nome: "Interiores", pct: 39 }],
      tarefas: [{ id: "t5", titulo: "Interruptores · separar por cores", feita: false }, { id: "t6", titulo: "Pré-projeto da porta do quarto", feita: false }, { id: "t7", titulo: "Confirmar alinhamento das persianas", feita: true }] },
    { id: "016-26", codigo: "016-26", nome: "Mayara", sub: "Reserva da Pedra · Anteprojeto", estado: "pausado", pct: 24, prazo: "12 pendências", atrasado: false,
      frentes: [{ nome: "Anteprojeto", pct: 24 }], tarefas: [] }
  ],
  portal: {
    acessos: [
      { cliente: "Deane", projeto: "015-26", quando: "hoje 09:14", total: 3, novo: true },
      { cliente: "Vinicius", projeto: "015-26", quando: "ontem 21:40", total: 1 },
      { cliente: "Elliott", projeto: "032-26", quando: "há 4 dias", total: 0, parado: true }
    ],
    atividade: [
      { titulo: "Layout do térreo aprovado", detalhe: "015-26 · Deane · hoje 09:20", tipo: "v" },
      { titulo: "Comentário na planta baixa", detalhe: "021-26 · Ventisol · ontem", tipo: "a" },
      { titulo: "Planta de forro liberada no portal", detalhe: "015-26 · você · 09/10", tipo: "c" }
    ]
  },
  financeiro: {
    escritorio: {
      a_receber: [
        { id: "r1", descricao: "Parcela 3/6 · Deane e Vinicius", projeto: "015-26", venc: "2026-10-08", valor: 4800, status: "vencida" },
        { id: "r2", descricao: "Medição · Elliott", projeto: "032-26", venc: "2026-10-15", valor: 3200, status: "aberta" },
        { id: "r3", descricao: "RT · Marcenaria Ventisol", projeto: "021-26", venc: "2026-10-20", valor: 1150, status: "aberta", rt: true }
      ],
      a_pagar: [
        { id: "p1", descricao: "INSS", venc: "2026-10-13", valor: 1412, status: "aberta" },
        { id: "p2", descricao: "Licença do software de render", venc: "2026-10-18", valor: 389.9, status: "aberta" }
      ],
      projecao: [
        { mes: "Out/26", entradas: 9150, saidas: 5800 },
        { mes: "Nov/26", entradas: 12400, saidas: 6100 },
        { mes: "Dez/26", entradas: 8300, saidas: 5900 }
      ]
    },
    pessoal: {
      a_receber: [{ id: "pr1", descricao: "Aluguel apto", venc: "2026-10-10", valor: 2100, status: "vencida" }],
      a_pagar: [
        { id: "pp1", descricao: "Cartão Sicredi", venc: "2026-10-15", valor: 8603.2, status: "aberta" },
        { id: "pp2", descricao: "Parcela BYD", venc: "2026-10-20", valor: 3931, status: "aberta" }
      ],
      projecao: [
        { mes: "Out/26", entradas: 11000, saidas: 11200 },
        { mes: "Nov/26", entradas: 11000, saidas: 10300 }
      ]
    }
  }
};
