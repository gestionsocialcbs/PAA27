// Módulo 4 · Registro en instalaciones programables: cruce del registro del PAA 2027 (cursos y talleres, actividades complementarias)
// con la base de instalaciones HRI 2027, unida por OOAD, UOPSI, Centro de Extensión y nombre de la instalación.
window.PXIP = (() => {
  const C = { con: '#1E5B4F', sin: 'color-mix(in srgb, var(--color-fg-muted) 22%, transparent)', nop: '#9B2247' };
  const areaN = (a) => (a === 'CECART' ? 'Capacitación y Adiestramiento Técnico' : a === 'CASSAAM' ? 'Promoción de la Salud' : a);
  let filtro = 'todas';
  let memo = { inst: null, reg: null, out: null };
  // Instalaciones con su registro en el área elegida y el ámbito del filtro.
  const base = () => {
    const di = dash.data('ip_base'), dr = dash.data('ip_registro');
    if (di.status !== 'ok' || dr.status !== 'ok') return null;
    if (memo.inst !== di.data || memo.reg !== dr.data) {
      const reg = new Map();
      for (const r of dr.data) {
        const a = areaN(r.area);
        const o = reg.get(r.id) || [];
        o.push({ ...r, area: a });
        reg.set(r.id, o);
      }
      memo = { inst: di.data, reg: dr.data, out: reg };
    }
    const s = PXV.scope(), a = PX.area();
    const Z = () => ({ cu_grupos: 0, cu_inscripciones: 0, cu_asistencias: 0, ac_grupos: 0, ac_asistencias: 0 });
    return di.data.filter((r) => s.nivel === 'Nacional' || (s.nivel === 'OOAD' ? String(r.cve_ooad) === String(s.clave) : r.unidad === s.clave)).map((r) => {
      const t = Z();
      for (const g of memo.out.get(r.id) || []) if (a === 'Todas' || g.area === a) for (const k in t) t[k] += Number(g[k]) || 0;
      const con = t.cu_grupos + t.ac_grupos > 0;
      return { ...r, ...t, con, situacion: r.programable === 'SI' ? (con ? 'Con registro' : 'Sin registro') : (con ? 'No programable con registro' : 'No programable') };
    });
  };
  const sinCat = () => {
    const d = dash.data('ip_sin');
    if (d.status !== 'ok') return null;
    const s = PXV.scope(), a = PX.area();
    return d.data.filter((r) => (s.nivel === 'Nacional' || (s.nivel === 'OOAD' ? String(r.cve_ooad) === String(s.clave) : r.unidad === s.clave)) && (a === 'Todas' || r.area === a));
  };
  const pct = (n, d) => (d ? (n / d * 100).toLocaleString('es-MX', { maximumFractionDigits: 1 }) + ' %' : '—');
  // Barras apiladas: con registro y sin registro, sobre el total de programables.
  const barras = (el, T, aria, click) => {
    const W = Math.max(260, el.clientWidth), step = 30, H = T.length * step;
    el.style.minHeight = H + 'px';
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', aria);
    const probe = svg.append('text').attr('class', 'px-lbl');
    let lw = 0; T.forEach((d) => { probe.text(d.nombre); lw = Math.max(lw, probe.node().getComputedTextLength()); }); probe.remove();
    lw = Math.min(lw + 8, W * 0.4);
    const vw = 120;
    const x = d3.scaleLinear([0, d3.max(T, (d) => d.prog) || 1], [0, Math.max(40, W - lw - vw)]);
    const g = svg.selectAll('g.px-row').data(T).join('g').attr('class', 'px-row').attr('transform', (d, i) => `translate(0,${i * step})`).style('cursor', click ? 'pointer' : null);
    g.append('rect').attr('width', W).attr('height', step).attr('fill', 'transparent');
    g.append('text').attr('class', 'px-lbl').attr('x', lw - 6).attr('y', 19).attr('text-anchor', 'end').text((d) => d.nombre).each(function () { PX.fit(this, lw - 8); });
    g.append('rect').attr('x', lw).attr('y', 8).attr('height', 14).attr('rx', 2).attr('width', (d) => Math.max(1, x(d.prog))).attr('fill', C.sin);
    g.append('rect').attr('x', lw).attr('y', 8).attr('height', 14).attr('rx', 2).attr('width', (d) => (d.con ? Math.max(2, x(d.con)) : 0)).attr('fill', C.con);
    g.append('text').attr('class', 'px-val').attr('y', 19).attr('x', (d) => lw + Math.max(1, x(d.prog)) + 6).text((d) => PX.fmt(d.con) + ' de ' + PX.fmt(d.prog) + ' · ' + pct(d.con, d.prog));
    PX.hover(el, g, (d) => [d.nombre, ['Instalaciones programables', PX.fmt(d.prog)], ['Con registro', PX.fmt(d.con) + ' (' + pct(d.con, d.prog) + ')'], ['Sin registro', PX.fmt(d.prog - d.con)]]);
    if (click) g.on('click', (ev, d) => click(d));
  };
  const SIT = { 'Con registro': C.con, 'Sin registro': '#98989A', 'No programable con registro': C.nop };
  const tabla = (el) => {
    el.replaceChildren();
    const rows = base();
    if (!rows) return;
    const F = { todas: (r) => r.programable === 'SI', con: (r) => r.programable === 'SI' && r.con, sin: (r) => r.programable === 'SI' && !r.con, nop: (r) => r.programable === 'NO' && r.con };
    const L = rows.filter(F[filtro]).sort((a, b) => (b.con - a.con) || String(a.ooad).localeCompare(String(b.ooad)) || String(a.unidad_operativa).localeCompare(String(b.unidad_operativa)) || String(a.cec).localeCompare(String(b.cec)) || String(a.instalacion).localeCompare(String(b.instalacion), 'es', { numeric: true }));
    const mas = document.getElementById('ip-mas');
    if (mas) mas.textContent = L.length > 300 ? 'Se muestran 300 de ' + PX.fmt(L.length) + ' instalaciones; elige una OOAD o una Unidad Operativa para ver el resto.' : PX.fmt(L.length) + (L.length === 1 ? ' instalación.' : ' instalaciones.');
    if (!L.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 10; td.className = 'px-note'; td.textContent = 'Sin instalaciones en esta selección.'; tr.appendChild(td); el.appendChild(tr); return; }
    const frag = document.createDocumentFragment();
    for (const r of L.slice(0, 300)) {
      const tr = document.createElement('tr');
      tr.dataset.key = String(r.id);
      const c = (t, cls) => { const td = document.createElement('td'); if (cls) td.className = cls; td.textContent = t; tr.appendChild(td); return td; };
      const chip = document.createElement('span'); chip.className = 'px-adv-chip'; chip.style.setProperty('--c', SIT[r.situacion] || '#98989A'); chip.textContent = r.situacion;
      c('').appendChild(chip);
      c(r.unidad_operativa); c(r.cec || '—'); c(r.instalacion); c(r.servicio); c(r.estatus);
      const n = (v) => (v ? PX.fmt(v) : '—');
      c(n(r.cu_grupos), 'px-num'); c(n(r.cu_inscripciones), 'px-num'); c(n(r.cu_asistencias), 'px-num'); c(n(r.ac_asistencias), 'px-num');
      frag.appendChild(tr);
    }
    el.appendChild(frag);
  };
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('.px-ip-f');
    if (!b) return;
    filtro = b.dataset.f;
    document.querySelectorAll('.px-ip-f').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const t = document.querySelector('[data-draw="ip-tabla"]');
    if (t) tabla(t);
  });
  return { C, base, sinCat, pct, barras, tabla, areaN };
})();

