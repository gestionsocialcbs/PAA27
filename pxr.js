// Módulos 2 y 3 · Programado (registro del PAA) contra real (reportes de operación). Cumplimiento = real ÷ programado, con el semáforo de avance.
window.PXR = (() => {
  const areaN = (a) => (a === 'CECART' ? 'Capacitación y Adiestramiento Técnico' : a === 'CASSAAM' ? 'Promoción de la Salud' : a);
  const uoKey = (u) => Math.floor(Number(u.cve_uo) / 1000) + '-' + (Number(u.cve_uo) % 1000);
  const sem = (v) => (v === null || v === undefined || !isFinite(v) ? null : v > 1.25 ? 'Morado' : v > 0.85 && v < 1.15 ? 'Verde' : (v >= 0.75 && v <= 0.85) || (v >= 1.15 && v <= 1.25) ? 'Amarillo' : 'Rojo');
  const C = { prog: '#A57F2C', real: '#1E5B4F' };
  const CFG = {
    ac: { niv: 'pr_ac', act: 'pr_ac_act', corte: 'rac_corte', hijo: 'Unidades Operativas', uni: 'unidad', med: 'Asistencias' },
    te: { niv: 'pr_te', act: 'pr_te_act', corte: 'rte_corte', hijo: 'teatros', uni: 'teatro', med: 'Asistencias' },
    cui: { niv: 'pr_cui', act: 'pr_cui_act', corte: 'ri_corte', hijo: 'Unidades Operativas', uni: 'unidad', med: 'Inscripciones', campo: 'inscripciones' },
    cua: { niv: 'pr_cua', act: 'pr_cua_act', corte: 'ri_corte', hijo: 'Unidades Operativas', uni: 'unidad', med: 'Asistencias', campo: 'asistencias' },
  };
  // El Módulo 1 (data-m="cu") sigue el botón Inscripciones / Asistencias.
  const mk = (el) => (el.dataset.m === 'cu' ? (PXMED.m() === 'asistencias' ? 'cua' : 'cui') : el.dataset.m);
  const como = (rows, campo) => rows.map((r) => ({ ...r, asistencias: Number(r[campo]) || 0 }));
  // Agrega programado y real por nivel (Nacional, OOAD, Unidad Operativa), área y mes (0 = todo el año).
  const niveles = (prog, real, uos, soloTeatros) => {
    const uo = new Map(uos.map((u) => [uoKey(u), u]));
    const acc = new Map();
    const conReal = new Map();
    const add = (lado, r) => {
      const u = uo.get(r.unidad);
      if (!u) return;
      const v = Number(r.asistencias) || 0;
      const mes = Number(r.mes) || 0;
      for (const area of ['Todas', areaN(r.area)]) {
        for (const [nivel, clave, nombre, padre] of [['Nacional', 'Nacional', 'Nacional', ''], ['OOAD', String(u.cve_ooad), u.ooad, 'Nacional'], ['Unidad Operativa', r.unidad, u.unidad_operativa || u.tipo_uo, String(u.cve_ooad)]]) {
          for (const m of mes ? [0, mes] : [0]) {
            const k = nivel + '|' + clave + '|' + area + '|' + m;
            const o = acc.get(k) || { nivel, clave, nombre, padre, area, mes: m, prog: 0, real: 0 };
            o[lado] += v;
            acc.set(k, o);
          }
          if (lado === 'real' && v > 0) { const kk = nivel + '|' + clave + '|' + area; if (!conReal.has(kk)) conReal.set(kk, new Set()); conReal.get(kk).add(r.unidad); }
        }
      }
    };
    for (const r of prog) add('prog', r);
    for (const r of real) add('real', r);
    const univ = new Map();
    for (const u of uos) {
      if (soloTeatros && u.tipo_uo !== 'Teatro Cubierto') continue;
      univ.set('Nacional|Nacional', (univ.get('Nacional|Nacional') || 0) + 1);
      univ.set('OOAD|' + u.cve_ooad, (univ.get('OOAD|' + u.cve_ooad) || 0) + 1);
    }
    return [...acc.values()].map((o) => {
      const c = o.prog ? o.real / o.prog : null;
      const s = conReal.get(o.nivel + '|' + o.clave + '|' + o.area);
      return { ...o, cumplimiento: c, semaforo: sem(c), diferencia: o.real - o.prog, unidades_real: o.mes === 0 && s ? s.size : null, unidades_universo: o.mes === 0 ? univ.get(o.nivel + '|' + o.clave) ?? null : null };
    });
  };
  // Programado y real por actividad, por nivel y área.
  const actividades = (prog, real, catP, catR, uos) => {
    const uo = new Map(uos.map((u) => [uoKey(u), u]));
    const nom = new Map();
    for (const c of catR) nom.set(String(c.clave_actividad), c);
    for (const c of catP) if (!nom.has(String(c.clave_actividad))) nom.set(String(c.clave_actividad), c);
    const acc = new Map();
    const add = (lado, r) => {
      const u = uo.get(r.unidad);
      if (!u) return;
      const cl = String(r.clave_actividad);
      const c = nom.get(cl) || {};
      for (const area of ['Todas', areaN(r.area)]) {
        for (const [nivel, clave] of [['Nacional', 'Nacional'], ['OOAD', String(u.cve_ooad)], ['Unidad Operativa', r.unidad]]) {
          const k = nivel + '|' + clave + '|' + area + '|' + cl;
          const o = acc.get(k) || { nivel, clave, area, clave_actividad: cl, actividad: c.actividad || cl, tipo_actividad: c.tipo_actividad || '', prog: 0, real: 0 };
          o[lado] += Number(r.asistencias) || 0;
          acc.set(k, o);
        }
      }
    };
    for (const r of prog) add('prog', r);
    for (const r of real) add('real', r);
    return [...acc.values()].map((o) => { const c = o.prog ? o.real / o.prog : null; return { ...o, cumplimiento: c, semaforo: sem(c) }; });
  };
  const where = (r, extra) => 'nivel=' + PX.esc(r.nivel) + '&clave=' + PX.esc(r.clave) + '&area=' + PX.esc(r.area) + (extra || '');
  const find = (m, nivel, clave, mes) => {
    const d = dash.data(CFG[m].niv);
    if (d.status !== 'ok') return null;
    const a = PX.area();
    return d.data.find((r) => r.nivel === nivel && r.clave === clave && r.area === a && r.mes === (mes || 0)) || null;
  };
  const empty = (el, t) => { const p = document.createElement('p'); p.className = 'px-note'; p.textContent = t || 'Sin asistencias programadas ni reales en el ámbito y el área seleccionados.'; el.appendChild(p); };
  const pctG = d3.format(',.1%');
  const cumpTxt = (r) => (r.cumplimiento === null ? 'Sin programado' : pctG(r.cumplimiento));
  const fmtc = (v) => new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  const tip = (head, r, med) => {
    med = med || 'Asistencias';
    const out = [head, [med + ' programadas (PAA)', PX.fmt(Math.round(r.prog))], [med + ' reales', PX.fmt(Math.round(r.real))], ['Cumplimiento', cumpTxt(r)]];
    if (r.semaforo) out.push(['Semáforo', r.semaforo]);
    return out;
  };
  // Pares de barras: programado (arriba) y real (abajo), con el cumplimiento a la derecha.
  const pair = (el, rows, o) => {
    const anim = !el.dataset.pxDrawn && rows.length > 0;
    if (anim) el.dataset.pxDrawn = '1';
    const W = Math.max(260, el.clientWidth);
    const step = 50;
    const H = Math.max(step, rows.length * step);
    el.style.minHeight = H + 'px';
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', o.aria || '');
    const mx = d3.max(rows, (d) => Math.max(d.prog, d.real)) || 1;
    const probe = svg.append('text').attr('class', 'px-val').attr('font-weight', 600);
    let valW = 0;
    for (const d of rows) { probe.text(PX.fmt(Math.round(d.real)) + ' · ' + cumpTxt(d)); valW = Math.max(valW, probe.node().getComputedTextLength()); }
    valW += 14;
    probe.remove();
    const x = d3.scaleLinear([0, mx], [0, Math.max(40, W - valW)]);
    const g = svg.selectAll('g.px-row').data(rows).join('g').attr('class', 'px-row').attr('transform', (d, i) => `translate(0,${i * step})`);
    g.append('rect').attr('width', W).attr('height', step).attr('fill', 'transparent');
    g.append('text').attr('class', 'px-lbl').attr('y', 13).text(o.label).each(function () { PX.fit(this, W - 4); });
    for (const [lado, y] of [['prog', 19], ['real', 32]]) {
      g.append('rect').attr('y', y).attr('height', 10).attr('rx', 2).attr('width', (d) => (d[lado] > 0 ? Math.max(2, x(d[lado])) : 0)).attr('fill', C[lado])
        .attr('class', anim ? 'px-grow-x' : null).style('animation-delay', (d, i) => (anim ? i * 35 + 'ms' : null));
    }
    g.append('text').attr('class', 'px-val').attr('y', 28).attr('x', (d) => Math.max(2, x(d.prog)) + 6).text((d) => PX.fmt(Math.round(d.prog)));
    const t = g.append('text').attr('class', 'px-val').attr('y', 41).attr('x', (d) => Math.max(2, x(d.real)) + 6);
    t.append('tspan').text((d) => PX.fmt(Math.round(d.real)) + ' · ');
    t.append('tspan').attr('font-weight', 600).attr('fill', (d) => (d.semaforo ? PXS.color(d.semaforo) : 'currentColor')).text((d) => cumpTxt(d));
    PX.hover(el, g, (d) => tip(o.label(d), d, o.med));
    return g;
  };
  return { C, CFG, mk, como, sem, niveles, actividades, where, find, empty, cumpTxt, fmtc, tip, pair };
})();

