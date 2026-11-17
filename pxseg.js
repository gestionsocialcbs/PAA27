// Módulo 3 · Seguimiento por actividad de teatro (33501, 33502 y 33504): programado contra real, meta mínima del Layout 2027.
// REAL = false: por ahora no se muestra la comparación contra el avance real (Reporte_Teatros 2026).
window.PXSEG_REAL = false;
window.PXSEG = (() => {
  const ACTS = ['33501', '33502', '33504'];
  const areaN = (a) => (a === 'CECART' ? 'Capacitación y Adiestramiento Técnico' : a === 'CASSAAM' ? 'Promoción de la Salud' : a);
  const uoKey = (u) => Math.floor(Number(u.cve_uo) / 1000) + '-' + (Number(u.cve_uo) % 1000);
  // El Reporte de Teatros usa todavía las claves del catálogo 2026 (325xx); cada una equivale a la 335xx de 2027.
  const eq = (cl) => { const s = String(cl); return /^325\d\d$/.test(s) ? '335' + s.slice(3) : s; };
  const pctDe = (t) => { const m = String(t || '').match(/(\d+(?:\.\d+)?)\s*%/); return m ? Number(m[1]) / 100 : null; };
  const calc = (prog, real, uos, layout) => {
    const uo = new Map(uos.map((u) => [uoKey(u), u]));
    const lay = new Map(layout.filter((l) => ACTS.includes(String(l.clave))).map((l) => [String(l.clave), l]));
    const acc = new Map();
    const add = (lado, r) => {
      const act = eq(r.clave_actividad);
      if (!ACTS.includes(act)) return;
      const u = uo.get(r.unidad);
      if (!u) return;
      const mes = Number(r.mes) || 0;
      for (const area of ['Todas', areaN(r.area)]) {
        for (const [nivel, clave, nombre, padre] of [['Nacional', 'Nacional', 'Nacional', ''], ['OOAD', String(u.cve_ooad), u.ooad, 'Nacional'], ['Unidad Operativa', r.unidad, u.unidad_operativa || u.tipo_uo, String(u.cve_ooad)]]) {
          for (const m of mes ? [0, mes] : [0]) {
            const k = [act, nivel, clave, area, m].join('|');
            const o = acc.get(k) || { clave_actividad: act, nivel, clave, nombre, padre, area, mes: m, eventos_prog: 0, prog: 0, aforo_prog: 0, eventos_real: 0, real: 0 };
            if (lado === 'prog') { o.eventos_prog += Number(r.eventos) || 0; o.prog += Number(r.asistencias) || 0; o.aforo_prog += Number(r.aforo) || 0; }
            else { o.eventos_real += Number(r.eventos) || 0; o.real += Number(r.asistencias) || 0; }
            acc.set(k, o);
          }
        }
      }
    };
    for (const r of prog) add('prog', r);
    for (const r of real) add('real', r);
    return [...acc.values()].map((o) => {
      const l = lay.get(o.clave_actividad) || {};
      const p = pctDe(l.meta_minima_texto);
      const metaMin = p !== null && o.aforo_prog ? Math.ceil(o.aforo_prog * p) : null;
      const c = o.prog ? o.real / o.prog : null;
      return { ...o, actividad: l.nombre || o.clave_actividad, meta_minima: l.meta_minima_texto || null, meta_pct: p, meta_asistencias: metaMin, cumplimiento: c, semaforo: PXR.sem(c), avance_meta: metaMin ? o.real / metaMin : null };
    });
  };
  const fila = (act, nivel, clave, mes) => {
    const d = dash.data('te_seg');
    if (d.status !== 'ok') return null;
    const a = PX.area();
    return d.data.find((r) => r.clave_actividad === act && r.nivel === nivel && r.clave === clave && r.area === a && r.mes === (mes || 0)) || null;
  };
  const meta = (act) => {
    const d = dash.data('layout_2027');
    if (d.status !== 'ok') return null;
    return d.data.find((l) => String(l.clave) === act) || null;
  };
  return { ACTS, eq, pctDe, calc, fila, meta };
})();

