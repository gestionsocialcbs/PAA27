// Gráficas renovadas del tablero (estilo editorial): barras cápsula, rosas mensuales, anillos, mapas de mosaicos,
// burbujas con nivel de llenado, dispersión y líneas de tiempo. Todas responden a los filtros y se actualizan con los datos.
// Este archivo se carga al final: reemplaza el dibujo de PX.hbar y de varias gráficas, sin cambiar sus datos ni sus cálculos.
window.PXZ = (() => {
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (v) => PX.fmt(Math.round(v || 0));
  const pct = (v) => (v === null || v === undefined || !isFinite(v) ? '—' : (v * 100).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%');
  const compact = (v) => (v < 10000 ? fmt(v) : new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(v));
  const PAL = ['#1E5B4F', '#9B2247', '#A57F2C', '#002F2A', '#611232', '#BC955C', '#2F8AA3', '#6F7271'];
  let uid = 0;
  const id = (p) => 'pxz' + p + (++uid);
  const mix = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
  const svgOf = (el, W, H, aria) => d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', aria || '');
  const grad = (svg, color, dir) => {
    const g = id('g');
    const lg = svg.append('defs').append('linearGradient').attr('id', g);
    if (dir === 'v') lg.attr('x1', 0).attr('y1', 1).attr('x2', 0).attr('y2', 0); else lg.attr('x1', 0).attr('y1', 0).attr('x2', 1).attr('y2', 0);
    lg.append('stop').attr('offset', '0%').attr('stop-color', color).attr('stop-opacity', 0.55);
    lg.append('stop').attr('offset', '100%').attr('stop-color', color).attr('stop-opacity', 1);
    return `url(#${g})`;
  };
  // Altura de llenado (fracción del diámetro) para que el ÁREA llena del círculo sea proporcional al avance.
  const nivel = (f) => {
    f = Math.max(0, Math.min(1, f || 0));
    if (f <= 0 || f >= 1) return f;
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) {
      const h = (lo + hi) / 2, t = 2 * h, a = Math.acos(1 - t) - (1 - t) * Math.sqrt(Math.max(0, 2 * t - t * t));
      if (a / Math.PI < f) lo = h; else hi = h;
    }
    return (lo + hi) / 2;
  };
  const empty = (el, t) => { const p = document.createElement('p'); p.className = 'px-note'; p.textContent = t || 'Sin registro en el ámbito y el área seleccionados.'; el.appendChild(p); el.style.minHeight = ''; };

  // 1 · Barras cápsula: carril tenue, barra con degradado y remate circular. Sustituye a PX.hbar (mismas opciones).
  const hbar = (el, rows, o) => {
    const anim = !el.dataset.pxDrawn && rows.length > 0 && !reduce();
    el.dataset.pxDrawn = '1';
    const W = Math.max(240, el.clientWidth), step = 40, H = Math.max(step, rows.length * step);
    el.style.minHeight = H + 'px';
    const svg = svgOf(el, W, H, o.aria);
    const probe = svg.append('text').attr('class', 'px-val').text((o.valueText ? o.valueText(rows.reduce((a, b) => (o.value(b) > o.value(a) ? b : a))) : fmt(d3.max(rows, o.value))) + '  ');
    const valW = probe.node().getComputedTextLength() + 18;
    probe.remove();
    const x = d3.scaleLinear([0, d3.max(rows, o.value) || 1], [0, Math.max(40, W - valW)]);
    const g = svg.selectAll('g.px-row').data(rows).join('g').attr('class', 'px-row').attr('transform', (d, i) => `translate(0,${i * step})`)
      .attr('opacity', (d) => (o.dim && o.dim(d) ? 0.28 : 1));
    g.append('rect').attr('width', W).attr('height', step).attr('fill', 'transparent');
    g.append('text').attr('class', 'px-lbl').attr('y', 14).text(o.label).each(function () { PX.fit(this, W - 4); });
    g.append('rect').attr('y', 22).attr('height', 8).attr('rx', 4).attr('width', Math.max(40, W - valW)).attr('fill', 'var(--cds-chart-grid)').attr('opacity', 0.55);
    const fills = new Map();
    const bar = g.append('rect').attr('y', 20).attr('height', 12).attr('rx', 6)
      .attr('fill', (d, i) => { const c = typeof o.color === 'function' ? o.color(d, i) : o.color; if (!fills.has(c)) fills.set(c, c.startsWith('var(') ? c : grad(svg, c)); return fills.get(c); })
      .attr('width', (d) => (anim ? 0 : Math.max(o.value(d) > 0 ? 12 : 0, x(o.value(d)))));
    const dot = g.append('circle').attr('cy', 26).attr('r', (d) => (o.value(d) > 0 ? 5 : 0)).attr('fill', 'var(--color-bg, #fff)')
      .attr('stroke', (d, i) => (typeof o.color === 'function' ? o.color(d, i) : o.color)).attr('stroke-width', 2.5)
      .attr('cx', (d) => (anim ? 6 : Math.max(6, x(o.value(d)) - 6)));
    const val = g.append('text').attr('class', 'px-val').attr('y', 30).attr('x', (d) => Math.max(12, x(o.value(d))) + 8).text(o.valueText || ((d) => fmt(o.value(d))));
    if (anim) {
      bar.transition().duration(750).delay((d, i) => Math.min(i * 45, 600)).ease(d3.easeCubicOut).attr('width', (d) => Math.max(o.value(d) > 0 ? 12 : 0, x(o.value(d))));
      dot.transition().duration(750).delay((d, i) => Math.min(i * 45, 600)).ease(d3.easeCubicOut).attr('cx', (d) => Math.max(6, x(o.value(d)) - 6));
      val.attr('opacity', 0).transition().duration(400).delay((d, i) => Math.min(i * 45, 600) + 500).attr('opacity', 1);
    }
    if (o.tip) PX.hover(el, g, o.tip);
    return g;
  };

  // 2 · Rosa mensual: 12 pétalos (enero arriba, sentido horario), radio proporcional a la raíz del valor, total al centro.
  const rosa = (el, rows, o) => {
    if (!d3.sum(rows, (r) => r.v)) { empty(el, o.vacio); return; }
    const anim = !el.dataset.pxDrawn && !reduce();
    el.dataset.pxDrawn = '1';
    const W = Math.max(260, el.clientWidth), H = Math.min(340, Math.max(260, W * 0.62));
    el.style.minHeight = H + 'px';
    const svg = svgOf(el, W, H, o.aria);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 24, r0 = Math.max(34, R * 0.38);
    const mx = d3.max(rows, (r) => r.v) || 1;
    const rr = d3.scaleSqrt([0, mx], [r0 + 2, R]);
    const root = svg.append('g').attr('transform', `translate(${cx},${cy})`);
    [0.5, 1].forEach((f) => root.append('circle').attr('r', rr(mx * f * f)).attr('fill', 'none').attr('stroke', 'var(--cds-chart-grid)').attr('stroke-dasharray', '2 3'));
    const arc = d3.arc().innerRadius(r0).padAngle(0.025).cornerRadius(4);
    const a = (m) => ((m - 1) / 12) * 2 * Math.PI;
    const g = root.selectAll('g.px-m').data(rows).join('g').attr('class', 'px-m');
    g.append('path').attr('d', (r) => d3.arc().innerRadius(r0).outerRadius(R + 14)({ startAngle: a(r.m), endAngle: a(r.m + 1) })).attr('fill', 'transparent');
    const p = g.append('path').attr('fill', (r) => (r.v ? o.color : 'var(--cds-chart-grid)')).attr('fill-opacity', (r) => (r.v ? 0.42 + 0.58 * r.v / mx : 1))
      .attr('d', (r) => arc.outerRadius(anim ? r0 + 1 : (r.v ? rr(r.v) : r0 + 2))({ startAngle: a(r.m), endAngle: a(r.m + 1) }));
    if (anim) p.transition().duration(800).delay((r) => r.m * 45).ease(d3.easeBackOut.overshoot(0.9))
      .attrTween('d', (r) => { const i = d3.interpolate(r0 + 1, r.v ? rr(r.v) : r0 + 2); return (t) => arc.outerRadius(i(t))({ startAngle: a(r.m), endAngle: a(r.m + 1) }); });
    g.append('text').attr('class', 'px-tick').attr('text-anchor', 'middle').attr('dy', '0.35em')
      .attr('x', (r) => Math.sin(a(r.m) + Math.PI / 12) * (R + 12)).attr('y', (r) => -Math.cos(a(r.m) + Math.PI / 12) * (R + 12)).text((r) => PXU2.MES[r.m - 1]);
    const tot = d3.sum(rows, (r) => r.v);
    root.append('text').attr('class', 'px-val').attr('text-anchor', 'middle').attr('y', -1).style('font-size', '14px').style('font-weight', 700).text(compact(tot));
    root.append('text').attr('class', 'px-tick').attr('text-anchor', 'middle').attr('y', 13).text(o.unidad || 'en el año');
    const top = rows.reduce((x, y) => (y.v > x.v ? y : x));
    const rm = (rr(top.v) + r0) / 2; // centro radial de la cuña con más registro
    root.append('text').attr('class', 'px-tick').attr('text-anchor', 'middle')
      .attr('x', Math.sin(a(top.m) + Math.PI / 12) * rm)
      .attr('y', -Math.cos(a(top.m) + Math.PI / 12) * rm).attr('dy', '0.35em').style('font-weight', 600).style('fill', 'var(--color-bg, #fff)').style('paint-order', 'stroke').style('stroke', o.color).style('stroke-width', '3px')
      .text(compact(top.v)).attr('opacity', top.v ? 1 : 0);
    PX.hover(el, g, o.tip);
  };

  // 3 · Anillos: un carril por categoría (fracción de la vuelta) y leyenda con cifras a la derecha o abajo.
  const anillos = (el, items, o) => {
    const anim = !el.dataset.pxDrawn && !reduce();
    el.dataset.pxDrawn = '1';
    const W = Math.max(260, el.clientWidth), narrow = W < 520;
    const n = items.length, S = Math.min(narrow ? W : W * 0.44, 260), track = Math.min(18, (S / 2 - 34) / n - 4);
    const legH = n * 34 + 6, H = narrow ? S + legH + 8 : Math.max(S, legH);
    el.style.minHeight = H + 'px';
    const svg = svgOf(el, W, H, o.aria);
    const root = svg.append('g').attr('transform', `translate(${narrow ? W / 2 : S / 2},${S / 2})`);
    const R = S / 2 - 4;
    const g = root.selectAll('g.px-ring').data(items).join('g').attr('class', 'px-ring');
    const rad = (i) => R - i * (track + 5);
    g.append('path').attr('d', (d, i) => d3.arc().innerRadius(rad(i) - track).outerRadius(rad(i)).startAngle(0).endAngle(2 * Math.PI)()).attr('fill', 'var(--cds-chart-grid)').attr('opacity', 0.5);
    const arcF = (i, f) => d3.arc().innerRadius(rad(i) - track).outerRadius(rad(i)).cornerRadius(track / 2).startAngle(0).endAngle(Math.max(0.0001, Math.min(1, f)) * 2 * Math.PI)();
    const p = g.append('path').attr('fill', (d) => d.color).attr('d', (d, i) => arcF(i, anim ? 0 : d.frac));
    if (anim) p.transition().duration(900).delay((d, i) => i * 90).ease(d3.easeCubicOut).attrTween('d', (d, i) => { const k = d3.interpolate(0, d.frac); return (t) => arcF(i, k(t)); });
    if (o.centro) {
      root.append('text').attr('class', 'px-val').attr('text-anchor', 'middle').attr('y', 0).style('font-size', '16px').style('font-weight', 700).text(o.centro[0]);
      root.append('text').attr('class', 'px-tick').attr('text-anchor', 'middle').attr('y', 15).text(o.centro[1]);
    }
    const lx = narrow ? 4 : S + 22, ly = narrow ? S + 14 : Math.max(4, (H - legH) / 2);
    const lg = svg.selectAll('g.px-leg').data(items).join('g').attr('class', 'px-leg').attr('transform', (d, i) => `translate(${lx},${ly + i * 34})`);
    lg.append('rect').attr('width', W - lx).attr('height', 32).attr('y', -4).attr('fill', 'transparent');
    lg.append('rect').attr('width', 10).attr('height', 10).attr('rx', 5).attr('y', 3).attr('fill', (d) => d.color);
    lg.append('text').attr('class', 'px-lbl').attr('x', 18).attr('y', 12).text((d) => d.label).each(function () { PX.fit(this, W - lx - 22); });
    lg.append('text').attr('class', 'px-val').attr('x', 18).attr('y', 26).text((d) => d.valueText);
    PX.hover(el, g, o.tip);
    PX.hover(el, lg, o.tip);
  };

  // 4 · Mosaico (treemap) para muchas categorías: área proporcional, tonos del verde institucional.
  const mosaico = (el, rows, o) => {
    const anim = !el.dataset.pxDrawn && !reduce();
    el.dataset.pxDrawn = '1';
    const W = Math.max(260, el.clientWidth), H = Math.max(240, Math.min(360, W * 0.62));
    el.style.minHeight = H + 'px';
    const svg = svgOf(el, W, H, o.aria);
    const root = d3.hierarchy({ children: rows }).sum((d) => Math.max(0, o.value(d) || 0));
    d3.treemap().size([W, H]).paddingInner(3).round(true)(root);
    const shades = d3.scaleLinear([0, Math.max(1, rows.length - 1)], [0, 1]);
    const tone = (i) => d3.interpolateRgb(o.color || '#1E5B4F', '#C9D8D3')(shades(i) * 0.75);
    const leaves = root.leaves();
    const g = svg.selectAll('g.px-tile').data(leaves).join('g').attr('class', 'px-tile').attr('transform', (d) => `translate(${d.x0},${d.y0})`);
    const r = g.append('rect').attr('rx', 4).attr('width', (d) => d.x1 - d.x0).attr('height', (d) => d.y1 - d.y0).attr('fill', (d, i) => tone(i));
    if (anim) r.attr('opacity', 0).transition().duration(500).delay((d, i) => i * 40).attr('opacity', 1);
    g.each(function (d, i) {
      const w = d.x1 - d.x0, h = d.y1 - d.y0;
      if (w < 54 || h < 30) return;
      const light = shades(i) * 0.75 > 0.45;
      const t = d3.select(this).append('text').attr('x', 8).attr('y', 18).style('font-size', '12px').style('font-weight', 600).style('fill', light ? '#002F2A' : '#fff');
      t.text(o.label(d.data));
      PX.fit(t.node(), w - 14);
      if (h > 44) d3.select(this).append('text').attr('x', 8).attr('y', 34).style('font-size', '11.5px').style('fill', light ? '#002F2A' : 'rgba(255,255,255,.88)').text(o.valueText(d.data)).each(function () { PX.fit(this, w - 14); });
    });
    PX.hover(el, g, (d) => o.tip(d.data));
  };

  // Reparto de una dimensión: anillos si hay pocas categorías, mosaico si hay muchas.
  const reparto = (el, rows, o) => {
    if (!rows.length) { empty(el, o.vacio); return; }
    const tot = d3.sum(rows, o.value) || 1;
    if (rows.length <= 6 && !o.barras) {
      anillos(el, rows.map((d, i) => ({ d, label: o.label(d), frac: (o.value(d) || 0) / tot, color: PAL[i % PAL.length], valueText: o.valueText(d) })),
        { aria: o.aria, tip: (it) => o.tip(it.d), centro: [compact(tot), o.unidad || 'en total'] });
    } else {
      // Muchas categorías (o bloques): ranking de barras cápsula, de mayor a menor, con cifra y porcentaje.
      // Más de 12 categorías: las 11 mayores y el resto sumado en «Otros».
      let R = rows;
      if (rows.length > 12) {
        const resto = rows.slice(11), v = d3.sum(resto, o.value);
        R = rows.slice(0, 11).concat([{ _otros: true, n: resto.length, v, p: v / tot }]);
      }
      const lab = (d) => (d._otros ? 'Otros ' + d.n + (o.otros ? ' ' + o.otros : '') : o.label(d));
      hbar(el, R, { aria: o.aria, label: lab, value: (d) => (d._otros ? d.v : o.value(d)),
        valueText: (d) => (d._otros ? fmt(d.v) + ' · ' + pct(d.p) : o.valueText(d)), color: (d) => (d._otros ? '#98989A' : o.color || '#1E5B4F'),
        tip: (d) => (d._otros ? ['Otros ' + d.n, ['Suma', fmt(d.v)], ['Participación', pct(d.p)]] : o.tip(d)) });
    }
  };

  // 5 · Burbujas con nivel de llenado: tamaño = valor, llenado = avance contra la meta (si lo hay), color = semáforo.
  const burbujas = (el, rows, o) => {
    if (!rows.length) { empty(el, o.vacio); return; }
    const anim = !el.dataset.pxDrawn && !reduce();
    el.dataset.pxDrawn = '1';
    const W = Math.max(260, el.clientWidth), H = Math.round(Math.max(300, Math.min(560, W * (rows.length > 20 ? 0.66 : 0.52))));
    el.style.minHeight = H + 'px';
    const svg = svgOf(el, W, H, o.aria);
    const root = d3.hierarchy({ children: rows }).sum((d) => Math.max(1e-6, o.size(d)));
    d3.pack().size([W, H]).padding(4)(root);
    const defs = svg.append('defs');
    const nodes = root.leaves();
    const g = svg.selectAll('g.px-bub').data(nodes).join('g').attr('class', 'px-bub').attr('transform', (d) => `translate(${d.x},${d.y})`).style('cursor', o.click ? 'pointer' : null);
    g.each(function (d) {
      const s = d3.select(this);
      const c = o.color(d.data);
      const cid = id('c');
      defs.append('clipPath').attr('id', cid).append('circle').attr('r', d.r);
      s.append('circle').attr('r', d.r).attr('fill', mix(c, 14)).attr('stroke', mix(c, 55)).attr('stroke-width', 1.2);
      const f = o.fill ? nivel(o.fill(d.data) ?? 0) : 1;
      const lvl = s.append('rect').attr('clip-path', `url(#${cid})`).attr('x', -d.r).attr('width', d.r * 2).attr('fill', c).attr('opacity', o.fill ? 0.9 : 0.85)
        .attr('y', anim ? d.r : d.r - 2 * d.r * f).attr('height', anim ? 0 : 2 * d.r * f);
      if (anim) lvl.transition().duration(1100).delay(Math.random() * 350).ease(d3.easeCubicOut).attr('y', d.r - 2 * d.r * f).attr('height', 2 * d.r * f);
      if (d.r > 24) {
        const dark = f > 0.55;
        const t1 = s.append('text').attr('text-anchor', 'middle').attr('y', d.r > 38 ? -3 : 4).style('font-size', Math.min(13, Math.max(10, d.r / 4)) + 'px').style('font-weight', 600)
          .style('fill', dark ? '#fff' : 'var(--color-fg, #1d1d1b)').text(o.label(d.data));
        PX.fit(t1.node(), d.r * 1.7);
        if (d.r > 38) s.append('text').attr('text-anchor', 'middle').attr('y', 13).style('font-size', '11px').style('fill', dark ? 'rgba(255,255,255,.9)' : 'var(--color-fg-muted, #6f7271)').text(o.sub(d.data));
      }
    });
    if (o.click) g.on('click', (ev, d) => o.click(d.data));
    PX.hover(el, g, (d) => o.tip(d.data));
  };

  // 5b · Mapa de burbujas de México (cartograma de Dorling, sin silueta): cada OOAD cerca de su lugar geográfico, tamaño = valor,
  // llenado = avance; las burbujas se separan con una simulación de fuerzas para que no se encimen.
  const GEO = { 1: [-102.3, 21.9], 2: [-115.3, 30.6], 3: [-111.7, 25.4], 4: [-90.4, 18.8], 5: [-102.0, 27.3], 6: [-103.9, 19.1], 7: [-92.6, 16.5], 8: [-106.1, 28.8], 10: [-104.8, 24.6],
    11: [-101.0, 20.9], 12: [-99.9, 17.6], 13: [-98.8, 20.5], 14: [-103.6, 20.6], 15: [-98.7, 19.4], 16: [-99.9, 19.4], 17: [-101.9, 19.2], 18: [-99.1, 18.75], 19: [-104.8, 21.8], 20: [-99.9, 25.6],
    21: [-96.6, 17.0], 22: [-97.9, 19.0], 23: [-99.9, 20.9], 24: [-88.3, 19.6], 25: [-100.4, 22.6], 26: [-107.5, 25.0], 27: [-110.7, 29.6], 28: [-92.8, 18.0], 29: [-98.6, 24.3], 30: [-98.2, 19.45],
    31: [-97.5, 20.6], 32: [-95.5, 18.3], 33: [-89.0, 20.8], 34: [-102.6, 23.3], 39: [-99.15, 19.52], 40: [-99.15, 19.25] };
  const CORTO = { 'Norte del Distrito Federal': 'CDMX Norte', 'Sur del Distrito Federal': 'CDMX Sur', 'Estado de México Oriente': 'Edomex Oriente', 'Estado de México Poniente': 'Edomex Poniente',
    'Baja California Sur': 'BCS', 'Baja California': 'Baja California', 'San Luis Potosí': 'SLP', 'Quintana Roo': 'Quintana Roo', 'Veracruz Norte': 'Veracruz N.', 'Veracruz Sur': 'Veracruz S.' };
  const mapa = (el, rows, o) => {
    if (!rows.length) { empty(el, o.vacio); return; }
    const anim = !el.dataset.pxDrawn && !reduce();
    el.dataset.pxDrawn = '1';
    const W = Math.max(280, el.clientWidth), H0 = Math.round(W * 0.64);
    const k = Math.cos((23 * Math.PI) / 180), pad = W * 0.04;
    const lon = [-117.3, -86.6], lat = [14.4, 32.8];
    const sx = (W - 2 * pad) / ((lon[1] - lon[0]) * k), sy = (H0 - 2 * pad) / (lat[1] - lat[0]), sc = Math.min(sx, sy);
    const ox = (W - (lon[1] - lon[0]) * k * sc) / 2, oy = (H0 - (lat[1] - lat[0]) * sc) / 2;
    const proj = ([a, b]) => [ox + (a - lon[0]) * k * sc, oy + (lat[1] - b) * sc];
    const rmax = Math.max(16, W * 0.066);
    const rs = d3.scaleSqrt([0, d3.max(rows, o.size) || 1], [Math.max(6, W * 0.012), rmax]);
    const nodes = rows.map((d) => { const g = GEO[Number(o.cve(d))] || [-102, 23]; const [x, y] = proj(g); return { d, x, y, tx: x, ty: y, r: rs(o.size(d)) }; });
    const sim = d3.forceSimulation(nodes).force('x', d3.forceX((n) => n.tx).strength(0.12)).force('y', d3.forceY((n) => n.ty).strength(0.12))
      .force('g', d3.forceX(W / 2).strength(0.015)).force('c', d3.forceCollide((n) => n.r + 0.6).strength(1).iterations(4)).stop();
    for (let i = 0; i < 400; i++) sim.tick();
    // Encuadre: el conjunto de burbujas se escala para ocupar todo el ancho, sin recortar ni encimar.
    const bx0 = d3.min(nodes, (n) => n.x - n.r), bx1 = d3.max(nodes, (n) => n.x + n.r), by0 = d3.min(nodes, (n) => n.y - n.r), by1 = d3.max(nodes, (n) => n.y + n.r);
    const f = Math.min((W - 4) / (bx1 - bx0), (H0 * 1.15) / (by1 - by0), 1.4), H = Math.ceil((by1 - by0) * f + 4), dx = (W - (bx1 - bx0) * f) / 2;
    for (const n of nodes) { n.x = (n.x - bx0) * f + dx; n.y = (n.y - by0) * f + 2; n.r *= f; }
    el.style.minHeight = H + 'px';
    const svg = svgOf(el, W, H, o.aria);
    const defs = svg.append('defs');
    const g = svg.selectAll('g.px-bub').data(nodes).join('g').attr('class', 'px-bub').attr('transform', (n) => `translate(${n.x},${n.y})`).style('cursor', o.click ? 'pointer' : null);
    g.each(function (n) {
      const s = d3.select(this), c = o.color(n.d), cid = id('m');
      defs.append('clipPath').attr('id', cid).append('circle').attr('r', n.r);
      s.append('circle').attr('r', n.r).attr('fill', 'var(--color-bg, #fff)');
      s.append('circle').attr('r', n.r).attr('fill', mix(c, 16)).attr('stroke', mix(c, 70)).attr('stroke-width', 1.3);
      const f = o.fill ? nivel(o.fill(n.d) ?? 0) : 1;
      const lvl = s.append('rect').attr('clip-path', `url(#${cid})`).attr('x', -n.r).attr('width', n.r * 2).attr('fill', c).attr('opacity', 0.9)
        .attr('y', anim ? n.r : n.r - 2 * n.r * f).attr('height', anim ? 0 : 2 * n.r * f);
      if (anim) lvl.transition().duration(1100).delay(300 + Math.random() * 400).ease(d3.easeCubicOut).attr('y', n.r - 2 * n.r * f).attr('height', 2 * n.r * f);
      const nom = CORTO[o.label(n.d)] || o.label(n.d);
      if (n.r >= 15) {
        const dark = f > 0.55;
        const fs = Math.min(12, Math.max(8.5, n.r / 3.3));
        const t = s.append('text').attr('text-anchor', 'middle').attr('y', n.r >= 26 ? -2 : fs / 3).style('font-size', fs + 'px').style('font-weight', 600).style('fill', dark ? '#fff' : 'var(--color-fg, #1d1d1b)').text(nom);
        PX.fit(t.node(), n.r * 1.85);
        if (n.r >= 26) s.append('text').attr('text-anchor', 'middle').attr('y', fs + 2).style('font-size', Math.max(8.5, fs - 1.5) + 'px').style('fill', dark ? 'rgba(255,255,255,.9)' : 'var(--color-fg-muted, #6f7271)').text(o.sub(n.d));
      }
    });
    if (anim) g.attr('opacity', 0).transition().duration(500).delay((n, i) => i * 18).attr('opacity', 1);
    if (o.click) g.on('click', (ev, n) => o.click(n.d));
    PX.hover(el, g, (n) => o.tip(n.d));
  };


  // 5c · Rejilla de México: cada OOAD ocupa una celda de un panal acomodado como el país (todas las celdas del mismo tamaño);
  // dentro, una burbuja del tamaño de su meta que se llena con el avance y toma el color del semáforo.
  const REJ = { 2: [0, 0, 'BC'], 27: [1, 0, 'SON'], 8: [2, 0, 'CHIH'], 5: [3, 0, 'COAH'], 20: [4, 0, 'NL'],
    3: [0.5, 1, 'BCS'], 26: [1.5, 1, 'SIN'], 10: [2.5, 1, 'DGO'], 34: [3.5, 1, 'ZAC'], 29: [4.5, 1, 'TAMS'],
    19: [2, 2, 'NAY'], 1: [3, 2, 'AGS'], 25: [4, 2, 'SLP'],
    14: [2.5, 3, 'JAL'], 11: [3.5, 3, 'GTO'], 23: [4.5, 3, 'QRO'], 13: [5.5, 3, 'HGO'], 31: [6.5, 3, 'VER N'],
    6: [2, 4, 'COL'], 17: [3, 4, 'MICH'], 16: [4, 4, 'MEX P'], 39: [5, 4, 'CDMX N'], 15: [6, 4, 'MEX O'], 30: [7, 4, 'TLAX'],
    12: [3.5, 5, 'GRO'], 40: [4.5, 5, 'CDMX S'], 18: [5.5, 5, 'MOR'], 22: [6.5, 5, 'PUE'], 32: [7.5, 5, 'VER S'], 28: [8.5, 5, 'TAB'], 4: [9.5, 5, 'CAM'], 33: [10.5, 5, 'YUC'],
    21: [6, 6, 'OAX'], 7: [8, 6, 'CHIS'], 24: [10, 6, 'QROO'] };
  const rejilla = (el, rows, o) => {
    if (!rows.length) { empty(el, o.vacio); return; }
    const anim = !el.dataset.pxDrawn && !reduce();
    el.dataset.pxDrawn = '1';
    const W = Math.max(280, el.clientWidth), cols = 11.6, cs = Math.min(W / cols, 96), dy = cs * 0.9;
    const H = Math.ceil(dy * 6 + cs + 6), x0 = (W - cs * cols) / 2 + cs * 0.55, y0 = cs * 0.5 + 3;
    el.style.minHeight = H + 'px';
    const svg = svgOf(el, W, H, o.aria);
    const R = cs * 0.47;
    const rs = o.size ? d3.scaleSqrt([0, d3.max(rows, o.size) || 1], [R * 0.34, R * 0.92]) : null;
    const by = new Map(rows.map((d) => [Number(o.cve(d)), d]));
    const celdas = Object.entries(REJ).map(([k, [c, r, cod]]) => ({ k: Number(k), cod, x: x0 + c * cs, y: y0 + r * dy, d: by.get(Number(k)) || null }));
    const defs = svg.append('defs');
    const g = svg.selectAll('g.px-cel').data(celdas).join('g').attr('class', 'px-cel').attr('transform', (n) => `translate(${n.x},${n.y})`)
      .style('cursor', (n) => (o.click && n.d ? 'pointer' : null));
    g.append('circle').attr('r', R).attr('fill', 'none').attr('stroke', 'var(--cds-chart-grid)').attr('stroke-width', 1.2);
    g.each(function (n, i) {
      const s = d3.select(this);
      if (!n.d) return;
      const c = o.color(n.d), r = o.size ? rs(o.size(n.d)) : R * 0.86, cid = id('r');
      defs.append('clipPath').attr('id', cid).append('circle').attr('r', r);
      const f = o.fill ? nivel(o.fill(n.d) ?? 0) : 1;
      const b = s.append('g');
      b.append('circle').attr('r', r).attr('fill', mix(c, 18)).attr('stroke', c).attr('stroke-width', 1.4);
      const lvl = b.append('rect').attr('clip-path', `url(#${cid})`).attr('x', -r).attr('width', 2 * r).attr('fill', c)
        .attr('y', anim ? r : r - 2 * r * f).attr('height', anim ? 0 : 2 * r * f);
      if (anim) {
        b.attr('transform', 'scale(0)').transition().duration(600).delay(i * 22).ease(d3.easeBackOut).attr('transform', 'scale(1)');
        lvl.transition().duration(1000).delay(500 + i * 22).ease(d3.easeCubicOut).attr('y', r - 2 * r * f).attr('height', 2 * r * f);
      }
    });
    const fs = Math.max(7, Math.min(12, cs / 6.2));
    const C3 = { 'CDMX N': 'CDN', 'CDMX S': 'CDS', 'MEX P': 'MXP', 'MEX O': 'MXO', 'VER N': 'VRN', 'VER S': 'VRS', TAMS: 'TAM', CHIH: 'CHI', COAH: 'COA', MICH: 'MIC', TLAX: 'TLX', QROO: 'QRR', CHIS: 'CHS' };
    const cod = (n) => (cs < 48 ? C3[n.cod] || n.cod : n.cod);
    const solido = !o.size && !o.fill;
    const tx = (n) => (solido && n.d ? '#fff' : n.d ? 'var(--color-fg, #1d1d1b)' : 'var(--color-fg-muted, #6f7271)');
    const halo = (sel) => (solido ? sel : sel.style('paint-order', 'stroke').style('stroke', 'var(--color-bg, #fff)').style('stroke-width', '3px'));
    halo(g.append('text').attr('text-anchor', 'middle').attr('y', (n) => (n.d && cs > 52 ? -fs * 0.15 : fs * 0.35)).style('font-size', fs + 'px').style('font-weight', 700).style('letter-spacing', '.02em')
      .style('fill', tx)).text(cod);
    if (cs > 52) halo(g.filter((n) => n.d).append('text').attr('text-anchor', 'middle').attr('y', fs * 1.05).style('font-size', fs * 0.9 + 'px')
      .style('fill', tx)).text((n) => o.sub(n.d));
    if (o.click) g.filter((n) => n.d).on('click', (ev, n) => o.click(n.d));
    PX.hover(el, g.filter((n) => n.d), (n) => o.tip(n.d));
  };

  // 6 · Dispersión: inscripciones (x) contra asistencias (y), burbuja = meta, color = semáforo.
  const dispersion = (el, rows, o) => {
    if (!rows.length) { empty(el, o.vacio); return; }
    const anim = !el.dataset.pxDrawn && !reduce();
    el.dataset.pxDrawn = '1';
    const W = Math.max(280, el.clientWidth), H = Math.max(300, Math.min(440, W * 0.55)), mg = { l: 0, r: 16, t: 14, b: 34 };
    el.style.minHeight = H + 'px';
    const svg = svgOf(el, W, H, o.aria);
    const xm = d3.max(rows, o.x) || 1, ym = d3.max(rows, o.y) || 1;
    const y = d3.scaleLinear([0, ym * 1.08], [H - mg.b, mg.t]).nice();
    const probe = svg.append('text').attr('class', 'px-tick');
    mg.l = d3.max(y.ticks(4), (t) => probe.text(compact(t)).node().getComputedTextLength()) + 10;
    probe.remove();
    const x = d3.scaleLinear([0, xm * 1.08], [mg.l, W - mg.r]).nice();
    const r = d3.scaleSqrt([0, d3.max(rows, o.r) || 1], [4, Math.min(30, W / 22)]);
    svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', mg.l).attr('x2', W - mg.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('class', 'px-tick').attr('x', mg.l - 6).attr('y', (t) => y(t) + 4).attr('text-anchor', 'end').text(compact);
    svg.append('g').selectAll('text').data(x.ticks(5)).join('text').attr('class', 'px-tick').attr('x', x).attr('y', H - mg.b + 16).attr('text-anchor', 'middle').text(compact);
    svg.append('text').attr('class', 'px-tick').attr('x', W - mg.r).attr('y', H - 4).attr('text-anchor', 'end').text(o.xt + ' →');
    svg.append('text').attr('class', 'px-tick').attr('x', mg.l + 4).attr('y', mg.t + 2).text('↑ ' + o.yt);
    const ord = [...rows].sort((a, b) => o.r(b) - o.r(a));
    const g = svg.selectAll('g.px-pt').data(ord).join('g').attr('class', 'px-pt').style('cursor', o.click ? 'pointer' : null);
    const c = g.append('circle').attr('cx', (d) => x(o.x(d))).attr('cy', (d) => y(o.y(d))).attr('fill', (d) => mix(o.color(d), 70)).attr('stroke', (d) => o.color(d)).attr('stroke-width', 1.4)
      .attr('r', (d) => (anim ? 0 : r(o.r(d))));
    if (anim) c.transition().duration(700).delay((d, i) => i * 25).ease(d3.easeBackOut).attr('r', (d) => r(o.r(d)));
    const lab = [...rows].sort((a, b) => o.y(b) + o.x(b) * (ym / xm) - (o.y(a) + o.x(a) * (ym / xm))).slice(0, 6);
    const puestos = [];
    svg.append('g').selectAll('text').data(lab).join('text').attr('class', 'px-tick').style('font-weight', 600)
      .attr('x', (d) => x(o.x(d)) + r(o.r(d)) + 4).attr('y', (d) => y(o.y(d)) + 4).text(o.label)
      .each(function (d) {
        PX.fit(this, 140);
        const b = this.getBBox();
        if (b.x + b.width > W - 2) { this.setAttribute('text-anchor', 'end'); this.setAttribute('x', x(o.x(d)) - r(o.r(d)) - 4); }
        const c = this.getBBox();
        if (puestos.some((p) => c.x < p.x + p.width + 4 && c.x + c.width + 4 > p.x && c.y < p.y + p.height && c.y + c.height > p.y)) { this.remove(); return; }
        puestos.push(c);
      });
    if (o.click) g.on('click', (ev, d) => o.click(d));
    PX.hover(el, g, o.tip);
  };

  // 7 · Línea de tiempo por fecha de corte: área con degradado, puntos y la última cifra destacada.
  const linea = (el, rows, o) => {
    if (!rows.length) { empty(el, o.vacio); return; }
    const anim = !el.dataset.pxDrawn && !reduce();
    el.dataset.pxDrawn = '1';
    const W = Math.max(260, el.clientWidth), dos = W < 520, H = dos ? 244 : 230, mg = { t: dos ? 60 : 46, b: 26, r: 18 };
    el.style.minHeight = H + 'px';
    const svg = svgOf(el, W, H, o.aria);
    const vals = rows.map(o.value);
    const y = d3.scaleLinear([0, (d3.max(vals) || 1) * 1.12], [H - mg.b, mg.t]).nice();
    const probe = svg.append('text').attr('class', 'px-tick');
    const left = d3.max(y.ticks(3), (t) => probe.text(compact(t)).node().getComputedTextLength()) + 10;
    probe.remove();
    const pf = (iso) => new Date(iso + 'T12:00:00');
    const t0 = pf(rows[0].fecha_corte), t1 = pf(rows[rows.length - 1].fecha_corte);
    const x = rows.length > 1 ? d3.scaleTime([t0, t1], [left + 8, W - mg.r]) : () => (left + W - mg.r) / 2;
    svg.append('g').selectAll('line').data(y.ticks(3)).join('line').attr('x1', left).attr('x2', W - mg.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(y.ticks(3)).join('text').attr('class', 'px-tick').attr('x', left - 6).attr('y', (t) => y(t) + 4).attr('text-anchor', 'end').text(compact);
    const fx = (r) => x(pf(r.fecha_corte));
    const last = rows[rows.length - 1];
    svg.append('text').attr('class', 'px-val').attr('x', left).attr('y', 20).style('font-size', '20px').style('font-weight', 700).style('fill', o.color).text(fmt(o.value(last)));
    const sub1 = o.unidad + ' al ' + PXV.fecha(last.fecha_corte);
    const sub2 = rows.length > 1 ? (o.value(last) - o.value(rows[rows.length - 2]) >= 0 ? '+' : '') + fmt(o.value(last) - o.value(rows[rows.length - 2])) + ' desde el corte anterior' : '';
    if (dos) {
      const fl = pf(last.fecha_corte);
      svg.append('text').attr('class', 'px-tick').attr('x', left).attr('y', 36).text(o.unidad + ' al ' + fl.getDate() + ' ' + PXP.MESES[fl.getMonth()].slice(0, 3) + ' ' + fl.getFullYear()).each(function () { PX.fit(this, W - left - mg.r); });
      if (sub2) svg.append('text').attr('class', 'px-tick').attr('x', left).attr('y', 50).text(sub2);
    } else svg.append('text').attr('class', 'px-tick').attr('x', left).attr('y', 36).text(sub1 + (sub2 ? ' · ' + sub2 : ''));
    if (rows.length > 1) {
      const fill = grad(svg, o.color, 'v');
      const area = d3.area().x(fx).y0(y(0)).y1((r) => y(o.value(r))).curve(d3.curveMonotoneX);
      const line = d3.line().x(fx).y((r) => y(o.value(r))).curve(d3.curveMonotoneX);
      svg.append('path').attr('d', area(rows)).attr('fill', fill).attr('opacity', 0.28);
      const ln = svg.append('path').attr('d', line(rows)).attr('fill', 'none').attr('stroke', o.color).attr('stroke-width', 2.5);
      if (anim) { const L = ln.node().getTotalLength(); ln.attr('stroke-dasharray', L).attr('stroke-dashoffset', L).transition().duration(1100).ease(d3.easeCubicOut).attr('stroke-dashoffset', 0); }
      const ticks0 = rows.length <= 8 ? rows.map((r) => pf(r.fecha_corte)) : x.ticks(6);
      // Sin etiquetas encimadas: se conserva la última fecha y se omiten las que quedan a menos de 44 px.
      const ticks = [];
      for (let i = ticks0.length - 1; i >= 0; i--) if (!ticks.length || x(ticks[0]) - x(ticks0[i]) >= 44) ticks.unshift(ticks0[i]);
      svg.append('g').selectAll('text').data(ticks).join('text').attr('class', 'px-tick').attr('x', x).attr('y', H - 8).attr('text-anchor', 'middle').text((d) => d.getDate() + ' ' + PXP.MESES[d.getMonth()].slice(0, 3));
    } else {
      svg.append('line').attr('x1', left).attr('x2', W - mg.r).attr('y1', y(o.value(last))).attr('y2', y(o.value(last))).attr('stroke', o.color).attr('stroke-dasharray', '3 4').attr('opacity', 0.5);
      svg.append('text').attr('class', 'px-tick').attr('x', fx(last)).attr('y', H - 8).attr('text-anchor', 'middle').text(PXV.fecha(last.fecha_corte));
    }
    const g = svg.selectAll('g.px-c').data(rows).join('g').attr('class', 'px-c');
    g.append('circle').attr('cx', fx).attr('cy', (r) => y(o.value(r))).attr('r', 12).attr('fill', 'transparent');
    g.append('circle').attr('cx', fx).attr('cy', (r) => y(o.value(r))).attr('r', (r) => (r === last ? 6 : 3.5)).attr('fill', (r) => (r === last ? o.color : 'var(--color-bg, #fff)')).attr('stroke', o.color).attr('stroke-width', 2);
    if (!reduce()) g.filter((r) => r === last).append('circle').attr('class', 'px-pulse').attr('cx', fx).attr('cy', (r) => y(o.value(r))).attr('r', 6).attr('fill', 'none').attr('stroke', o.color);
    PX.hover(el, g, o.tip);
  };

  return { hbar, rosa, anillos, mosaico, reparto, burbujas, mapa, rejilla, dispersion, linea, pct, fmt, compact, PAL, empty };
})();

// Todas las gráficas de barras horizontales pasan al estilo cápsula.
PX.hbar = PXZ.hbar;

// ── Módulo 1 ──────────────────────────────────────────────────────────────
const pxMesFila = (by, k) => d3.range(1, 13).map((m) => ({ m, r: by.get(m) || null, v: by.get(m) ? by.get(m)[k] || 0 : 0 }));
const pxMesN = (m) => PXP.MESES[m - 1].replace(/^./, (c) => c.toUpperCase());

dash.draw('ch-seg-mes', (el) => {
  if (!PX.ready(el, ['av_dim'])) return;
  const k = el.dataset.k;
  const s = PXV.scope(), a = PX.area();
  const by = new Map(dash.data('av_dim').data.filter((r) => r.nivel === s.nivel && r.clave === s.clave && r.area === a && r.dimension === 'Mes de inicio').map((r) => [Number(r.valor), r]));
  PXZ.rosa(el, pxMesFila(by, k), {
    aria: (k === 'inscripciones' ? 'Inscripciones' : 'Asistencias') + ' registradas por mes de inicio', color: k === 'inscripciones' ? '#1E5B4F' : '#9B2247', unidad: 'en el año',
    vacio: 'Sin grupos registrados en el ámbito y el área seleccionados.',
    tip: (r) => [pxMesN(r.m), ['Inscripciones registradas', PX.fmt(r.r ? Math.round(r.r.inscripciones) : 0)], ['Asistencias registradas', PX.fmt(r.r ? Math.round(r.r.asistencias) : 0)], ['Grupos', PX.fmt(r.r ? r.r.grupos : 0)]],
  });
});

const pxRep = (src, dim, m, rows) => {
  const pf = m === 'asistencias' ? 'participacion_asistencias' : 'participacion';
  return rows.map((d) => ({ ...d, _p: d[pf] !== undefined ? d[pf] : d.participacion }));
};

dash.draw('avd', (el) => {
  const src = el.dataset.calc || 'av_dim';
  if (!PX.ready(el, [src])) return;
  const dim = el.dataset.dim, s = PXV.scope(), a = PX.area(), m = PXMED.m();
  const rows = pxRep(src, dim, m, dash.data(src).data.filter((r) => r.nivel === s.nivel && r.clave === s.clave && r.area === a && r.dimension === dim)).sort((x, y) => y[m] - x[m]);
  PXZ.reparto(el, rows, {
    barras: dim === 'Bloque', otros: 'bloques',
    aria: PXMED.t() + ' registradas por ' + dim.toLowerCase(), unidad: m + ' registradas', vacio: 'Sin grupos registrados en el ámbito seleccionado.',
    label: (d) => d.valor, value: (d) => d[m], valueText: (d) => PX.fmt(Math.round(d[m])) + (d._p === null || d._p === undefined ? '' : ' · ' + PXZ.pct(d._p)),
    tip: (d) => [d.valor, ['Grupos registrados', PX.fmt(d.grupos)], ['Inscripciones registradas', PX.fmt(Math.round(d.inscripciones))], ['Asistencias registradas', PX.fmt(Math.round(d.asistencias))], ['Participación en las ' + PXMED.t().toLowerCase(), PXZ.pct(d._p)]],
  });
});

// Meta por OOAD o por Unidad Operativa: burbujas del tamaño de la meta, llenas según el avance y del color del semáforo.
dash.draw('ch-metas-ooad', (el) => {
  if (!PX.ready(el, ['av_nivel', 'metas_nivel', 'unidades_operativas'])) return;
  const a = PX.area(), l = PXM.lista(), m = PXMED.m();
  const ins = m !== 'asistencias';
  const rows = dash.data('av_nivel').data.filter((r) => r.nivel === l.nivel && r.padre === l.padre && r.area === a && (ins ? r.meta_2027 : r.asistencias > 0));
  // Dentro de una OOAD se agregan, en gris, las Unidades Operativas del catálogo que no tienen registro.
  if (l.nivel === 'Unidad Operativa' && dash.data('unidades_operativas').status === 'ok') {
    const ya = new Set(rows.map((r) => r.clave));
    const mn = dash.data('metas_nivel').status === 'ok' ? dash.data('metas_nivel').data : [];
    for (const u of dash.data('unidades_operativas').data) {
      const clave = Math.floor(u.cve_uo / 1000) + '-' + (u.cve_uo % 1000);
      if (String(u.cve_ooad) !== String(l.padre) || ya.has(clave)) continue;
      const mm = mn.filter((x) => x.nivel === 'Unidad Operativa' && x.clave === clave && (a === 'Todas' || x.area === a));
      const meta = d3.sum(mm, (x) => x.meta_2027 || 0);
      rows.push({ nivel: 'Unidad Operativa', clave, padre: String(l.padre), nombre: u.unidad_operativa, tipo: u.tipo_uo, area: a, grupos: 0, inscripciones: 0, asistencias: 0, meta_2027: meta, avance: meta ? 0 : null, semaforo: null, sinRegistro: true });
    }
  }
  const tot = d3.sum(rows, (r) => r.asistencias);
  // A nivel nacional, las OOAD se acomodan en un panal con la forma de México; dentro de una OOAD, burbujas agrupadas.
  (l.nivel === 'OOAD' ? PXZ.rejilla : PXZ.burbujas)(el, rows, {
    cve: (r) => r.clave,
    aria: (ins ? 'Avance contra la meta de inscripciones 2027' : 'Asistencias registradas') + ' por ' + (l.nivel === 'OOAD' ? 'OOAD' : 'Unidad Operativa'),
    size: l.nivel === 'OOAD' ? null : () => 1, fill: ins ? (r) => Math.min(1, r.avance || 0) : null,
    color: (r) => (r.sinRegistro ? '#98989A' : ins ? (r.inscripciones > 0 ? PXS.color(r.semaforo) : '#98989A') : d3.interpolateRgb('#D9B5C0', '#9B2247')(Math.sqrt(r.asistencias / (d3.max(rows, (x) => x.asistencias) || 1)))),
    label: (r) => r.nombre, sub: (r) => (r.sinRegistro ? 'Sin registro' : ins ? PXZ.pct(r.avance) : PXZ.compact(r.asistencias)),
    click: (r) => dash.setParams(r.nivel === 'OOAD' ? { ooad: r.clave, uo: null } : { ooad: r.padre, uo: r.clave }),
    tip: (r) => (r.sinRegistro
      ? [r.nombre, ['Tipo de unidad', r.tipo || '—'], ['Meta de inscripciones 2027', r.meta_2027 ? PX.fmt(Math.round(r.meta_2027)) : 'Sin meta'], ['Registro en el PAA 2027', 'Sin registro de información']]
      : ins
      ? [r.nombre, ['Meta de inscripciones 2027', PX.fmt(Math.round(r.meta_2027))], ['Inscripciones registradas', PX.fmt(Math.round(r.inscripciones))], ['Avance', PXZ.pct(r.avance)], ['Semáforo', r.semaforo || 'Sin registro']]
      : [r.nombre, ['Asistencias registradas', PX.fmt(Math.round(r.asistencias))], ['Participación en las asistencias', tot ? PXZ.pct(r.asistencias / tot) : '—'], ['Inscripciones registradas', PX.fmt(Math.round(r.inscripciones))], ['Grupos registrados', PX.fmt(r.grupos)]]),
  });
});

// Meta por área normativa: un anillo por área que se llena con el avance contra su meta.
dash.draw('ch-metas-area', (el) => {
  if (!PX.ready(el, ['av_nivel'])) return;
  const s = PXM.scope(), sel = PX.area(), m = PXMED.m();
  const orden = ['Promoción de la Salud', 'Desarrollo Cultural', 'Cultura Física y Deporte', 'Capacitación y Adiestramiento Técnico'];
  const all = dash.data('av_nivel').data;
  const tot = all.find((r) => r.nivel === s.nivel && r.clave === s.clave && r.area === 'Todas');
  const rows = all.filter((r) => r.nivel === s.nivel && r.clave === s.clave && orden.includes(r.area) && (sel === 'Todas' || r.area === sel)).sort((x, y) => orden.indexOf(x.area) - orden.indexOf(y.area));
  if (!rows.length) { PXZ.empty(el); return; }
  if (m === 'asistencias') {
    const T = tot && tot.asistencias ? tot.asistencias : d3.sum(rows, (r) => r.asistencias);
    PXZ.anillos(el, rows.map((r) => ({ r, label: r.area, frac: T ? r.asistencias / T : 0, color: PX.color(r.area), valueText: PX.fmt(Math.round(r.asistencias)) + ' · ' + PXZ.pct(T ? r.asistencias / T : null) })), {
      aria: 'Asistencias registradas por área normativa', centro: [PXZ.compact(T), 'asistencias'],
      tip: (it) => [it.r.area, ['Asistencias registradas', PX.fmt(Math.round(it.r.asistencias))], ['Participación en las asistencias', PXZ.pct(T ? it.r.asistencias / T : null)], ['Inscripciones registradas', PX.fmt(Math.round(it.r.inscripciones))], ['Grupos registrados', PX.fmt(it.r.grupos)]],
    });
    return;
  }
  const av = tot && tot.meta_2027 ? tot.inscripciones / tot.meta_2027 : null;
  PXZ.anillos(el, rows.filter((r) => r.meta_2027).map((r) => ({ r, label: r.area, frac: r.avance || 0, color: PX.color(r.area), valueText: PXZ.pct(r.avance) + ' · ' + PX.fmt(Math.round(r.inscripciones)) + ' de ' + PX.fmt(Math.round(r.meta_2027)) })), {
    aria: 'Avance del registro contra la meta de inscripciones 2027 por área normativa', centro: sel === 'Todas' && av !== null ? [PXZ.pct(av), 'de la meta'] : null,
    tip: (it) => [it.r.area, ['Meta de inscripciones 2027', PX.fmt(Math.round(it.r.meta_2027))], ['Inscripciones registradas', PX.fmt(Math.round(it.r.inscripciones))], ['Avance', PXZ.pct(it.r.avance)], ['Semáforo', it.r.semaforo || '']],
  });
});

// Avance del registro por OOAD o Unidad Operativa: dispersión de inscripciones contra asistencias.
// Avance del registro por OOAD, Unidad Operativa o instalación: ranking por avance contra la meta, con el semáforo.
const pxSegClick = (r) => { if (r.nivel === 'OOAD') dash.setParams({ ooad: r.clave, uo: null, inst: null }); else if (r.nivel === 'Unidad Operativa') dash.setParams({ ooad: r.padre, uo: r.clave, inst: null }); };
const pxSegRows = () => { const s = PXV.scope(), a = PX.area(); return { s, rows: dash.data('av_nivel').data.filter((r) => r.nivel === s.hijos && r.padre === s.clave && r.area === a && (r.inscripciones > 0 || r.asistencias > 0 || r.meta_2027 > 0)) }; };
dash.draw('ch-seg', (el) => {
  if (!PX.ready(el, ['av_nivel'])) return;
  const { s, rows } = pxSegRows();
  if (!rows.length) { PXZ.empty(el); return; }
  const conMeta = rows.some((r) => r.meta_2027 > 0);
  rows.sort((x, y) => (conMeta ? (y.avance || 0) - (x.avance || 0) || y.inscripciones - x.inscripciones : y.inscripciones - x.inscripciones));
  const g = PXZ.hbar(el, rows, {
    aria: 'Avance contra la meta de inscripciones 2027 por ' + s.hijos,
    label: (r) => r.nombre + (r.meta_2027 ? ' · meta ' + PX.fmt(Math.round(r.meta_2027)) + ' · ' + PX.fmt(r.inscripciones) + ' registradas' : ''),
    value: (r) => (conMeta ? r.avance || 0 : r.inscripciones),
    valueText: (r) => (r.meta_2027 ? PXZ.pct(r.avance) : PX.fmt(r.inscripciones)),
    color: (r) => (r.semaforo ? PXS.color(r.semaforo) : r.inscripciones > 0 ? '#1E5B4F' : '#98989A'),
    tip: (r) => [r.nombre, ['Meta de inscripciones 2027', r.meta_2027 ? PX.fmt(Math.round(r.meta_2027)) : 'Sin meta'], ['Inscripciones registradas', PX.fmt(r.inscripciones)], ['Avance', r.meta_2027 ? PXZ.pct(r.avance) + (r.semaforo ? ' · ' + r.semaforo : '') : '—'], ['Grupos', PX.fmt(r.grupos)]],
  });
  if (s.hijos !== 'Instalación') g.style('cursor', 'pointer').on('click', (ev, r) => pxSegClick(r));
});

dash.draw('ch-seg-asis', (el) => {
  if (!PX.ready(el, ['av_nivel'])) return;
  const { s, rows } = pxSegRows();
  const R = rows.filter((r) => r.asistencias > 0).sort((x, y) => y.asistencias - x.asistencias);
  if (!R.length) { PXZ.empty(el); return; }
  const tot = d3.sum(R, (r) => r.asistencias);
  const g = PXZ.hbar(el, R, {
    aria: 'Asistencias registradas por ' + s.hijos, label: (r) => r.nombre, value: (r) => r.asistencias,
    valueText: (r) => PX.fmt(r.asistencias) + ' · ' + PXZ.pct(r.asistencias / tot), color: '#9B2247',
    tip: (r) => [r.nombre, ['Asistencias registradas', PX.fmt(r.asistencias)], ['Participación en las asistencias', PXZ.pct(r.asistencias / tot)], ['Asistencias por inscripción', r.asistencias_por_inscripcion === null || r.asistencias_por_inscripcion === undefined ? '—' : d3.format(',.1f')(r.asistencias_por_inscripcion)], ['Grupos', PX.fmt(r.grupos)]],
  });
  if (s.hijos !== 'Instalación') g.style('cursor', 'pointer').on('click', (ev, r) => pxSegClick(r));
});

dash.draw('ch-cortes', (el) => {
  if (!PX.ready(el, ['avance_corte'])) return;
  const META = 1267527, m = PXMED.m();
  const rows = [...dash.data('avance_corte').data].sort((x, y) => String(x.fecha_corte).localeCompare(String(y.fecha_corte)));
  PXZ.linea(el, rows, {
    aria: PXMED.t() + ' registradas por fecha de corte', value: (r) => r[m], color: m === 'inscripciones' ? '#1E5B4F' : '#9B2247', unidad: PXMED.t() + ' registradas',
    tip: (r) => [PXV.fecha(r.fecha_corte), ['Inscripciones registradas', PX.fmt(Math.round(r.inscripciones))], ['Avance contra la meta', PXZ.pct(r.inscripciones / META)], ['Grupos registrados', PX.fmt(r.grupos)], ['Asistencias registradas', PX.fmt(Math.round(r.asistencias))], ['Unidades Operativas con registro', PX.fmt(r.unidades)]],
  });
});

// ── Módulo 2 ──────────────────────────────────────────────────────────────
dash.draw('ch-ac-mes', (el) => {
  if (!PX.ready(el, ['ac_dim'])) return;
  const s = PXV.scope(), a = PX.area();
  const by = new Map(dash.data('ac_dim').data.filter((r) => r.nivel === s.nivel && r.clave === s.clave && r.area === a && r.dimension === 'Mes').map((r) => [Number(r.valor), r]));
  PXZ.rosa(el, pxMesFila(by, 'asistencias'), {
    aria: 'Asistencias registradas por mes', color: '#1E5B4F', unidad: 'en el año', vacio: 'Sin asistencias registradas en el ámbito y el área seleccionados.',
    tip: (r) => [pxMesN(r.m), ['Asistencias registradas', PX.fmt(r.r ? r.r.asistencias : 0)], ['Participación en las asistencias', r.r && r.r.participacion !== null ? PXZ.pct(r.r.participacion) : '—']],
  });
});

dash.draw('acd', (el) => {
  if (!PX.ready(el, ['ac_dim'])) return;
  const dim = el.dataset.dim, s = PXV.scope(), a = PX.area();
  let rows = dash.data('ac_dim').data.filter((r) => r.nivel === s.nivel && r.clave === s.clave && r.area === a && r.dimension === dim).sort((x, y) => y.asistencias - x.asistencias);
  const label = (d) => (dim === 'Actividad' ? d.nombre : d.valor);
  const tip = (d) => { const out = [label(d), ['Asistencias registradas', PX.fmt(d.asistencias)], ['Participación en las asistencias', PXZ.pct(d.participacion)]]; if (dim === 'Actividad') out.push(['Clave', d.valor], ['Tipo', d.tipo_actividad || ''], ['Bloque', d.bloque || '']); return out; };
  if (dim === 'Actividad') {
    rows = rows.slice(0, 15);
    if (!rows.length) { PXA.empty(el); return; }
    PXZ.hbar(el, rows, { aria: 'Actividades con más asistencias', label, value: (d) => d.asistencias, valueText: (d) => PX.fmt(d.asistencias) + ' · ' + PXZ.pct(d.participacion), color: '#1E5B4F', tip });
    return;
  }
  PXZ.reparto(el, rows, { barras: dim === 'Bloque', otros: 'bloques', aria: 'Asistencias registradas por ' + dim.toLowerCase(), unidad: 'asistencias', vacio: 'Sin asistencias registradas en el ámbito y el área seleccionados.', label, value: (d) => d.asistencias, valueText: (d) => PX.fmt(d.asistencias) + ' · ' + PXZ.pct(d.participacion), tip });
});

dash.draw('ch-ac-nivel', (el) => {
  if (!PX.ready(el, ['ac_nivel'])) return;
  const s = PXV.scope(), a = PX.area();
  const rows = dash.data('ac_nivel').data.filter((r) => r.nivel === s.hijos && r.padre === s.clave && r.area === a && r.asistencias > 0).sort((x, y) => y.asistencias - x.asistencias);
  const tip = (d) => { const out = [d.nombre, ['Asistencias registradas', PX.fmt(d.asistencias)], ['Participación en las asistencias del ámbito', PXZ.pct(d.participacion)]]; if (d.unidades_con_registro !== null && d.unidades_universo) out.push(['Unidades Operativas con registro', PX.fmt(d.unidades_con_registro) + ' de ' + PX.fmt(d.unidades_universo)]); if (d.lugar) out.push(['Lugar', d.lugar]); return out; };
  if (s.hijos === 'Instalación') {
    if (!rows.length) { PXA.empty(el); return; }
    PXZ.hbar(el, rows, { aria: 'Asistencias registradas por lugar', label: (d) => d.nombre + (d.lugar && d.lugar !== 'Instalación de la Unidad Operativa' ? ' · ' + d.lugar : ''), value: (d) => d.asistencias, valueText: (d) => PX.fmt(d.asistencias) + ' · ' + PXZ.pct(d.participacion), color: '#1E5B4F', tip });
    return;
  }
  PXZ.burbujas(el, rows, {
    aria: 'Asistencias registradas por ' + s.hijos, size: (d) => d.asistencias, fill: null, color: () => (a === 'Todas' ? '#1E5B4F' : PX.color(a)),
    label: (d) => d.nombre, sub: (d) => PXZ.compact(d.asistencias), vacio: 'Sin asistencias registradas en el ámbito y el área seleccionados.', tip,
    click: (r) => (r.nivel === 'OOAD' ? dash.setParams({ ooad: r.clave, uo: null, inst: null }) : dash.setParams({ ooad: r.padre, uo: r.clave, inst: null })),
  });
});

dash.draw('ch-ac-cortes', (el) => {
  if (!PX.ready(el, ['ac_corte'])) return;
  const rows = [...dash.data('ac_corte').data].sort((x, y) => String(x.fecha_corte).localeCompare(String(y.fecha_corte)));
  PXZ.linea(el, rows, { aria: 'Asistencias registradas por fecha de corte', value: (r) => r.asistencias, color: '#1E5B4F', unidad: 'Asistencias registradas',
    tip: (r) => [PXV.fecha(r.fecha_corte), ['Asistencias registradas', PX.fmt(Math.round(r.asistencias))], ...(r.actividades !== undefined ? [['Actividades registradas', PX.fmt(r.actividades)]] : []), ...(r.unidades !== undefined ? [['Unidades Operativas con registro', PX.fmt(r.unidades)]] : [])] });
});

// ── Módulo 3 ──────────────────────────────────────────────────────────────
dash.draw('ch-te-mes', (el) => {
  if (!PX.ready(el, ['te_dim'])) return;
  const s = PXV.scope(), a = PX.area();
  const by = new Map(dash.data('te_dim').data.filter((r) => r.nivel === s.nivel && r.clave === s.clave && r.area === a && r.dimension === 'Mes').map((r) => [Number(r.valor), r]));
  PXZ.rosa(el, pxMesFila(by, 'asistencias'), {
    aria: 'Asistencias registradas en teatros por mes', color: '#A57F2C', unidad: 'en el año', vacio: 'Sin asistencias registradas en el ámbito y el área seleccionados.',
    tip: (r) => [pxMesN(r.m), ['Asistencias registradas', PX.fmt(r.r ? r.r.asistencias : 0)], ['Participación en las asistencias', r.r && r.r.participacion !== null ? PXZ.pct(r.r.participacion) : '—']],
  });
});

dash.draw('ted', (el) => {
  if (!PX.ready(el, ['te_dim'])) return;
  const dim = el.dataset.dim, s = PXV.scope(), a = PX.area();
  let rows = dash.data('te_dim').data.filter((r) => r.nivel === s.nivel && r.clave === s.clave && r.area === a && r.dimension === dim).sort((x, y) => y.asistencias - x.asistencias);
  const label = (d) => (dim === 'Actividad' ? d.nombre : d.valor);
  const tip = (d) => { const out = [label(d), ['Asistencias registradas', PX.fmt(d.asistencias)], ['Participación en las asistencias', PXZ.pct(d.participacion)]]; if (dim === 'Actividad') out.push(['Clave', d.valor]); return out; };
  if (dim === 'Actividad') {
    rows = rows.slice(0, 12);
    if (!rows.length) { PXT.empty(el); return; }
    PXZ.hbar(el, rows, { aria: 'Actividades con más asistencias en teatros', label, value: (d) => d.asistencias, valueText: (d) => PX.fmt(d.asistencias) + ' · ' + PXZ.pct(d.participacion), color: '#A57F2C', tip });
    return;
  }
  PXZ.reparto(el, rows, { barras: dim === 'Bloque', otros: 'bloques', aria: 'Asistencias registradas en teatros por ' + dim.toLowerCase(), unidad: 'asistencias', color: '#A57F2C', vacio: 'Sin asistencias registradas en el ámbito y el área seleccionados.', label, value: (d) => d.asistencias, valueText: (d) => PX.fmt(d.asistencias) + ' · ' + PXZ.pct(d.participacion), tip });
});

dash.draw('ch-te-nivel', (el) => {
  if (!PX.ready(el, ['te_nivel'])) return;
  const s = PXV.scope(), a = PX.area();
  const d = dash.data('te_nivel').data;
  const rows = s.nivel === 'Unidad Operativa' ? d.filter((r) => r.nivel === 'Unidad Operativa' && r.clave === s.clave && r.area === a) : d.filter((r) => r.nivel === s.hijos && r.padre === s.clave && r.area === a && r.asistencias > 0);
  const tip = (r) => { const out = [r.nombre, ['Asistencias registradas', PX.fmt(r.asistencias)], ['Participación en las asistencias del ámbito', PXZ.pct(r.participacion)]]; if (r.teatros_universo) out.push(['Teatros con registro', PX.fmt(r.teatros_con_registro || 0) + ' de ' + PX.fmt(r.teatros_universo)]); return out; };
  if (s.nivel === 'Unidad Operativa') {
    if (!rows.length) { PXT.empty(el); return; }
    PXZ.hbar(el, rows, { aria: 'Asistencias registradas en el teatro', label: (r) => r.nombre, value: (r) => r.asistencias, color: '#A57F2C', tip });
    return;
  }
  PXZ.burbujas(el, rows, {
    aria: 'Asistencias registradas en teatros por ' + (s.nivel === 'Nacional' ? 'OOAD' : 'teatro'), size: (r) => r.asistencias, fill: null, color: () => '#A57F2C',
    label: (r) => r.nombre, sub: (r) => PXZ.compact(r.asistencias), vacio: 'Sin asistencias registradas en el ámbito y el área seleccionados.', tip,
    click: (r) => (r.nivel === 'OOAD' ? dash.setParams({ ooad: r.clave, uo: null, inst: null }) : dash.setParams({ ooad: r.padre, uo: r.clave, inst: null })),
  });
});

dash.draw('ch-te-cortes', (el) => {
  if (!PX.ready(el, ['te_corte'])) return;
  const rows = [...dash.data('te_corte').data].sort((x, y) => String(x.fecha_corte).localeCompare(String(y.fecha_corte)));
  PXZ.linea(el, rows, { aria: 'Asistencias registradas en teatros por fecha de corte', value: (r) => r.asistencias, color: '#A57F2C', unidad: 'Asistencias registradas',
    tip: (r) => [PXV.fecha(r.fecha_corte), ['Asistencias registradas', PX.fmt(Math.round(r.asistencias))], ...(r.eventos !== undefined ? [['Eventos registrados', PX.fmt(r.eventos)]] : []), ...(r.teatros !== undefined ? [['Teatros con registro', PX.fmt(r.teatros)]] : [])] });
});

dash.draw('ch-tseg-mes', (el) => {
  if (!PX.ready(el, ['te_seg'])) return;
  const act = el.dataset.act, s = PXV.scope(), a = PX.area();
  const by = new Map(dash.data('te_seg').data.filter((r) => r.clave_actividad === act && r.nivel === s.nivel && r.clave === s.clave && r.area === a && r.mes > 0).map((r) => [r.mes, r]));
  PXZ.rosa(el, pxMesFila(by, 'prog'), {
    aria: 'Asistencias programadas por mes, actividad ' + act, color: '#A57F2C', unidad: 'programadas', vacio: 'Sin asistencias programadas de esta actividad en el ámbito y el área seleccionados.',
    tip: (r) => [pxMesN(r.m), ['Asistencias programadas', PX.fmt(Math.round(r.v))], ['Eventos programados', PX.fmt(r.r ? r.r.eventos_prog : 0)]],
  });
});