dash.calc('pr_ac', {
  title: 'Actividades complementarias: programado contra real por nivel y mes',
  description: 'Asistencias programadas (registro del PAA 2027, CAN_ASISTENCIA) y asistencias reales (Reporte de actividades complementarias, TOTAL_ASISTENCIAS) a nivel nacional, por OOAD y por Unidad Operativa, por área normativa y en total, por mes (0 = todo el año); cumplimiento = real ÷ programado, con su semáforo, y Unidades Operativas con asistencias reales.',
  inputs: ['ac_detalle', 'rac_registro', 'unidades_operativas'],
  fn: (ac_detalle, rac_registro, unidades_operativas) => PXR.niveles(ac_detalle, rac_registro, unidades_operativas, false),
});
dash.calc('pr_ac_act', {
  title: 'Actividades complementarias: programado contra real por actividad',
  description: 'Asistencias programadas y reales por actividad, a nivel nacional, por OOAD y por Unidad Operativa, por área normativa y en total, con su cumplimiento y semáforo.',
  inputs: ['ac_detalle', 'rac_registro', 'ac_catalogo', 'rac_catalogo', 'unidades_operativas'],
  fn: (ac_detalle, rac_registro, ac_catalogo, rac_catalogo, unidades_operativas) => PXR.actividades(ac_detalle, rac_registro, ac_catalogo, rac_catalogo, unidades_operativas),
});
dash.calc('pr_te', {
  title: 'Teatros: programado contra real por nivel y mes',
  description: 'Asistencias programadas (Reporte PAA Teatros, NUM_ASISTENCIA) y asistencias reales (Reporte de Teatros, NUM_TOTAL_ASISTENCIAS) a nivel nacional, por OOAD y por teatro, por área normativa y en total, por mes (0 = todo el año); cumplimiento = real ÷ programado, con su semáforo, y teatros con asistencias reales frente a los Teatros Cubiertos del catálogo.',
  inputs: ['te_registro', 'rte_registro', 'unidades_operativas'],
  fn: (te_registro, rte_registro, unidades_operativas) => PXR.niveles(te_registro, rte_registro, unidades_operativas, true),
});
dash.calc('pr_te_act', {
  title: 'Teatros: programado contra real por actividad',
  description: 'Asistencias programadas y reales en teatros por actividad, a nivel nacional, por OOAD y por teatro, por área normativa y en total, con su cumplimiento y semáforo.',
  inputs: ['te_registro', 'rte_registro', 'te_catalogo', 'rte_catalogo', 'unidades_operativas'],
  fn: (te_registro, rte_registro, te_catalogo, rte_catalogo, unidades_operativas) => PXR.actividades(te_registro, rte_registro, te_catalogo, rte_catalogo, unidades_operativas),
});