dash.calc('te_seg', {
  title: 'Teatros: seguimiento de las actividades 33501, 33502 y 33504',
  description: 'Por actividad (33501 Actividades Institucionales en Teatro, 33502 Función Comercial en Teatro y 33504 Escenarios IMSS Cultura), a nivel nacional, por OOAD y por teatro, por área y por mes (0 = todo el año): eventos, asistencias y aforo programados (Reporte PAA Teatros), eventos y asistencias reales (Reporte de Teatros, NUM_TOTAL_ASISTENCIAS; sus claves 2026 325xx se cuentan en la 335xx equivalente), cumplimiento = real ÷ programado con su semáforo, y meta mínima de asistencias = porcentaje del aforo del Layout 2027 × aforo programado.',
  inputs: ['te_registro', 'rte_registro', 'unidades_operativas', 'layout_2027'],
  fn: (te_registro, rte_registro, unidades_operativas, layout_2027) => PXSEG.calc(te_registro, rte_registro, unidades_operativas, layout_2027),
});

// Nombre de la actividad y su meta mínima, desde el Layout 2027.
dash.draw('tseg-meta', (el) => {
  const l = PXSEG.meta(el.dataset.act);
  el.textContent = l ? 'Meta mínima del Layout 2027: ' + l.meta_minima_texto + '.' : '—';
});

dash.draw('tseg-k', (el) => {
  const act = el.dataset.act, k = el.dataset.k;
  const st = dash.data('te_seg').status;
  el.classList.toggle('dash-skeleton', st === 'loading');
  el.textContent = '';
  if (st !== 'ok') { el.textContent = '—'; return; }
  const s = PXV.scope();
  const r = PXSEG.fila(act, s.nivel, s.clave) || { eventos_prog: 0, prog: 0, aforo_prog: 0, eventos_real: 0, real: 0, cumplimiento: null, semaforo: null, meta_asistencias: null, avance_meta: null };
  const de = (t) => { const n = document.createElement('span'); n.className = 'px-kpi-de'; n.textContent = t; el.appendChild(n); };
  const dot = (sm) => { if (!sm) return; const d = document.createElement('span'); d.className = 'px-dot'; d.style.background = PXS.color(sm); d.title = sm; el.appendChild(d); };
  const txt = (t) => { const n = document.createElement('span'); n.textContent = t; el.appendChild(n); };
  if (k === 'prog') { txt(PX.fmt(Math.round(r.prog))); de(' · ' + PX.fmt(r.eventos_prog) + (r.eventos_prog === 1 ? ' evento' : ' eventos')); return; }
  if (k === 'real') { txt(PX.fmt(Math.round(r.real))); de(' · ' + PX.fmt(r.eventos_real) + (r.eventos_real === 1 ? ' evento' : ' eventos')); return; }
  if (k === 'cumplimiento') { dot(r.semaforo); txt(PXR.cumpTxt(r)); return; }
  if (k === 'meta') {
    if (!r.meta_asistencias) { txt('—'); de(' · sin aforo programado'); return; }
    txt(PX.fmt(r.meta_asistencias));
    de(window.PXSEG_REAL ? ' · reales ' + PXR.cumpTxt({ cumplimiento: r.avance_meta }) + ' de la meta' : ' · ' + Math.round((r.meta_pct || 0) * 100) + '% del aforo programado');
    return;
  }
});

