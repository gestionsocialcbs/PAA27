// Notas de advertencia del registro (Módulo 1): grupos con espacio no apto, actividad acuática fuera de alberca, etc.
window.PXADV = {
  N: { Alerta: '#9B2247', Revisar: '#A57F2C' },
  rows: () => {
    const d = dash.data('av_alertas');
    if (d.status !== 'ok' || !Array.isArray(d.data)) return null;
    const s = PXV.scope(), a = PX.area();
    return d.data.filter((r) => (s.nivel === 'Nacional' || (s.nivel === 'OOAD' ? String(r.cve_ooad) === String(s.clave) : r.unidad === s.clave)) && (a === 'Todas' || r.area === a));
  },
};
dash.calc('av_alertas', {
  title: 'Notas de advertencia del registro de cursos y talleres',
  description: 'Grupos del REPORTE PAA CURSOS con nota de advertencia (Alerta: espacio no apto por su nombre o actividad acuática fuera de alberca; Revisar: actividad no acuática en alberca, área de paso u oficina, o grupo sin instalación), con su OOAD, Unidad Operativa y área normativa (CECART en Capacitación y CASSAAM en Promoción de la Salud).',
  inputs: ['avance_alertas', 'unidades_operativas'],
  fn: (avance_alertas, unidades_operativas) => {
    const areaNormativa = (a) => (a === 'CECART' ? 'Capacitación y Adiestramiento Técnico' : a === 'CASSAAM' ? 'Promoción de la Salud' : a);
    const T = { no_apto: 'Espacio no apto por su nombre', acuatica_fuera: 'Actividad acuática fuera de alberca', no_acuatica_alberca: 'Actividad no acuática en alberca', paso: 'Área de paso u oficina', sin_instalacion: 'Grupo sin instalación asignada' };
    const uo = new Map(unidades_operativas.map((u) => [Math.floor(Number(u.cve_uo) / 1000) + '-' + (Number(u.cve_uo) % 1000), u]));
    return avance_alertas.map((r) => {
      const u = uo.get(r.unidad) || {};
      return { ...r, area: areaNormativa(r.area), regla_t: T[r.regla] || r.regla, cve_ooad: String(u.cve_ooad ?? ''), ooad: u.ooad || '', unidad_operativa: u.unidad_operativa || r.unidad, inscripciones: Number(r.inscripciones) || 0, mes: Number(r.mes) || 0 };
    });
  },
});
dash.draw('advk', (el) => {
  const st = dash.data('av_alertas').status;
  el.classList.toggle('dash-skeleton', st === 'loading');
  const rows = PXADV.rows();
  if (!rows) { el.textContent = '—'; return; }
  const k = el.dataset.k;
  const grupos = (rs) => new Set(rs.map((r) => r.unidad + '|' + r.grupo + '|' + r.clave_actividad)).size;
  let v;
  if (k === 'grupos') v = grupos(rows);
  else if (k === 'inscripciones') { const seen = new Map(); rows.forEach((r) => seen.set(r.unidad + '|' + r.grupo + '|' + r.clave_actividad, r.inscripciones)); v = d3.sum([...seen.values()]); }
  else v = grupos(rows.filter((r) => r.nivel === k));
  el.textContent = PX.fmt(v);
  if (k === 'Alerta' || k === 'Revisar') { const dot = document.createElement('span'); dot.className = 'px-dot'; dot.style.background = PXADV.N[k]; el.prepend(dot); }
});
dash.draw('ch-adv-regla', (el) => {
  if (!PX.ready(el, ['av_alertas'])) return;
  const rows = PXADV.rows();
  const T = d3.rollups(rows, (v) => ({ n: new Set(v.map((r) => r.unidad + '|' + r.grupo)).size, nivel: v[0].nivel }), (r) => r.regla_t).map(([k, o]) => ({ k, ...o })).sort((a, b) => (a.nivel === b.nivel ? b.n - a.n : a.nivel === 'Alerta' ? -1 : 1));
  if (!T.length) { const p = document.createElement('p'); p.className = 'px-note'; p.textContent = 'Sin notas de advertencia en el ámbito y el área seleccionados.'; el.appendChild(p); el.style.minHeight = ''; return; }
  const W = Math.max(260, el.clientWidth), step = 40, H = T.length * step;
  el.style.minHeight = H + 'px';
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Grupos por tipo de advertencia');
  const x = d3.scaleLinear([0, d3.max(T, (d) => d.n) || 1], [0, W - 70]);
  const g = svg.selectAll('g').data(T).join('g').attr('transform', (d, i) => `translate(0,${i * step})`);
  g.append('rect').attr('width', W).attr('height', step).attr('fill', 'transparent');
  g.append('text').attr('class', 'px-lbl').attr('y', 13).text((d) => d.nivel + ' · ' + d.k).each(function () { PX.fit(this, W - 4); });
  g.append('rect').attr('y', 19).attr('height', 12).attr('rx', 2).attr('width', (d) => Math.max(2, x(d.n))).attr('fill', (d) => PXADV.N[d.nivel]);
  g.append('text').attr('class', 'px-val').attr('y', 29).attr('x', (d) => Math.max(2, x(d.n)) + 6).text((d) => PX.fmt(d.n) + (d.n === 1 ? ' grupo' : ' grupos'));
  PX.hover(el, g, (d) => [d.k, ['Nota', d.nivel], ['Grupos', PX.fmt(d.n)]]);
});
dash.draw('adv-ct', (el) => {
  const s = PXV.scope();
  el.textContent = s.nivel === 'Nacional' ? 'Por OOAD' : s.nivel === 'OOAD' ? 'Por Unidad Operativa' : 'Unidad Operativa seleccionada';
});
dash.draw('ch-adv-nivel', (el) => {
  if (!PX.ready(el, ['av_alertas'])) return;
  const s = PXV.scope();
  const rows = PXADV.rows();
  const key = s.nivel === 'Nacional' ? (r) => r.cve_ooad : (r) => r.unidad;
  const name = s.nivel === 'Nacional' ? (r) => r.ooad : (r) => r.unidad_operativa;
  const T = d3.rollups(rows, (v) => ({ nombre: name(v[0]), Alerta: new Set(v.filter((r) => r.nivel === 'Alerta').map((r) => r.unidad + '|' + r.grupo)).size, Revisar: new Set(v.filter((r) => r.nivel === 'Revisar').map((r) => r.unidad + '|' + r.grupo)).size, ooad: v[0].cve_ooad }), key)
    .map(([k, o]) => ({ k, ...o, total: o.Alerta + o.Revisar })).sort((a, b) => b.Alerta - a.Alerta || b.total - a.total);
  if (!T.length) { const p = document.createElement('p'); p.className = 'px-note'; p.textContent = 'Sin notas de advertencia en el ámbito y el área seleccionados.'; el.appendChild(p); el.style.minHeight = ''; return; }
  const W = Math.max(260, el.clientWidth), step = 26, H = T.length * step;
  el.style.minHeight = H + 'px';
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Grupos con advertencia por ' + (s.nivel === 'Nacional' ? 'OOAD' : 'Unidad Operativa'));
  const probe = svg.append('text').attr('class', 'px-lbl');
  let lw = 0; T.forEach((d) => { probe.text(d.nombre); lw = Math.max(lw, probe.node().getComputedTextLength()); }); probe.remove();
  lw = Math.min(lw + 8, W * 0.42);
  const x = d3.scaleLinear([0, d3.max(T, (d) => d.total) || 1], [0, W - lw - 70]);
  const g = svg.selectAll('g').data(T).join('g').attr('transform', (d, i) => `translate(0,${i * step})`).style('cursor', s.nivel === 'Unidad Operativa' ? null : 'pointer');
  g.append('rect').attr('width', W).attr('height', step).attr('fill', 'transparent');
  g.append('text').attr('class', 'px-lbl').attr('x', lw - 6).attr('y', 16).attr('text-anchor', 'end').text((d) => d.nombre).each(function () { PX.fit(this, lw - 8); });
  g.append('rect').attr('x', lw).attr('y', 6).attr('height', 13).attr('width', (d) => x(d.Alerta)).attr('fill', PXADV.N.Alerta);
  g.append('rect').attr('x', (d) => lw + x(d.Alerta)).attr('y', 6).attr('height', 13).attr('width', (d) => x(d.Revisar)).attr('fill', PXADV.N.Revisar);
  g.append('text').attr('class', 'px-val').attr('y', 17).attr('x', (d) => lw + x(d.total) + 6).text((d) => PX.fmt(d.total));
  PX.hover(el, g, (d) => [d.nombre, ['Alertas', PX.fmt(d.Alerta)], ['Por revisar', PX.fmt(d.Revisar)]]);
  if (s.nivel !== 'Unidad Operativa') g.on('click', (ev, d) => (s.nivel === 'Nacional' ? dash.setParams({ ooad: d.k, uo: null, inst: null }) : dash.setParams({ ooad: d.ooad, uo: d.k, inst: null })));
});
dash.draw('adv-tabla', (el) => {
  const rows = PXADV.rows();
  if (!rows) return;
  const L = rows.slice().sort((a, b) => (a.nivel === b.nivel ? String(a.unidad_operativa).localeCompare(String(b.unidad_operativa)) || String(a.grupo).localeCompare(String(b.grupo)) : a.nivel === 'Alerta' ? -1 : 1)).slice(0, 300);
  if (!L.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 8; td.className = 'px-note'; td.textContent = 'Sin notas de advertencia en el ámbito y el área seleccionados.'; tr.appendChild(td); el.appendChild(tr); return; }
  for (const r of L) {
    const tr = document.createElement('tr');
    tr.dataset.key = [r.unidad, r.grupo, r.regla].map(encodeURIComponent).join(',');
    const c = (t, cls) => { const td = document.createElement('td'); if (cls) td.className = cls; td.textContent = t; tr.appendChild(td); return td; };
    const n = c('', '');
    const chip = document.createElement('span'); chip.className = 'px-adv-chip'; chip.style.setProperty('--c', PXADV.N[r.nivel]); chip.textContent = r.nivel; n.appendChild(chip);
    c(r.unidad_operativa); c(r.grupo); c(r.instalacion || '—'); c(r.actividad); c(r.mes ? PXP.MESES[r.mes - 1].slice(0, 3) : '—', 'px-num'); c(PX.fmt(r.inscripciones), 'px-num'); c(r.regla_t);
    el.appendChild(tr);
  }
});
dash.draw('adv-mas', (el) => {
  const rows = PXADV.rows();
  el.textContent = rows && rows.length > 300 ? 'Se muestran 300 de ' + PX.fmt(rows.length) + ' notas; filtra por OOAD o Unidad Operativa para ver el resto.' : '';
});