dash.calc('pr_cui', {
  title: 'Cursos y talleres: inscripciones programadas contra reales por nivel y mes',
  description: 'Inscripciones programadas (registro del PAA 2027, CAN_CUPO, por mes de inicio del grupo) e inscripciones reales (reporte de Inscritos, CAN_INSCRITOS: inscripciones nuevas de cada mes) a nivel nacional, por OOAD y por Unidad Operativa, por área normativa y en total, por mes (0 = todo el año); cumplimiento = real ÷ programado, con su semáforo.',
  inputs: ['avance_dimension', 'ri_registro', 'unidades_operativas'],
  fn: (avance_dimension, ri_registro, unidades_operativas) => PXR.niveles(PXR.como(avance_dimension.filter((r) => r.dimension === 'Mes de inicio').map((r) => ({ ...r, mes: Number(r.valor) })), 'inscripciones'), PXR.como(ri_registro, 'inscripciones'), unidades_operativas, false),
});
dash.calc('pr_cua', {
  title: 'Cursos y talleres: asistencias programadas contra reales por nivel y mes',
  description: 'Asistencias programadas (registro del PAA 2027, CAN_ASISTENCIAS, por mes de inicio del grupo) y asistencias reales (reporte de Inscritos, CAN_ASISTENCIAS de cada mes) a nivel nacional, por OOAD y por Unidad Operativa, por área normativa y en total, por mes (0 = todo el año); cumplimiento = real ÷ programado, con su semáforo.',
  inputs: ['avance_dimension', 'ri_registro', 'unidades_operativas'],
  fn: (avance_dimension, ri_registro, unidades_operativas) => PXR.niveles(PXR.como(avance_dimension.filter((r) => r.dimension === 'Mes de inicio').map((r) => ({ ...r, mes: Number(r.valor) })), 'asistencias'), PXR.como(ri_registro, 'asistencias'), unidades_operativas, false),
});
dash.calc('pr_cui_act', {
  title: 'Cursos y talleres: inscripciones programadas contra reales por actividad',
  description: 'Inscripciones programadas y reales por actividad, a nivel nacional, por OOAD y por Unidad Operativa, por área normativa y en total, con su cumplimiento y semáforo.',
  inputs: ['avance_actividad', 'ri_actividad', 'avance_catalogo_actividades', 'ri_catalogo', 'unidades_operativas'],
  fn: (avance_actividad, ri_actividad, cp, cr, unidades_operativas) => PXR.actividades(PXR.como(avance_actividad, 'inscripciones'), PXR.como(ri_actividad, 'inscripciones'), cp.map((c) => ({ ...c, actividad: String(c.actividad).charAt(0) + String(c.actividad).slice(1).toLowerCase() })), cr, unidades_operativas),
});
dash.calc('pr_cua_act', {
  title: 'Cursos y talleres: asistencias programadas contra reales por actividad',
  description: 'Asistencias programadas y reales por actividad, a nivel nacional, por OOAD y por Unidad Operativa, por área normativa y en total, con su cumplimiento y semáforo.',
  inputs: ['avance_actividad', 'ri_actividad', 'avance_catalogo_actividades', 'ri_catalogo', 'unidades_operativas'],
  fn: (avance_actividad, ri_actividad, cp, cr, unidades_operativas) => PXR.actividades(PXR.como(avance_actividad, 'asistencias'), PXR.como(ri_actividad, 'asistencias'), cp.map((c) => ({ ...c, actividad: String(c.actividad).charAt(0) + String(c.actividad).slice(1).toLowerCase() })), cr, unidades_operativas),
});