// Por mes: asistencias programadas y reales de la actividad.
dash.draw('ch-tseg-mes', (el) => {
  if (!PX.ready(el, ['te_seg'])) return;
  const act = el.dataset.act;
  const s = PXV.scope();
  const a = PX.area();
  const by = new Map(dash.data('te_seg').data.filter((r) => r.clave_actividad === act && r.nivel === s.nivel && r.clave === s.clave && r.area === a && r.mes > 0).map((r) => [r.mes, r]));
  if (!by.size || (!window.PXSEG_REAL && ![...by.values()].some((r) => r.prog > 0))) { PXR.empty(el, window.PXSEG_REAL ? 'Sin asistencias programadas ni reales de esta actividad en el ámbito y el área seleccionados.' : 'Sin asistencias programadas de esta actividad en el ámbito y el área seleccionados.'); return; }
  const rows = d3.range(1, 13).map((mm) => by.get(mm) || { mes: mm, prog: 0, real: 0, cumplimiento: null, semaforo: null });
  const anim = !el.dataset.pxDrawn;
  el.dataset.pxDrawn = '1';
  const W = Math.max(260, el.clientWidth), H = 190, mg = { t: 14, b: 22 };
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Asistencias programadas y reales por mes, actividad ' + act);
  const R = window.PXSEG_REAL;
  const lados = R ? ['prog', 'real'] : ['prog'];
  const mx = d3.max(rows, (r) => Math.max(r.prog, R ? r.real : 0)) || 1;
  const y = d3.scaleLinear([0, mx], [H - mg.b, mg.t]).nice();
  const probe = svg.append('text').attr('class', 'px-tick').text(PXR.fmtc(d3.max(y.ticks(3))));
  const left = probe.node().getComputedTextLength() + 8;
  probe.remove();
  const x = d3.scaleBand(d3.range(12), [left, W]).padding(0.22);
  const xi = d3.scaleBand(lados, [0, x.bandwidth()]).padding(R ? 0.08 : 0.15);
  svg.append('g').selectAll('line').data(y.ticks(3)).join('line').attr('x1', left).attr('x2', W).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
  svg.append('g').selectAll('text').data(y.ticks(3)).join('text').attr('class', 'px-tick').attr('x', left - 6).attr('y', (t) => y(t) + 4).attr('text-anchor', 'end').text(PXR.fmtc);
  const g = svg.selectAll('g.px-m').data(rows).join('g').attr('class', 'px-m');
  g.append('rect').attr('x', (r) => x(r.mes - 1) - 2).attr('width', x.bandwidth() + 4).attr('y', 0).attr('height', H).attr('fill', 'transparent');
  for (const lado of lados) {
    g.append('rect').attr('x', (r) => x(r.mes - 1) + xi(lado)).attr('width', xi.bandwidth()).attr('y', (r) => y(r[lado])).attr('height', (r) => y(0) - y(r[lado])).attr('rx', 2).attr('fill', PXR.C[lado])
      .attr('class', anim ? 'px-grow' : null).style('animation-delay', (r) => (anim ? r.mes * 30 + 'ms' : null));
  }
  g.append('text').attr('class', 'px-tick').attr('x', (r) => x(r.mes - 1) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').text((r) => PXU2.MES[r.mes - 1]);
  const mesN = (r) => PXP.MESES[r.mes - 1].replace(/^./, (c) => c.toUpperCase());
  PX.hover(el, g, (r) => (R ? PXR.tip(mesN(r), r, 'Asistencias') : [mesN(r), ['Asistencias programadas', PX.fmt(Math.round(r.prog))], ['Eventos programados', PX.fmt(r.eventos_prog || 0)]]));
});

// Por OOAD (nivel nacional) o por teatro (dentro de una OOAD): las 8 con más asistencias.
dash.draw('ch-tseg-nivel', (el) => {
  if (!PX.ready(el, ['te_seg'])) return;
  const act = el.dataset.act;
  const s = PXV.scope();
  const a = PX.area();
  const d = dash.data('te_seg').data.filter((r) => r.clave_actividad === act && r.area === a && r.mes === 0);
  const rows = s.nivel === 'Unidad Operativa'
    ? d.filter((r) => r.nivel === 'Unidad Operativa' && r.clave === s.clave)
    : d.filter((r) => r.nivel === (s.nivel === 'Nacional' ? 'OOAD' : 'Unidad Operativa') && r.padre === s.clave).filter((r) => window.PXSEG_REAL || r.prog > 0).sort((x, y) => Math.max(y.prog, window.PXSEG_REAL ? y.real : 0) - Math.max(x.prog, window.PXSEG_REAL ? x.real : 0)).slice(0, 8);
  if (!rows.length || (!window.PXSEG_REAL && !d3.sum(rows, (r) => r.prog))) { PXR.empty(el, window.PXSEG_REAL ? 'Sin asistencias programadas ni reales de esta actividad en el ámbito y el área seleccionados.' : 'Sin asistencias programadas de esta actividad en el ámbito y el área seleccionados.'); return; }
  if (!window.PXSEG_REAL) {
    PX.hbar(el, rows, { aria: 'Asistencias programadas por ' + (s.nivel === 'Nacional' ? 'OOAD' : 'teatro') + ', actividad ' + act, label: (r) => r.nombre, value: (r) => r.prog, color: () => '#A57F2C',
      tip: (r) => [r.nombre, ['Asistencias programadas', PX.fmt(Math.round(r.prog))], ['Eventos programados', PX.fmt(r.eventos_prog)]] });
    return;
  }
  PXR.pair(el, rows, { aria: 'Asistencias programadas y reales por ' + (s.nivel === 'Nacional' ? 'OOAD' : 'teatro') + ', actividad ' + act, label: (r) => r.nombre, med: 'Asistencias' });
});

dash.draw('tseg-nivel-t', (el) => {
  const s = PXV.scope();
  el.textContent = s.nivel === 'Nacional' ? 'Las 8 OOAD con más asistencias programadas' : s.nivel === 'OOAD' ? 'Los 8 teatros de la OOAD con más asistencias programadas' : 'Teatro elegido';
});
