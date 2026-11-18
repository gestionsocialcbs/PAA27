// Módulo 1 · Pronóstico de cumplimiento: cierre del registro (30 de noviembre de 2026) y cumplimiento real 2027 estimado.
window.PXPRED = (() => {
  const fila = () => {
    const d = dash.data('pred_registro');
    if (d.status !== 'ok') return null;
    const s = PXV.scope(), a = PX.area();
    return d.data.find((r) => r.nivel === s.nivel && r.clave === String(s.clave) && r.area === a) || null;
  };
  const fecha = (iso) => { const d = new Date(iso + 'T12:00:00'); return d.getDate() + ' de ' + PXP.MESES[d.getMonth()]; };
  return { fila, fecha };
})();

dash.draw('pred-k', (el) => {
  const st = dash.data('pred_registro').status;
  el.classList.toggle('dash-skeleton', st === 'loading');
  el.textContent = '';
  const r = PXPRED.fila();
  if (!r) { el.textContent = '—'; return; }
  const de = (t) => { const n = document.createElement('span'); n.className = 'px-kpi-de'; n.textContent = t; el.appendChild(n); };
  const dot = (sm) => { if (!sm) return; const d = document.createElement('span'); d.className = 'px-dot'; d.style.background = PXS.color(sm); d.title = sm; el.appendChild(d); };
  const txt = (t) => el.appendChild(document.createTextNode(t));
  const k = el.dataset.k;
  if (k === 'proy') { dot(r.semaforo_proyectado); txt(PX.fmt(r.proyeccion_cierre)); de(' · ' + PXZ.pct(r.avance_proyectado) + ' de la meta'); }
  else if (k === 'ritmo') { txt(PX.fmt(Math.round(r.ritmo_diario))); de(' al día · se necesitan ' + PX.fmt(Math.round(r.ritmo_necesario))); }
  else if (k === 'real-i') { dot(r.semaforo_real); txt(PX.fmt(r.real_2027_inscripciones)); de(' · ' + PXZ.pct(r.cumplimiento_real_estimado) + ' de la meta'); }
  else if (k === 'real-a') { txt(PX.fmt(r.asistencias_proyectadas)); de(' programadas · ' + PX.fmt(r.real_2027_asistencias) + ' reales estimadas'); }
});

dash.draw('pred-lead', (el) => {
  const r = PXPRED.fila();
  const c = dash.data('pred_corte');
  if (!r || c.status !== 'ok' || !c.data.length) { el.textContent = '—'; return; }
  const u = c.data[c.data.length - 1];
  el.textContent = 'Con ' + u.cortes + (u.cortes === 1 ? ' corte' : ' cortes') + ' del registro (último: ' + PXPRED.fecha(u.fecha_corte) + ') y ' + r.dias_habiles_restantes + ' días hábiles hasta el cierre del ' + PXPRED.fecha(u.cierre) + '.';
});