dash.draw('pr-corte', (el) => {
  const d = dash.data(PXR.CFG[PXR.mk(el)].corte);
  if (d.status !== 'ok' || !d.data.length) { el.textContent = '—'; return; }
  const r = [...d.data].sort((x, y) => String(y.fecha_corte).localeCompare(String(x.fecha_corte)))[0];
  el.textContent = PXV.fecha(r.fecha_corte);
});

dash.draw('pr-anios', (el) => {
  const d = dash.data(PXR.CFG[PXR.mk(el)].corte);
  el.textContent = '';
  if (d.status !== 'ok' || !d.data.length) return;
  const r = [...d.data].sort((x, y) => String(y.fecha_corte).localeCompare(String(x.fecha_corte)))[0];
  // En el tablero, una lista dentro de un renglón llega como texto JSON ("[2026, 2027]").
  const lista = Array.isArray(r.anios) ? r.anios : String(r.anios || '').replace(/[\[\]\s]/g, '').split(',').filter(Boolean);
  const an = lista.map(Number).filter((y) => y && y !== 2027);
  if (an.length) el.textContent = 'Aviso: el reporte real de este corte trae registros de ' + an.join(' y ') + '; el comparativo cobra sentido con la operación de 2027.';
});

dash.draw('prk', (el) => {
  const m = PXR.mk(el), k = el.dataset.k;
  const st = dash.data(PXR.CFG[m].niv).status;
  el.classList.toggle('dash-skeleton', st === 'loading');
  const s = PXV.scope();
  const r = PXR.find(m, s.nivel, s.clave);
  if (!r) { el.textContent = st === 'ok' ? (k === 'cumplimiento' ? '—' : '0') : '—'; return; }
  if (k === 'meta') {
    const md = dash.data('metas_nivel');
    const mt = md.status === 'ok' ? md.data.find((x) => x.nivel === s.nivel && x.clave === s.clave && x.area === PX.area()) : null;
    el.textContent = '';
    if (!mt || !mt.meta_2027) { el.textContent = '—'; return; }
    const v = r.real / mt.meta_2027, sm = PXR.sem(v);
    if (sm) { const dot = document.createElement('span'); dot.className = 'px-dot'; dot.style.background = PXS.color(sm); dot.title = sm; el.appendChild(dot); }
    const sp = document.createElement('span');
    sp.textContent = PXR.cumpTxt({ cumplimiento: v });
    el.appendChild(sp);
    const de = document.createElement('span'); de.className = 'px-kpi-de'; de.textContent = ' de ' + PX.fmt(Math.round(mt.meta_2027)); el.appendChild(de);
    return;
  }
  if (k === 'cumplimiento') {
    el.textContent = '';
    if (r.semaforo) { const dot = document.createElement('span'); dot.className = 'px-dot'; dot.style.background = PXS.color(r.semaforo); dot.title = r.semaforo; el.appendChild(dot); }
    const sp = document.createElement('span');
    el.appendChild(sp);
    if (r.cumplimiento === null) { sp.textContent = 'Sin programado'; return; }
    pxMark(sp, PXR.CFG[m].niv, 'cumplimiento', PXR.where(r, '&mes=0'), PXR.cumpTxt(r));
    return;
  }
  pxMark(el, PXR.CFG[m].niv, k, PXR.where(r, '&mes=0'), PX.fmt(Math.round(r[k])));
  if (k === 'real' && r.unidades_real !== null && r.unidades_universo) {
    const de = document.createElement('span');
    de.className = 'px-kpi-de';
    de.textContent = ' · ' + PX.fmt(r.unidades_real) + ' de ' + PX.fmt(r.unidades_universo) + ' ' + PXR.CFG[m].hijo;
    el.appendChild(de);
  }
});

