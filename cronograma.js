/* GERADO por tools/gerar_cronograma_dudoo_web.py a partir do portal do cliente — não edite à mão. */
(function () {
  function escapar(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    var CG_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    var CG_DIA_MS = 86400000;
    window.__cgCronogramas = window.__cgCronogramas || {};

    // Aceita o objeto do contrato (ou o JSON em texto, por garantia);
    // devolve null quando não há o que desenhar.
    function cgDados(valor) {
      if (typeof valor === 'string') {
        if (!valor) return null;
        try { valor = JSON.parse(valor); } catch (erro) { return null; }
      }
      if (!valor || typeof valor !== 'object' || !valor.linhas || !valor.linhas.length) return null;
      if (!valor.inicio || !valor.fim) return null;
      return valor;
    }

    function cgIso(texto) {
      var partes = String(texto || '').slice(0, 10).split('-');
      return Date.UTC(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
    }

    // DD/MM/AAAA, já escapado (vai direto pro innerHTML).
    function cgBr(texto) {
      if (!texto) return '—';
      return escapar(String(texto).slice(0, 10).split('-').reverse().join('/'));
    }

    function cgDois(numero) {
      return (numero < 10 ? '0' : '') + numero;
    }

    function cgDataHoraBr(iso) {
      if (!iso) return '';
      var data = new Date(iso);
      if (isNaN(data.getTime())) return '';
      return cgDois(data.getDate()) + '/' + cgDois(data.getMonth() + 1) + '/' + data.getFullYear() +
        ' ' + cgDois(data.getHours()) + ':' + cgDois(data.getMinutes());
    }

    function cgContexto(dados, px) {
      var agora = new Date();
      var inicio = cgIso(dados.inicio);
      var fim = cgIso(dados.fim);
      return {
        dados: dados,
        px: px,
        inicio: inicio,
        fim: fim,
        hoje: Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()),
        total: Math.max(1, Math.round((fim - inicio) / CG_DIA_MS) + 1),
        execucao: dados.detalhe === 'execucao'
      };
    }

    function cgIndice(c, texto) {
      return Math.round((cgIso(texto) - c.inicio) / CG_DIA_MS);
    }

    function cgFds(tempo) {
      var dia = new Date(tempo).getUTCDay();
      return dia === 0 || dia === 6;
    }

    function cgCor(cor) {
      return /^#[0-9a-fA-F]{6}$/.test(String(cor || '')) ? cor : '#4472C4';
    }

    // Selo de andamento/concluída só no modo execução.
    function cgSituacao(c, l) {
      if (!c.execucao) return '';
      if (l.real_fim) return 'ok';
      if (l.inicio && l.fim && c.hoje >= cgIso(l.inicio) && c.hoje <= cgIso(l.fim)) return 'andamento';
      return '';
    }

    function cgHtmlEtapa(c, l) {
      var h = '<b>' + escapar(String(l.numero || '')) + '. ' + escapar(l.nome) + '</b>';
      if (l.categoria) h += escapar(l.categoria) + '<br>';
      if (l.inicio) {
        var dias = Number(l.dias_uteis) || 0;
        h += cgBr(l.inicio) + ' → ' + cgBr(l.fim) + '<br>' + dias + (dias === 1 ? ' dia útil' : ' dias úteis') +
          '<br>' + (l.data_situacao === 'confirmada' ? 'data confirmada' : 'data prevista');
      }
      if (c.execucao) {
        h += '<br>Progresso ' + (Number(l.progresso) || 0) + '% · previsto hoje ' + (Number(l.previsto) || 0) + '%' +
          (l.atrasada ? ' — atrasada' : '');
        if (l.real_fim) h += '<br>Concluída em ' + cgBr(l.real_fim);
        else if (l.real_inicio) h += '<br>Iniciada em ' + cgBr(l.real_inicio);
      }
      return h;
    }

    function cgResumoHtml(c) {
      var dados = c.dados;
      var inicioObra = null;
      var finalObra = null;
      var etapas = 0;
      dados.linhas.forEach(function (l) {
        if (!l) return;
        if (l.tipo === 'etapa') { etapas++; return; }
        var rotulo = String(l.rotulo || '').toLowerCase();
        if (!inicioObra && (rotulo.indexOf('início') >= 0 || rotulo.indexOf('inicio') >= 0)) inicioObra = l;
        if (!finalObra && (rotulo.indexOf('final') >= 0 || rotulo.indexOf('término') >= 0)) finalObra = l;
      });
      var partes = [];
      if (c.execucao) {
        partes.push('<strong>Obra ' + (Number(dados.progresso_geral) || 0) + '% concluída</strong> (previsto hoje: ' +
          (Number(dados.previsto_geral) || 0) + '%)');
      }
      if (inicioObra) partes.push('Início <strong>' + cgBr(inicioObra.data) + '</strong>');
      if (finalObra) partes.push('Término previsto <strong>' + cgBr(finalObra.data) + '</strong>');
      partes.push(etapas + (etapas === 1 ? ' etapa' : ' etapas'));
      var atualizado = cgDataHoraBr(dados.atualizado_em);
      return '<div>' + partes.join(' · ') + '</div>' +
        (atualizado ? '<div class="cg-atualizado">Atualizado em ' + escapar(atualizado) + '</div>' : '');
    }

    function cgLegendaHtml(c) {
      var itens = [
        ['background:var(--cg-marco-geral);transform:rotate(45deg);width:10px', 'Início / final da obra'],
        ['background:var(--cg-marco);transform:rotate(45deg);width:10px', 'Marco de destaque']
      ];
      if (!c.dados.considerar_fins_de_semana) {
        itens.push(['background:var(--cg-fds);border:1px solid #ddd', 'Fim de semana (sem serviço)']);
      }
      if (c.dados.recessos && c.dados.recessos.length) {
        itens.push(['background:repeating-linear-gradient(45deg,#dcdcd8 0 3px,#ecece9 3px 6px)', 'Recesso']);
      }
      itens.push(['background:var(--cg-hoje);width:3px', 'Hoje']);
      if (c.execucao) {
        itens.push(['background:var(--cg-hoje);width:8px;height:8px;border-radius:50%', 'Etapa em andamento']);
        itens.push(['background:#4472C4', 'Parte executada']);
        itens.push(['background:#4472C4;opacity:.3', 'A executar']);
      } else {
        itens.push(['background:#4472C4', 'Período previsto da etapa (dias úteis)']);
      }
      var html = itens.map(function (item) {
        return '<span><i class="cg-amostra" style="' + item[0] + '"></i>' + item[1] + '</span>';
      }).join('');
      if (c.execucao) {
        html += '<span><b style="color:var(--cg-hoje)">40%</b>Abaixo do previsto pra hoje</span>';
        html += '<span><b style="color:var(--cg-concluida)">✓</b>Etapa concluída</span>';
      }
      html += '<span>Toque ou passe o mouse sobre uma barra para ver as datas.</span>';
      html += '<span class="cg-so-mouse"><b>Shift</b>+ roda do mouse rola o cronograma para os lados.</span>';
      return html;
    }

    // Monta a grade inteira como texto (um innerHTML só); as dicas ficam
    // num vetor e cada elemento aponta pra sua com data-cg-dica.
    function cgGradeHtml(c) {
      var px = c.px;
      var total = c.total;
      var largura = total * px;
      var dicas = [];
      var hojeNaFaixa = c.hoje >= c.inicio && c.hoje <= c.fim;
      var hojeEsquerda = (Math.round((c.hoje - c.inicio) / CG_DIA_MS) + 0.5) * px;
      var partes = [];

      // Cabeçalho (meses + dias), fixo no topo.
      var topo = '';
      var i = 0;
      while (i < total) {
        var data = new Date(c.inicio + i * CG_DIA_MS);
        var proximo = Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 1);
        var n = Math.max(1, Math.min(total - i, Math.round((proximo - data.getTime()) / CG_DIA_MS)));
        var nomeMes = CG_MESES[data.getUTCMonth()];
        var textoMes = n * px > 110 ? nomeMes.toUpperCase() + ' ' + data.getUTCFullYear()
          : (n * px > 34 ? nomeMes.slice(0, 3).toUpperCase() : '');
        topo += '<div class="cg-mes" style="left:' + (i * px) + 'px;width:' + (n * px) + 'px">' + textoMes + '</div>';
        i += n;
      }
      var semana = px < 20;
      if (px >= 8) {
        for (var k = 0; k < total; k++) {
          var tempo = c.inicio + k * CG_DIA_MS;
          var dia = new Date(tempo);
          if (semana && dia.getUTCDay() !== 1) continue;
          topo += '<div class="cg-dia' + (!semana && cgFds(tempo) ? ' cg-fds' : '') + '" style="left:' + (k * px) +
            'px;width:' + ((semana ? 7 : 1) * px) + 'px">' + dia.getUTCDate() + '</div>';
        }
      }
      if (hojeNaFaixa) {
        topo += '<div class="cg-hoje-rotulo" style="left:' + hojeEsquerda + 'px">hoje</div>';
      }
      partes.push('<div class="cg-linha cg-topo"><div class="cg-nome">Etapas</div>' +
        '<div class="cg-trilho" style="width:' + largura + 'px">' + topo + '</div></div>');

      // Fundo: fins de semana, recessos e hoje — atrás de todas as linhas.
      var fundo = '';
      if (!c.dados.considerar_fins_de_semana) {
        for (var f = 0; f < total; f++) {
          if (cgFds(c.inicio + f * CG_DIA_MS)) {
            fundo += '<div class="cg-fundo cg-fds" style="left:' + (f * px) + 'px;width:' + px + 'px"></div>';
          }
        }
      }
      (c.dados.recessos || []).forEach(function (r) {
        if (!r || !r.inicio || !r.fim) return;
        var a = Math.max(0, cgIndice(c, r.inicio));
        var b = Math.min(total - 1, cgIndice(c, r.fim));
        if (b < a) return;
        fundo += '<div class="cg-fundo cg-recesso" style="left:' + (a * px) + 'px;width:' +
          ((b - a + 1) * px) + 'px"></div>';
      });
      if (hojeNaFaixa) {
        fundo += '<div class="cg-fundo cg-hoje" style="left:' + hojeEsquerda + 'px"></div>';
      }
      partes.push('<div class="cg-fundos" style="width:' + largura + 'px">' + fundo + '</div>');

      // Linhas.
      c.dados.linhas.forEach(function (l) {
        if (!l) return;
        var nomeHtml;
        var trilho = '';
        if (l.tipo === 'etapa') {
          var situacao = cgSituacao(c, l);
          var indiceDica = dicas.push(cgHtmlEtapa(c, l)) - 1;
          var conteudoNome = '<span class="cg-num">' + escapar(String(l.numero || '')) + '.</span>' +
            '<span class="cg-txt">' + escapar(l.nome) + '</span>';
          if (situacao === 'ok') conteudoNome += '<span class="cg-selo cg-ok">✓</span>';
          if (situacao === 'andamento') conteudoNome += '<span class="cg-selo cg-andamento"></span>';
          var progresso = Number(l.progresso) || 0;
          if (c.execucao && situacao !== 'ok' && (progresso > 0 || l.atrasada)) {
            conteudoNome += '<span class="cg-pct' + (l.atrasada ? ' cg-atrasada' : '') + '">' + progresso + '%</span>';
          }
          var atributoEtapa = l.id ? ' data-cg-etapa="' + escapar(String(l.id)) + '" data-cg-nome="' + escapar(String(l.numero || '') + '. ' + l.nome) + '"' : '';
          var qtdComentarios = l.id && c.comentarios && c.comentarios[l.id] ? c.comentarios[l.id].length : 0;
          if (qtdComentarios) conteudoNome += '<span class="cg-com">💬 ' + qtdComentarios + '</span>';
          nomeHtml = '<div class="cg-nome" data-cg-dica="' + indiceDica + '"' + atributoEtapa + '>' + conteudoNome + '</div>';

          // Execução: parte feita (pela %) cheia, o que falta clara.
          // Planejado: barra inteira na cor da etapa.
          var corte = c.execucao ? (l.corte_progresso ? cgIndice(c, l.corte_progresso) : -1) : total;
          var cor = cgCor(l.cor);
          var pedaco = function (a, b, classe) {
            a = Math.max(0, a);
            b = Math.min(total - 1, b);
            if (b < a) return;
            trilho += '<div class="cg-barra' + classe + '" data-cg-dica="' + indiceDica + '"' + atributoEtapa + ' style="left:' + (a * px) +
              'px;width:' + ((b - a + 1) * px) + 'px;background:' + cor + '"></div>';
          };
          (l.segmentos || []).forEach(function (segmento) {
            if (!segmento || segmento.length < 2) return;
            var ia = cgIndice(c, segmento[0]);
            var ib = cgIndice(c, segmento[1]);
            pedaco(ia, Math.min(ib, corte), '');
            pedaco(Math.max(ia, corte + 1), ib, ' cg-restante');
          });
          (l.marcos || []).forEach(function (m) {
            if (!m || !m.data) return;
            var indiceMarco = dicas.push('<b>' + escapar(m.rotulo || 'Marco') + '</b>' + cgBr(m.data)) - 1;
            trilho += '<div class="cg-losango" data-cg-dica="' + indiceMarco + '" style="left:' +
              ((cgIndice(c, m.data) + 0.5) * px) + 'px;background:var(--cg-marco)"></div>';
          });
        } else {
          nomeHtml = '<div class="cg-nome cg-geral"><span class="cg-txt">' + escapar(l.rotulo) + '</span></div>';
          if (l.data) {
            var indiceGeral = dicas.push('<b>' + escapar(l.rotulo) + '</b>' + cgBr(l.data)) - 1;
            trilho += '<div class="cg-losango" data-cg-dica="' + indiceGeral + '" style="left:' +
              ((cgIndice(c, l.data) + 0.5) * px) + 'px;background:var(--cg-marco-geral)"></div>';
          }
        }
        partes.push('<div class="cg-linha">' + nomeHtml + '<div class="cg-trilho" style="width:' + largura + 'px">' +
          trilho + '</div></div>');
      });

      return { html: partes.join(''), dicas: dicas, largura: largura };
    }

    function cgPx(caixa) {
      return Number(caixa.getAttribute('data-cg-px')) || 28;
    }

    function cgDesenhar(caixa) {
      var dados = window.__cgCronogramas[caixa.getAttribute('data-cg-id') || ''];
      var grade = caixa.querySelector('.cg-grade');
      if (!dados || !grade) return;
      var c = cgContexto(dados, cgPx(caixa));
      c.comentarios = (window.__cgComentarios || {})[caixa.getAttribute('data-cg-id') || ''] || {}; c.projetoSyncId = caixa.getAttribute('data-cg-id') || '';
      var resultado = cgGradeHtml(c);
      caixa.__cgDicas = resultado.dicas;
      grade.style.width = 'calc(var(--cg-col-nome) + ' + resultado.largura + 'px)';
      grade.innerHTML = resultado.html;
      var botoes = caixa.querySelectorAll('button[data-cg-px]');
      for (var i = 0; i < botoes.length; i++) {
        botoes[i].classList.toggle('cg-ativo', Number(botoes[i].getAttribute('data-cg-px')) === c.px);
      }
    }

    // Rola só a faixa do cronograma (nunca a página) até hoje, deixando
    // hoje a 1/3 da largura visível.
    function cgIrParaHoje(caixa, suave) {
      var dados = window.__cgCronogramas[caixa.getAttribute('data-cg-id') || ''];
      var rolagem = caixa.querySelector('.cg-rolagem');
      if (!dados || !rolagem) return;
      var c = cgContexto(dados, cgPx(caixa));
      var colunaNome = caixa.querySelector('.cg-topo .cg-nome');
      var larguraNome = colunaNome ? colunaNome.offsetWidth : 0;
      var alvo = c.hoje < c.inicio ? 0 : Math.min(Math.round((c.hoje - c.inicio) / CG_DIA_MS), c.total - 1);
      var esquerda = Math.max(0, alvo * c.px - (rolagem.clientWidth - larguraNome) / 3);
      if (suave && typeof rolagem.scrollTo === 'function') {
        try {
          rolagem.scrollTo({ left: esquerda, behavior: 'smooth' });
          return;
        } catch (erro) {
          // navegador antigo: cai no scrollLeft direto
        }
      }
      rolagem.scrollLeft = esquerda;
    }

    // Dica posicionada DENTRO do container (absolute), não fixed — o
    // corpo do portal rola internamente e o quadro do Wix não cobre a tela.
    function cgMostrarDica(caixa, alvo, evento) {
      var dica = caixa.querySelector('.cg-dica');
      var html = (caixa.__cgDicas || [])[Number(alvo.getAttribute('data-cg-dica'))];
      if (!dica || !html) return;
      if (dica.__cgHtml !== html) {
        dica.innerHTML = html;
        dica.__cgHtml = html;
      }
      dica.style.display = 'block';
      var ret = caixa.getBoundingClientRect();
      var largura = dica.offsetWidth;
      var altura = dica.offsetHeight;
      var x = Math.max(4, Math.min(evento.clientX - ret.left + 14, caixa.clientWidth - largura - 4));
      var y = evento.clientY - ret.top + 16;
      if (evento.clientY + 16 + altura > window.innerHeight) y = evento.clientY - ret.top - altura - 10;
      dica.style.left = x + 'px';
      dica.style.top = y + 'px';
    }

    function cgEsconderDica(caixa) {
      var dica = caixa.querySelector('.cg-dica');
      if (dica) dica.style.display = 'none';
    }

    document.addEventListener('click', function (evento) {
      if (evento.target && evento.target.closest && evento.target.closest('[data-cg-dica]')) return;
      var dicas = document.querySelectorAll('.cg-dica');
      for (var i = 0; i < dicas.length; i++) dicas[i].style.display = 'none';
    });

    function cgLigarEventos(caixa) {
      caixa.addEventListener('click', function (evento) {
        var botaoModo = evento.target.closest('button[data-cg-modo]');
        if (botaoModo) {
          cgEsconderDica(caixa);
          cgTrocarModo(caixa, botaoModo.getAttribute('data-cg-modo'));
          return;
        }
        var alvoEtapa = evento.target.closest('[data-cg-etapa]');
        if (alvoEtapa && window.__cgAoEtapa) {
          cgEsconderDica(caixa);
          window.__cgAoEtapa(caixa.getAttribute('data-cg-id') || '', alvoEtapa.getAttribute('data-cg-etapa'), alvoEtapa.getAttribute('data-cg-nome') || '');
          return;
        }
        var botaoEscala = evento.target.closest('button[data-cg-px]');
        if (botaoEscala) {
          caixa.setAttribute('data-cg-px', botaoEscala.getAttribute('data-cg-px'));
          cgEsconderDica(caixa);
          cgDesenhar(caixa);
          cgIrParaHoje(caixa, false);
          return;
        }
        if (evento.target.closest('.cg-ir-hoje')) {
          cgIrParaHoje(caixa, true);
          return;
        }
        var alvo = evento.target.closest('[data-cg-dica]');
        if (alvo) cgMostrarDica(caixa, alvo, evento);
      });
      var grade = caixa.querySelector('.cg-grade');
      grade.addEventListener('mousemove', function (evento) {
        var alvo = evento.target.closest('[data-cg-dica]');
        if (alvo) cgMostrarDica(caixa, alvo, evento);
        else cgEsconderDica(caixa);
      });
      grade.addEventListener('mouseleave', function () { cgEsconderDica(caixa); });
      caixa.querySelector('.cg-rolagem').addEventListener('scroll', function () { cgEsconderDica(caixa); });
    }

    // Celular (tela estreita): o cronograma abre em lista (30/09/2026).
    function cgModoCelular() {
      try { return !!(window.matchMedia && window.matchMedia('(max-width: 700px)').matches); } catch (erro) { return false; }
    }

    function cgItemListaHtml(c, l) {
      var dias = Number(l.dias_uteis) || 0;
      var datas = cgBr(l.inicio) + ' → ' + cgBr(l.fim) +
        (dias ? ' · ' + dias + (dias === 1 ? ' dia útil' : ' dias úteis') : '') +
        ' · ' + (l.data_situacao === 'confirmada' ? 'confirmada' : 'prevista');
      var tag = '';
      if (c.execucao) {
        if (cgSituacao(c, l) === 'ok') tag = '<span class="cg-li-tag cg-li-ok">concluída</span>';
        else tag = '<span class="cg-li-tag' + (l.atrasada ? ' cg-li-atrasada' : '') + '">' +
          (Number(l.progresso) || 0) + '%' + (l.atrasada ? ' · atrasada' : '') + '</span>';
      }
      var marcos = (l.marcos || []).filter(function (m) { return m && m.data; }).map(function (m) {
        return '<div class="cg-li-sub">◆ ' + escapar(m.rotulo || 'Marco') + ' — ' + cgBr(m.data) + '</div>';
      }).join('');
      var qtdLista = l.id && c.comentarios && c.comentarios[l.id] ? c.comentarios[l.id].length : 0;
      return '<div class="cg-li" style="border-left-color:' + cgCor(l.cor) + '"' +
        (l.id ? ' data-cg-etapa="' + escapar(String(l.id)) + '" data-cg-nome="' + escapar(String(l.numero || '') + '. ' + l.nome) + '"' : '') +
        '><div class="cg-li-corpo">' +
        '<div class="cg-li-nome">' + escapar(String(l.numero || '')) + '. ' + escapar(l.nome) + tag +
        (qtdLista ? '<span class="cg-com">💬 ' + qtdLista + '</span>' : '') +
        '' + '</div>' +
        '<div class="cg-li-datas">' + datas + '</div>' + marcos + '</div></div>';
    }

    function cgListaHtml(c) {
      var grupos = { agora: [], proximas: [], passadas: [] };
      c.dados.linhas.forEach(function (l) {
        if (!l) return;
        if (l.tipo === 'etapa') {
          if (!l.inicio || !l.fim) return;
          var ini = cgIso(l.inicio);
          var fim = cgIso(l.fim);
          var grupo = (c.execucao && l.real_fim) || fim < c.hoje ? 'passadas' : (ini > c.hoje ? 'proximas' : 'agora');
          grupos[grupo].push({ quando: ini, html: cgItemListaHtml(c, l) });
        } else if (l.data) {
          var dia = cgIso(l.data);
          grupos[dia < c.hoje ? 'passadas' : (dia > c.hoje ? 'proximas' : 'agora')].push({ quando: dia, html:
            '<div class="cg-li cg-li-marco"><span class="cg-li-losango"></span><div class="cg-li-corpo">' +
            '<div class="cg-li-nome">' + escapar(l.rotulo) + '</div><div class="cg-li-datas">' + cgBr(l.data) +
            '</div></div></div>' });
        }
      });
      function juntar(itens) {
        return itens.sort(function (a, b) { return a.quando - b.quando; }).map(function (i) { return i.html; }).join('');
      }
      var html = '<div class="cg-li-secao">Acontecendo agora</div>' +
        (grupos.agora.length ? juntar(grupos.agora) : '<div class="cg-li-vazio">Nenhuma etapa em andamento hoje.</div>');
      if (grupos.proximas.length) html += '<div class="cg-li-secao">A seguir</div>' + juntar(grupos.proximas);
      if (grupos.passadas.length) {
        html += '<details class="cg-li-passadas"><summary>Já passaram (' + grupos.passadas.length + ')</summary>' +
          juntar(grupos.passadas) + '</details>';
      }
      return html;
    }

    function cgTrocarModo(caixa, modo) {
      caixa.classList.toggle('cg-modo-lista', modo === 'lista');
      var botoes = caixa.querySelectorAll('button[data-cg-modo]');
      for (var i = 0; i < botoes.length; i++) {
        botoes[i].classList.toggle('cg-ativo', botoes[i].getAttribute('data-cg-modo') === modo);
      }
      if (modo === 'grafico') {
        cgDesenhar(caixa);
        cgIrParaHoje(caixa, false);
      }
    }

    // 1ª abertura do bloco: monta cabeçalho/legenda, desenha e vai pra hoje.
    function cgAbrir(caixa) {
      if (!caixa || caixa.getAttribute('data-cg-pronto') === '1') return;
      var dados = window.__cgCronogramas[caixa.getAttribute('data-cg-id') || ''];
      if (!dados) return;
      var c = cgContexto(dados, 28);
      c.comentarios = (window.__cgComentarios || {})[caixa.getAttribute('data-cg-id') || ''] || {}; c.projetoSyncId = caixa.getAttribute('data-cg-id') || '';
      // Obra longa (ou celular) abre direto na escala de semanas.
      var celular = cgModoCelular();
      caixa.setAttribute('data-cg-px', c.total > 120 || celular ? '10' : '28');
      caixa.innerHTML =
        '<div class="cg-cabecalho">' +
          '<div class="cg-resumo">' + cgResumoHtml(c) + '</div>' +
          '<div class="cg-ferramentas">' +
            (celular ? '<div class="cg-grupo"><button type="button" data-cg-modo="lista">Lista</button>' +
              '<button type="button" data-cg-modo="grafico">Gráfico</button></div>' : '') +
            '<div class="cg-grupo cg-escalas"><button type="button" data-cg-px="28">Dias</button>' +
            '<button type="button" data-cg-px="10">Semanas</button>' +
            '<button type="button" data-cg-px="4">Meses</button></div>' +
            '<button type="button" class="cg-botao cg-ir-hoje">Ir para hoje</button>' +
          '</div>' +
        '</div>' +
        (celular ? '<div class="cg-lista">' + cgListaHtml(c) + '</div>' : '') +
        '<div class="cg-rolagem"><div class="cg-grade"></div></div>' +
        '<div class="cg-legenda">' + cgLegendaHtml(c) + '</div>' +
        '<div class="cg-dica"></div>';
      caixa.setAttribute('data-cg-pronto', '1');
      cgLigarEventos(caixa);
      cgDesenhar(caixa);
      cgIrParaHoje(caixa, false);
      if (celular) cgTrocarModo(caixa, 'lista');
    }


  // Entrada do Dudoo Web: desenha (ou redesenha) o cronograma `dados` dentro de `caixa`.
  window.CronogramaObra = {
    montar: function (caixa, id, dados) {
      var valido = cgDados(dados);
      if (!valido) { caixa.innerHTML = ''; return false; }
      window.__cgCronogramas[id] = valido;
      caixa.className = 'cg-cronograma';
      caixa.setAttribute('data-cg-id', id);
      caixa.removeAttribute('data-cg-pronto');
      caixa.innerHTML = '';
      cgAbrir(caixa);
      return true;
    }
  };
})();