// Trayectoria: registro por corte, proyección al ritmo actual y ritmo necesario para la meta.
dash.draw('ch-pred-tray', (el) => {
  if (!PX.ready(el, ['pred_registro', 'avance_hist', 'pred_corte', 'unidades_operativas'])) return;
  const r = PXPRED.fila();
  if (!r) { PXZ.empty(el); return; }
  const s = PXV.scope(), a = PX.area();
  const uo = new Map(dash.data('unidades_operativas').status === 'ok' ? dash.data('unidades_operativas').data.map((u) => [Math.floor(Number(u.cve_uo) / 1000) + '-' + (Number(u.cve_uo) % 1000), u]) : []);
  const en = (h) => (s.nivel === 'Nacional' || (s.nivel === 'OOAD' ? String((uo.get(h.unidad) || {}).cve_ooad) === String(s.clave) : h.unidad === s.clave)) && (a === 'Todas' || h.area === a);
  const pts = d3.rollups(dash.data('avance_hist').data.filter(en), (v) => d3.sum(v, (h) => h.inscripciones), (h) => h.fecha_corte).map(([f, v]) => ({ f, v })).sort((x, y) => x.f.localeCompare(y.f));
  const cierre = dash.data('pred_corte').data.slice(-1)[0].cierre;
  const last = pts.length ? pts[pts.length - 1] : { f: dash.data('pred_corte').data.slice(-1)[0].fecha_corte, v: 0 };
  const W = Math.max(280, el.clientWidth), H = 260, mg = { t: 16, r: 92, b: 28 };
  el.style.minHeight = H + 'px';
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Trayectoria del registro y proyección al cierre');
  const pf = (iso) => new Date(iso + 'T12:00:00');
  const top = Math.max(r.meta_2027, r.proyeccion_cierre, last.v) * 1.08 || 1;
  const y = d3.scaleLinear([0, top], [H - mg.b, mg.t]).nice();
  const probe = svg.append('text').attr('class', 'px-tick').text(PXZ.compact(d3.max(y.ticks(4))));
  const left = probe.node().getComputedTextLength() + 10; probe.remove();
  const x0 = pts.length ? pf(pts[0].f) : pf(last.f);
  const x = d3.scaleTime([d3.timeDay.offset(x0, -1), pf(cierre)], [left, W - mg.r]);
  svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', left).attr('x2', W - mg.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
  svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('class', 'px-tick').attr('x', left - 6).attr('y', (t) => y(t) + 4).attr('text-anchor', 'end').text(PXZ.compact);
  const xt = d3.timeDay.range(d3.timeDay.offset(x0, -1), d3.timeDay.offset(pf(cierre), 1)).filter((d, i, arr) => arr.length <= 9 || i % Math.ceil(arr.length / 8) === 0 || +d === +pf(cierre));
  svg.append('g').selectAll('text').data(xt).join('text').attr('class', 'px-tick').attr('x', x).attr('y', H - 8).attr('text-anchor', 'middle').text((d) => d.getDate() + ' ' + PXP.MESES[d.getMonth()].slice(0, 3));
  // Meta
  svg.append('line').attr('x1', left).attr('x2', W - mg.r).attr('y1', y(r.meta_2027)).attr('y2', y(r.meta_2027)).attr('stroke', '#A57F2C').attr('stroke-width', 1.5);
  svg.append('text').attr('class', 'px-tick').attr('x', W - mg.r + 6).attr('y', y(r.meta_2027) + 4).style('fill', '#A57F2C').style('font-weight', 600).text('Meta ' + PXZ.compact(r.meta_2027));
  // Ritmo necesario
  svg.append('line').attr('x1', x(pf(last.f))).attr('y1', y(last.v)).attr('x2', x(pf(cierre))).attr('y2', y(r.meta_2027)).attr('stroke', '#9B2247').attr('stroke-width', 1.5).attr('stroke-dasharray', '2 4');
  // Proyección
  svg.append('line').attr('x1', x(pf(last.f))).attr('y1', y(last.v)).attr('x2', x(pf(cierre))).attr('y2', y(r.proyeccion_cierre)).attr('stroke', '#1E5B4F').attr('stroke-width', 2.5).attr('stroke-dasharray', '7 5');
  svg.append('circle').attr('cx', x(pf(cierre))).attr('cy', y(r.proyeccion_cierre)).attr('r', 5).attr('fill', 'var(--color-bg, #fff)').attr('stroke', '#1E5B4F').attr('stroke-width', 2.5);
  svg.append('text').attr('class', 'px-tick').attr('x', W - mg.r + 6).attr('y', y(r.proyeccion_cierre) + 4).style('fill', '#1E5B4F').style('font-weight', 700)
    .text('Proyección ' + PXZ.compact(r.proyeccion_cierre)).attr('dy', Math.abs(y(r.proyeccion_cierre) - y(r.meta_2027)) < 14 ? 14 : 0);
  // Registro observado
  if (pts.length > 1) svg.append('path').attr('d', d3.line().x((p) => x(pf(p.f))).y((p) => y(p.v))(pts)).attr('fill', 'none').attr('stroke', '#1E5B4F').attr('stroke-width', 3);
  const g = svg.selectAll('g.px-c').data(pts).join('g').attr('class', 'px-c');
  g.append('circle').attr('cx', (p) => x(pf(p.f))).attr('cy', (p) => y(p.v)).attr('r', 10).attr('fill', 'transparent');
  g.append('circle').attr('cx', (p) => x(pf(p.f))).attr('cy', (p) => y(p.v)).attr('r', 4.5).attr('fill', '#1E5B4F');
  PX.hover(el, g, (p) => [PXV.fecha(p.f), ['Inscripciones registradas', PX.fmt(Math.round(p.v))], ['Avance contra la meta', PXZ.pct(r.meta_2027 ? p.v / r.meta_2027 : null)]]);
});

// Ranking: avance proyectado al cierre por OOAD o Unidad Operativa.
dash.draw('ch-pred-nivel', (el) => {
  if (!PX.ready(el, ['pred_registro'])) return;
  const s = PXV.scope(), a = PX.area();
  const hijos = s.nivel === 'Nacional' ? 'OOAD' : 'Unidad Operativa';
  const rows = dash.data('pred_registro').data.filter((r) => (s.nivel === 'Unidad Operativa' ? r.nivel === 'Unidad Operativa' && r.clave === s.clave : r.nivel === hijos && r.padre === String(s.clave)) && r.area === a && r.meta_2027 > 0)
    .sort((x, y) => (y.avance_proyectado || 0) - (x.avance_proyectado || 0));
  if (!rows.length) { PXZ.empty(el); return; }
  const g = PXZ.hbar(el, rows, {
    aria: 'Avance proyectado al cierre del registro por ' + hijos,
    label: (r) => r.nombre + ' · meta ' + PX.fmt(r.meta_2027) + ' · proyectado ' + PX.fmt(r.proyeccion_cierre),
    value: (r) => r.avance_proyectado || 0, valueText: (r) => PXZ.pct(r.avance_proyectado),
    color: (r) => (r.inscripciones > 0 ? PXS.color(r.semaforo_proyectado) : '#98989A'),
    tip: (r) => [r.nombre, ['Meta de inscripciones 2027', PX.fmt(r.meta_2027)], ['Inscripciones registradas', PX.fmt(r.inscripciones)], ['Ritmo actual (por día hábil)', PX.fmt(Math.round(r.ritmo_diario))], ['Ritmo necesario (por día hábil)', PX.fmt(Math.round(r.ritmo_necesario))], ['Proyección al cierre', PX.fmt(r.proyeccion_cierre) + ' · ' + PXZ.pct(r.avance_proyectado)], ['Inscripciones reales 2027 estimadas', PX.fmt(r.real_2027_inscripciones) + ' · ' + PXZ.pct(r.cumplimiento_real_estimado)], ['Factor de cumplimiento 2026', r.factor_cumplimiento_2026 === null ? '—' : PXZ.pct(r.factor_cumplimiento_2026)]],
  });
  if (s.nivel !== 'Unidad Operativa') g.style('cursor', 'pointer').on('click', (ev, r) => (r.nivel === 'OOAD' ? dash.setParams({ ooad: r.clave, uo: null, inst: null }) : dash.setParams({ ooad: r.padre, uo: r.clave, inst: null })));
});