dash.draw('ch-pr-mes', (el) => {
  const m = PXR.mk(el);
  if (!PX.ready(el, [PXR.CFG[m].niv])) return;
  const s = PXV.scope();
  const a = PX.area();
  const by = new Map(dash.data(PXR.CFG[m].niv).data.filter((r) => r.nivel === s.nivel && r.clave === s.clave && r.area === a && r.mes > 0).map((r) => [r.mes, r]));
  if (!by.size) { PXR.empty(el); return; }
  const rows = d3.range(1, 13).map((mm) => by.get(mm) || { mes: mm, prog: 0, real: 0, cumplimiento: null, semaforo: null });
  const anim = !el.dataset.pxDrawn;
  el.dataset.pxDrawn = '1';
  const W = Math.max(280, el.clientWidth), H = 240, mg = { t: 18, b: 22 };
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', PXR.CFG[m].med + ' programadas y reales por mes');
  const mx = d3.max(rows, (r) => Math.max(r.prog, r.real)) || 1;
  const ticks = d3.scaleLinear([0, mx], [0, 1]).nice().ticks(4);
  const probe = svg.append('text').attr('class', 'px-tick').text(PXR.fmtc(d3.max(ticks)));
  const left = probe.node().getComputedTextLength() + 8;
  probe.remove();
  const y = d3.scaleLinear([0, mx], [H - mg.b, mg.t]).nice();
  const x = d3.scaleBand(d3.range(12), [left, W]).padding(0.22);
  const xi = d3.scaleBand(['prog', 'real'], [0, x.bandwidth()]).padding(0.08);
  svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', left).attr('x2', W).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
  svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('class', 'px-tick').attr('x', left - 6).attr('y', (t) => y(t) + 4).attr('text-anchor', 'end').text(PXR.fmtc);
  const g = svg.selectAll('g.px-m').data(rows).join('g').attr('class', 'px-m');
  g.append('rect').attr('x', (r) => x(r.mes - 1) - 2).attr('width', x.bandwidth() + 4).attr('y', 0).attr('height', H).attr('fill', 'transparent');
  for (const lado of ['prog', 'real']) {
    g.append('rect').attr('x', (r) => x(r.mes - 1) + xi(lado)).attr('width', xi.bandwidth()).attr('y', (r) => y(r[lado])).attr('height', (r) => y(0) - y(r[lado])).attr('rx', 2).attr('fill', PXR.C[lado])
      .attr('class', anim ? 'px-grow' : null).style('animation-delay', (r) => (anim ? r.mes * 30 + 'ms' : null));
  }
  g.append('text').attr('class', 'px-tick').attr('x', (r) => x(r.mes - 1) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').text((r) => PXU2.MES[r.mes - 1]);
  PX.hover(el, g, (r) => PXR.tip(PXP.MESES[r.mes - 1].replace(/^./, (c) => c.toUpperCase()), r, PXR.CFG[m].med));
});

dash.draw('ch-pr-area', (el) => {
  const m = PXR.mk(el);
  if (!PX.ready(el, [PXR.CFG[m].niv])) return;
  const s = PXV.scope();
  const rows = dash.data(PXR.CFG[m].niv).data.filter((r) => r.nivel === s.nivel && r.clave === s.clave && r.area !== 'Todas' && r.mes === 0).sort((x, y) => Math.max(y.prog, y.real) - Math.max(x.prog, x.real));
  if (!rows.length) { PXR.empty(el); return; }
  PXR.pair(el, rows, { aria: PXR.CFG[m].med + ' programadas y reales por área normativa', label: (d) => d.area, med: PXR.CFG[m].med });
});

dash.draw('ch-pr-act', (el) => {
  const m = PXR.mk(el);
  if (!PX.ready(el, [PXR.CFG[m].act])) return;
  const s = PXV.scope();
  const a = PX.area();
  const rows = dash.data(PXR.CFG[m].act).data.filter((r) => r.nivel === s.nivel && r.clave === s.clave && r.area === a).sort((x, y) => Math.max(y.prog, y.real) - Math.max(x.prog, x.real)).slice(0, 15);
  if (!rows.length) { PXR.empty(el); return; }
  PXR.pair(el, rows, { aria: PXR.CFG[m].med + ' programadas y reales por actividad', label: (d) => d.actividad, med: PXR.CFG[m].med });
});

dash.draw('pr-ct', (el) => {
  const m = PXR.mk(el);
  const s = PXV.scope();
  const r = PXR.find(m, s.nivel, s.clave);
  const hijo = m === 'te' ? 'teatro' : 'Unidad Operativa';
  el.textContent = s.nivel === 'Nacional' ? 'Programado contra real por OOAD' : s.nivel === 'OOAD' ? 'Programado contra real por ' + hijo + ' · ' + (r ? r.nombre : '') : 'Programado contra real · ' + (r ? r.nombre : '');
});

dash.draw('ch-pr-nivel', (el) => {
  const m = PXR.mk(el);
  if (!PX.ready(el, [PXR.CFG[m].niv])) return;
  const s = PXV.scope();
  const a = PX.area();
  const d = dash.data(PXR.CFG[m].niv).data;
  const rows = s.nivel === 'Unidad Operativa'
    ? d.filter((r) => r.nivel === 'Unidad Operativa' && r.clave === s.clave && r.area === a && r.mes === 0)
    : d.filter((r) => r.nivel === (s.nivel === 'Nacional' ? 'OOAD' : 'Unidad Operativa') && r.padre === s.clave && r.area === a && r.mes === 0).sort((x, y) => Math.max(y.prog, y.real) - Math.max(x.prog, x.real));
  if (!rows.length) { PXR.empty(el); return; }
  const g = PXR.pair(el, rows, { aria: PXR.CFG[m].med + ' programadas y reales por ' + (s.nivel === 'Nacional' ? 'OOAD' : 'Unidad Operativa'), label: (r) => r.nombre, med: PXR.CFG[m].med });
  if (s.nivel !== 'Unidad Operativa') {
    g.style('cursor', 'pointer').on('click', (ev, r) => {
      if (r.nivel === 'OOAD') dash.setParams({ ooad: r.clave, uo: null, inst: null });
      else dash.setParams({ ooad: r.padre, uo: r.clave, inst: null });
    });
  }
});

dash.draw('ch-pr-cortes', (el) => {
  const m = PXR.mk(el);
  if (!PX.ready(el, [PXR.CFG[m].corte])) return;
  const rows = [...dash.data(PXR.CFG[m].corte).data].sort((x, y) => String(x.fecha_corte).localeCompare(String(y.fecha_corte)));
  if (!rows.length) return;
  const W = Math.max(260, el.clientWidth), H = 220;
  el.style.minHeight = H + 'px';
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Asistencias reales por fecha de corte');
  const fld = PXR.CFG[m].campo || 'asistencias';
  rows.forEach((r) => { r.asistencias_v = Number(r[fld]) || 0; });
  const y = d3.scaleLinear([0, (d3.max(rows, (r) => r.asistencias_v) || 1) * 1.15], [H - 26, 18]).nice();
  const ticks = y.ticks(4);
  const probe = svg.append('text').attr('class', 'px-tick').text(PXR.fmtc(d3.max(ticks)));
  const left = probe.node().getComputedTextLength() + 8;
  probe.remove();
  const x = d3.scaleBand(rows.map((r) => r.fecha_corte), [left, W - 4]).paddingInner(0.35).paddingOuter(0.2);
  svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', left).attr('x2', W - 4).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
  svg.append('g').selectAll('text').data(ticks).join('text').attr('class', 'px-tick').attr('x', left - 6).attr('y', (t) => y(t) + 4).attr('text-anchor', 'end').text(PXR.fmtc);
  const f = (iso) => { const [, mm, dd] = String(iso).split('-').map(Number); return dd + ' ' + PXP.MESES[mm - 1].slice(0, 3); };
  svg.append('g').selectAll('text').data(rows).join('text').attr('class', 'px-tick').attr('text-anchor', 'middle').attr('x', (r) => x(r.fecha_corte) + x.bandwidth() / 2).attr('y', H - 8).text((r) => f(r.fecha_corte));
  const bw = Math.min(40, x.bandwidth());
  const g = svg.append('g').selectAll('g').data(rows).join('g');
  g.append('rect').attr('x', (r) => x(r.fecha_corte)).attr('width', x.bandwidth()).attr('y', 0).attr('height', H - 26).attr('fill', 'transparent');
  g.append('rect').attr('x', (r) => x(r.fecha_corte) + (x.bandwidth() - bw) / 2).attr('width', bw).attr('rx', 3).attr('y', (r) => y(r.asistencias_v)).attr('height', (r) => y(0) - y(r.asistencias_v)).attr('fill', PXR.C.real);
  const lab = g.append('text').attr('class', 'px-val').attr('text-anchor', 'middle').attr('x', (r) => x(r.fecha_corte) + x.bandwidth() / 2).attr('y', (r) => y(r.asistencias_v) - 5).text((r) => PX.fmt(r.asistencias_v));
  if ((d3.max(lab.nodes(), (n) => n.getComputedTextLength()) || 0) > x.step()) lab.remove();
  PX.hover(el, g, (r) => [PXV.fecha(r.fecha_corte), [PXR.CFG[m].med + ' reales', PX.fmt(r.asistencias_v)], [m === 'te' ? 'Teatros con registro' : 'Unidades Operativas con registro', PX.fmt(m === 'te' ? r.teatros : r.unidades)]]);
});