dash.calc('ip_base', {
  title: 'Instalaciones programables de la base HRI 2027',
  description: 'Instalaciones con INSTALACIÓN PROGRAMABLE = SI de la base HRI 2027 (y las no programables que tienen registro), con su OOAD, Unidad Operativa, Centro de Extensión, servicio, estatus y la forma en que se unieron con el registro del PAA (OOAD, UOPSI, Centro de Extensión y nombre de la instalación).',
  inputs: ['ip_instalaciones', 'unidades_operativas'],
  fn: (ip_instalaciones, unidades_operativas) => {
    const uo = new Map(unidades_operativas.map((u) => [Math.floor(Number(u.cve_uo) / 1000) + '-' + (Number(u.cve_uo) % 1000), u]));
    const cap = (s) => String(s || '').toLowerCase().replace(/^./, (c) => c.toUpperCase());
    return ip_instalaciones.map((r) => {
      const u = uo.get(r.unidad) || {};
      return { ...r, id: Number(r.id), cve_ooad: String(r.cve_ooad), ooad: u.ooad || '', unidad_operativa: u.unidad_operativa || r.unidad, instalacion: cap(r.instalacion) };
    });
  },
});

dash.calc('ip_sin', {
  title: 'Registro sin instalación en la base HRI 2027',
  description: 'Grupos de cursos y talleres y de actividades complementarias que no se pudieron unir con una instalación de la base HRI 2027, con el motivo (sin instalación asignada, Centro de Extensión sin instalación o nombre que no está en la base de la unidad) y el área normativa.',
  inputs: ['ip_sin_catalogo', 'unidades_operativas'],
  fn: (ip_sin_catalogo, unidades_operativas) => {
    const uo = new Map(unidades_operativas.map((u) => [Math.floor(Number(u.cve_uo) / 1000) + '-' + (Number(u.cve_uo) % 1000), u]));
    return ip_sin_catalogo.map((r) => {
      const u = uo.get(r.unidad) || {};
      return { ...r, area: PXIP.areaN(r.area), cve_ooad: String(u.cve_ooad ?? ''), unidad_operativa: u.unidad_operativa || r.unidad, grupos: Number(r.grupos) || 0 };
    });
  },
});

dash.draw('ipk', (el) => {
  const st = dash.data('ip_base').status;
  el.classList.toggle('dash-skeleton', st === 'loading');
  el.textContent = '';
  const rows = PXIP.base();
  if (!rows) { el.textContent = '—'; return; }
  const P = rows.filter((r) => r.programable === 'SI');
  const con = P.filter((r) => r.con).length;
  const k = el.dataset.k;
  const de = (t) => { const n = document.createElement('span'); n.className = 'px-kpi-de'; n.textContent = t; el.appendChild(n); };
  const txt = (t) => el.appendChild(document.createTextNode(t));
  if (k === 'prog') { txt(PX.fmt(P.length)); { const u = new Set(P.map((r) => r.unidad)).size; de(' · ' + PX.fmt(u) + (u === 1 ? ' unidad' : ' unidades')); } }
  else if (k === 'con') { txt(PX.fmt(con)); de(' · ' + PXIP.pct(con, P.length)); }
  else if (k === 'sin') { txt(PX.fmt(P.length - con)); de(' · ' + PXIP.pct(P.length - con, P.length)); }
  else if (k === 'nop') { const n = rows.filter((r) => r.programable === 'NO' && r.con).length; txt(PX.fmt(n)); de(n === 1 ? ' instalación' : ' instalaciones'); }
  else if (k === 'sincat') { const s = PXIP.sinCat(); { const g = s ? d3.sum(s, (r) => r.grupos) : null; txt(g === null ? '—' : PX.fmt(g)); de(g === 1 ? ' grupo' : ' grupos'); } }
});

dash.draw('ip-lead', (el) => {
  const rows = PXIP.base();
  if (!rows) { el.textContent = '—'; return; }
  const P = rows.filter((r) => r.programable === 'SI');
  const con = P.filter((r) => r.con).length;
  el.textContent = PX.fmt(con) + ' de ' + PX.fmt(P.length) + ' instalaciones programables (' + PXIP.pct(con, P.length) + ')';
});

dash.draw('ip-ct', (el) => {
  const s = PXV.scope();
  el.textContent = s.nivel === 'Nacional' ? 'Por OOAD' : s.nivel === 'OOAD' ? 'Por Unidad Operativa' : 'Unidad Operativa seleccionada';
});

dash.draw('ch-ip-nivel', (el) => {
  if (!PX.ready(el, ['ip_base', 'ip_registro'])) return;
  const s = PXV.scope();
  const rows = PXIP.base().filter((r) => r.programable === 'SI');
  if (!rows.length) { PXR.empty(el, 'Sin instalaciones programables en el ámbito seleccionado.'); return; }
  const key = s.nivel === 'Nacional' ? (r) => r.cve_ooad : (r) => r.unidad;
  const T = d3.rollups(rows, (v) => ({ nombre: s.nivel === 'Nacional' ? v[0].ooad : v[0].unidad_operativa, ooad: v[0].cve_ooad, prog: v.length, con: v.filter((r) => r.con).length }), key)
    .map(([k, o]) => ({ k, ...o })).sort((a, b) => b.con / b.prog - a.con / a.prog || b.prog - a.prog);
  PXIP.barras(el, T, 'Instalaciones programables con registro por ' + (s.nivel === 'Nacional' ? 'OOAD' : 'Unidad Operativa'),
    s.nivel === 'Unidad Operativa' ? null : (d) => (s.nivel === 'Nacional' ? dash.setParams({ ooad: d.k, uo: null, inst: null }) : dash.setParams({ ooad: d.ooad, uo: d.k, inst: null })));
});

dash.draw('ch-ip-servicio', (el) => {
  if (!PX.ready(el, ['ip_base', 'ip_registro'])) return;
  const rows = PXIP.base().filter((r) => r.programable === 'SI');
  if (!rows.length) { PXR.empty(el, 'Sin instalaciones programables en el ámbito seleccionado.'); return; }
  const T = d3.rollups(rows, (v) => ({ prog: v.length, con: v.filter((r) => r.con).length }), (r) => r.servicio || 'Sin servicio')
    .map(([k, o]) => ({ k, nombre: k, ...o })).sort((a, b) => b.prog - a.prog).slice(0, 15);
  PXIP.barras(el, T, 'Instalaciones programables con registro por servicio', null);
});

dash.draw('ip-tabla', (el) => PXIP.tabla(el));

dash.draw('ip-sin-tabla', (el) => {
  const L = PXIP.sinCat();
  if (!L) return;
  if (!L.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 6; td.className = 'px-note'; td.textContent = 'Todo el registro del ámbito y el área seleccionados se unió con una instalación de la base.'; tr.appendChild(td); el.appendChild(tr); return; }
  for (const r of L.slice().sort((a, b) => String(a.unidad_operativa).localeCompare(String(b.unidad_operativa)))) {
    const tr = document.createElement('tr');
    tr.dataset.key = [r.unidad, r.cve_cec, r.instalacion, r.area, r.modulo].map(encodeURIComponent).join(',');
    const c = (t, cls) => { const td = document.createElement('td'); if (cls) td.className = cls; td.textContent = t; tr.appendChild(td); };
    c(r.unidad_operativa); c(Number(r.cve_cec) ? 'CEC ' + r.cve_cec : '—'); c(r.instalacion); c(r.modulo); c(r.motivo); c(PX.fmt(r.grupos), 'px-num');
    el.appendChild(tr);
  }
});
