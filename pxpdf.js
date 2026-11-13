// Descarga en PDF de cada módulo (hoja) del tablero, tal como se ve con los filtros elegidos.
// Escribe el PDF en el navegador: textos, indicadores y tablas como texto; gráficas como imagen.
window.PXPDF = (() => {
  const W = 841.89, H = 595.28, M = 32, CW = W - 2 * M; // A4 horizontal
  const RGB = {
    osc: [0, 47, 42], verde: [30, 91, 79], guinda: [155, 34, 71], oro: [165, 127, 44], oroCl: [230, 209, 148],
    tinta: [22, 26, 29], gris: [91, 97, 102], linea: [220, 223, 221], fondo: [243, 245, 244], blanco: [255, 255, 255], teal: [47, 138, 163],
  };
  const CP = { '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, 'Ž': 142, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152, '™': 153, 'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159 };
  const ALT = { '≥': '>=', '≤': '<=', '→': '->', '←': '<-', '↑': '^', '↓': 'v', '÷': '÷', '×': '×', ' ': ' ', ' ': ' ', ' ': ' ' };
  const ctx = document.createElement('canvas').getContext('2d');
  const ancho = (t, size, bold) => { ctx.font = (bold ? 'bold ' : '') + size + 'px Helvetica, Arial, sans-serif'; return ctx.measureText(t).width; };
  const limpia = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
  const lit = (t) => {
    let o = '';
    for (const ch of String(t)) {
      const a = ALT[ch] !== undefined ? ALT[ch] : ch;
      for (const c of a) {
        let k = c.charCodeAt(0);
        if (k >= 128 && k < 160) k = 63;
        if (k > 255) k = CP[c] || 63;
        const s = String.fromCharCode(k);
        o += s === '(' || s === ')' || s === '\\' ? '\\' + s : s;
      }
    }
    return '(' + o + ')';
  };
  const col = (c) => c.map((v) => (v / 255).toFixed(3)).join(' ');
  // Texto visible de un elemento (sin lo oculto, como la unidad de medida que no está elegida).
  const vtext = (el) => {
    if (!el) return '';
    let o = '';
    const walk = (n) => {
      if (n.nodeType === 3) { o += n.nodeValue; return; }
      if (n.nodeType !== 1 || n.hidden || n.matches('script, style, .px-tip')) return;
      for (const c of n.childNodes) walk(c);
      o += /^(P|DIV|LI|TR|H\d)$/.test(n.tagName) ? '\n' : ' ';
    };
    walk(el);
    return o;
  };
  const visible = (el) => el && !el.closest('[hidden]') && !el.closest('.px-tip') && el.getClientRects().length > 0;

  function lineas(t, size, bold, maxW) {
    const out = [];
    for (const par of String(t).split('\n')) {
      const words = limpia(par).split(' ');
      let cur = '';
      for (const w of words) {
        const nx = cur ? cur + ' ' + w : w;
        if (ancho(nx, size, bold) > maxW && cur) { out.push(cur); cur = w; } else cur = nx;
      }
      if (cur) out.push(cur);
    }
    return out;
  }

  class Doc {
    constructor(titulo, sub, logos) { this.pages = []; this.imgs = []; this.titulo = titulo; this.sub = sub; this.logos = logos; this.nueva(true); }
    nueva(primera) {
      this.ops = [];
      this.pages.push(this.ops);
      let y = M;
      if (primera) {
        // Franja de logotipos y banda verde, como la portada de los Criterios Técnicos.
        let x = W - M;
        for (const lg of this.logos.slice().reverse()) { const h = 26, w = h * lg.w / lg.h; x -= w; this.img(lg.i, x, y, w, h); x -= 10; }
        ['DIRECCIÓN DE PRESTACIONES ECONÓMICAS Y SOCIALES', 'UNIDAD DE PRESTACIONES SOCIALES', 'COORDINACIÓN DE BIENESTAR SOCIAL'].forEach((t, i) => this.txt(t, M, y + 7 + i * 8, 5.6, false, RGB.gris));
        y += 34;
        this.rect(0, y, W, 2, RGB.oro);
        y += 2;
        const lt = lineas(this.titulo, 15, true, CW);
        const bh = 34 + lt.length * 18 + 12;
        this.rect(0, y, W, bh, RGB.osc);
        this.txt('PROGRAMACIÓN ANUAL DE ACTIVIDADES 2027 · TABLERO DE SEGUIMIENTO', M, y + 18, 7, true, RGB.oroCl);
        lt.forEach((l, i) => this.txt(l, M, y + 38 + i * 18, 15, true, RGB.blanco));
        this.txt(this.sub, M, y + bh - 10, 7.5, false, [169, 193, 187]);
        y += bh;
        this.rect(0, y, W, 2.5, RGB.oro);
        const seg = W / 4;
        [RGB.oro, RGB.verde, RGB.guinda, RGB.teal].forEach((c, i) => this.rect(i * seg, y + 2.5, seg, 3, c));
        y += 18;
      } else {
        this.rect(0, 0, W, 22, RGB.osc);
        this.rect(0, 22, W, 1.5, RGB.oro);
        this.txt(this.titulo, M, 14.5, 7.5, true, RGB.blanco);
        y = 22 + 20;
      }
      this.y = y;
    }
    abajo() { return H - M - 14; }
    cabe(h) { if (this.y + h > this.abajo()) this.nueva(false); }
    txt(t, x, y, size, bold, c) { this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${col(c || RGB.tinta)} rg ${x.toFixed(2)} ${(H - y).toFixed(2)} Td ${lit(t)} Tj ET`); }
    rect(x, y, w, h, c) { this.ops.push(`${col(c)} rg ${x.toFixed(2)} ${(H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); }
    linea(x1, y1, x2, c, wd) { this.ops.push(`${col(c)} RG ${wd || 0.5} w ${x1.toFixed(2)} ${(H - y1).toFixed(2)} m ${x2.toFixed(2)} ${(H - y1).toFixed(2)} l S`); }
    img(i, x, y, w, h) { this.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${(H - y - h).toFixed(2)} cm /Im${i} Do Q`); }
    parrafo(t, size, bold, c, x0, maxW, lh) {
      x0 = x0 ?? M; maxW = maxW ?? CW; lh = lh ?? size * 1.38;
      for (const l of lineas(t, size, bold, maxW)) { this.cabe(lh); this.txt(l, x0, this.y + size, size, bold, c); this.y += lh; }
    }
    addJpeg(bytes, w, h) { this.imgs.push({ bytes, w, h }); return this.imgs.length; }
    // Arma el archivo PDF.
    bytes() {
      const n = this.pages.length;
      this.pages.forEach((ops, i) => {
        this.ops = ops;
        this.linea(M, H - M, W - M, RGB.linea, 0.5);
        this.txt('CTPAA 2027 · Tablero PAA 2027 · ' + this.sub, M, H - M + 11, 6.5, false, RGB.gris);
        const p = 'Página ' + (i + 1) + ' de ' + n;
        this.txt(p, W - M - ancho(p, 6.5, false) * 0.98, H - M + 11, 6.5, false, RGB.gris);
      });
      const enc = new TextEncoder();
      const parts = [];
      let off = 0;
      const offs = [];
      const put = (x) => { const b = typeof x === 'string' ? Uint8Array.from(x, (c) => c.charCodeAt(0) & 255) : x; parts.push(b); off += b.length; };
      put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
      const obj = (num, body) => { offs[num] = off; put(num + ' 0 obj\n'); if (typeof body === 'function') body(); else put(body); put('\nendobj\n'); };
      const nImg = this.imgs.length;
      const firstImg = 5, firstPage = firstImg + nImg;
      const kids = this.pages.map((_, i) => (firstPage + i * 2) + ' 0 R').join(' ');
      obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
      obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
      obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      this.imgs.forEach((im, i) => obj(firstImg + i, () => { put(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`); put(im.bytes); put('\nendstream'); }));
      const xo = this.imgs.map((_, i) => `/Im${i + 1} ${firstImg + i} 0 R`).join(' ');
      this.pages.forEach((ops, i) => {
        const pn = firstPage + i * 2;
        const content = ops.join('\n');
        obj(pn, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${xo} >> >> /Contents ${pn + 1} 0 R >>`);
        obj(pn + 1, () => { put(`<< /Length ${content.length} >>\nstream\n`); put(content); put('\nendstream'); });
      });
      const total = firstPage + n * 2;
      const xref = off;
      let x = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
      for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
      put(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
      void enc;
      const out = new Uint8Array(off);
      let p = 0;
      for (const b of parts) { out.set(b, p); p += b.length; }
      return out;
    }
  }

  const jpeg = (canvas) => {
    const b64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  };
  const PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'opacity', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'dominant-baseline', 'display', 'visibility'];
  async function svgCanvas(svg, escala) {
    const r = svg.getBoundingClientRect();
    const w = Math.ceil(r.width), h = Math.ceil(r.height);
    if (!w || !h) return null;
    const clon = svg.cloneNode(true);
    const a = [svg, ...svg.querySelectorAll('*')], b = [clon, ...clon.querySelectorAll('*')];
    a.forEach((el, i) => {
      const cs = getComputedStyle(el);
      let st = '';
      for (const p of PROPS) { const v = cs.getPropertyValue(p); if (v) st += p + ':' + v + ';'; }
      b[i].setAttribute('style', st);
      b[i].removeAttribute('class');
    });
    clon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clon.setAttribute('width', w);
    clon.setAttribute('height', h);
    if (!clon.getAttribute('viewBox')) clon.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const xml = new XMLSerializer().serializeToString(clon);
    const im = new Image();
    await new Promise((ok, ko) => { im.onload = ok; im.onerror = ko; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml); });
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * escala); cv.height = Math.round(h * escala);
    const c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
    c.drawImage(im, 0, 0, cv.width, cv.height);
    return { cv, w, h };
  }
  function imgCanvas(img) {
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth || img.width; cv.height = img.naturalHeight || img.height;
    const c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
    c.drawImage(img, 0, 0, cv.width, cv.height);
    return cv;
  }

  // Coloca una gráfica a lo ancho de la página; si es más alta que la página, la parte en trozos.
  async function grafica(doc, svg) {
    const r = await svgCanvas(svg, 2).catch(() => null);
    if (!r) return;
    const k = Math.min(CW / r.w, 0.8);
    const wPt = r.w * k;
    let hPt = r.h * k, srcY = 0;
    const pxPorPt = r.cv.height / (r.h * k);
    while (hPt > 0.5) {
      let disp = doc.abajo() - doc.y;
      if (disp < 40) { doc.nueva(false); disp = doc.abajo() - doc.y; }
      const tomar = Math.min(hPt, disp);
      const altoPx = Math.max(1, Math.round(tomar * pxPorPt));
      const cv = document.createElement('canvas');
      cv.width = r.cv.width; cv.height = altoPx;
      cv.getContext('2d').drawImage(r.cv, 0, srcY, r.cv.width, altoPx, 0, 0, r.cv.width, altoPx);
      const i = doc.addJpeg(jpeg(cv), cv.width, cv.height);
      doc.img(i, M, doc.y, wPt, tomar);
      doc.y += tomar + 4;
      srcY += altoPx; hPt -= tomar;
    }
    doc.y += 4;
  }

  function tabla(doc, t) {
    const heads = [...t.querySelectorAll('thead th')].map((th) => limpia(vtext(th)));
    const filas = [...t.querySelectorAll('tbody tr')].filter(visible).map((tr) => [...tr.children].map((td) => limpia(vtext(td))));
    if (!filas.length) return;
    const size = 6.6, lh = 8.6;
    const pesos = heads.map((h, j) => Math.max(ancho(h, size, true), ...filas.slice(0, 80).map((f) => Math.min(ancho(f[j] || '', size, false), 150))) + 8);
    const tot = pesos.reduce((a, b) => a + b, 0);
    const ws = pesos.map((p) => p * CW / tot);
    const fila = (cells, bold, fondo) => {
      const ls = cells.map((c, j) => lineas(c || '', size, bold, ws[j] - 6));
      const alto = Math.max(1, ...ls.map((l) => l.length)) * lh + 4;
      if (doc.y + alto > doc.abajo()) { doc.nueva(false); if (!bold) fila(heads, true, RGB.fondo); }
      if (fondo) doc.rect(M, doc.y, CW, alto, fondo);
      let x = M;
      ls.forEach((l, j) => { l.forEach((s, k) => doc.txt(s, x + 3, doc.y + 2 + size + k * lh, size, bold, bold ? RGB.gris : RGB.tinta)); x += ws[j]; });
      doc.y += alto;
      doc.linea(M, doc.y, M + CW, RGB.linea, 0.4);
    };
    fila(heads, true, RGB.fondo);
    filas.forEach((f) => fila(f, false, null));
    doc.y += 8;
  }

  function kpis(doc, el) {
    const ks = [...el.querySelectorAll(':scope > .px-kpi')].filter(visible);
    if (!ks.length) return;
    const porFila = Math.min(4, ks.length), gap = 6, w = (CW - gap * (porFila - 1)) / porFila;
    const colores = [RGB.osc, RGB.guinda, RGB.oro, RGB.teal, RGB.guinda];
    for (let i = 0; i < ks.length; i += porFila) {
      const fila = ks.slice(i, i + porFila).map((k) => ({ l: lineas(limpia(vtext(k.querySelector('.px-kpi-l'))), 6.8, false, w - 12), v: lineas(limpia(vtext(k.querySelector('.px-kpi-v'))), 12, true, w - 12) }));
      const alto = Math.max(...fila.map((f) => f.l.length * 8.5 + f.v.length * 14)) + 14;
      doc.cabe(alto + 6);
      fila.forEach((f, j) => {
        const x = M + j * (w + gap), prim = i + j === 0;
        doc.rect(x, doc.y, w, alto, prim ? RGB.osc : RGB.fondo);
        doc.rect(x, doc.y, w, 2, colores[(i + j) % colores.length]);
        let yy = doc.y + 11;
        f.l.forEach((s) => { doc.txt(s, x + 6, yy, 6.8, false, prim ? [169, 193, 187] : RGB.gris); yy += 8.5; });
        f.v.forEach((s) => { doc.txt(s, x + 6, yy + 9, 12, true, prim ? RGB.blanco : RGB.tinta); yy += 14; });
      });
      doc.y += alto + 6;
    }
    doc.y += 2;
  }

  async function bloque(doc, el) {
    if (!visible(el) || el.matches('details, .px-tip, script, style, button, select, .px-med, .px-med-bar')) return;
    if (el.matches('.px-sec-h')) {
      doc.cabe(60);
      doc.y += 6;
      const top = doc.y;
      const n = el.querySelector('.px-sec-n'), t = el.querySelector('.px-sec-t'), d = el.querySelector('.px-sec-d');
      if (n) { doc.y += 2; doc.parrafo(limpia(vtext(n)).toUpperCase(), 7, true, RGB.guinda, M + 9, CW - 9, 10); }
      if (t) doc.parrafo(limpia(vtext(t)), 12.5, true, RGB.tinta, M + 9, CW - 9, 16);
      if (d) doc.parrafo(limpia(vtext(d)), 7.6, false, RGB.gris, M + 9, CW - 9, 10.4);
      doc.rect(M, top, 3, doc.y - top, RGB.osc);
      doc.y += 8;
      return;
    }
    if (el.matches('.px-kpis')) { kpis(doc, el); return; }
    if (el.matches('table')) { tabla(doc, el); return; }
    if (el.matches('svg')) { await grafica(doc, el); return; }
    if (el.matches('.px-card')) {
      const h = el.querySelector(':scope > h3, :scope > summary h3');
      doc.cabe(40);
      doc.linea(M, doc.y, M + CW, RGB.osc, 1.2);
      doc.y += 6;
      if (h) { doc.rect(M, doc.y + 2.5, 5, 5, RGB.guinda); doc.parrafo(limpia(vtext(h)), 9.5, true, RGB.tinta, M + 9, CW - 9, 13); }
      for (const ch of el.children) if (ch !== h) await bloque(doc, ch);
      doc.y += 6;
      return;
    }
    const hijos = [...el.children].filter((c) => !c.matches('script, style'));
    const conBloques = el.querySelector('svg, table, .px-card, .px-kpis, .px-sec-h');
    if (hijos.length && conBloques) { for (const ch of hijos) await bloque(doc, ch); return; }
    const t = vtext(el).trim();
    if (!t || t === '—') return;
    const nota = el.matches('.px-note, .px-legend, .px-sec-d');
    const ls = t.split('\n').map(limpia).filter(Boolean).slice(0, 80);
    doc.parrafo(ls.join('\n'), nota ? 7.2 : 8, false, nota ? RGB.gris : RGB.tinta, M, CW, nota ? 9.8 : 10.8);
    doc.y += 3;
  }

  async function generar(n) {
    const mod = document.getElementById('modulo-' + n);
    if (!mod) return null;
    const sel = (id) => { const s = document.getElementById(id); return s && s.selectedIndex >= 0 ? limpia(s.options[s.selectedIndex].textContent) : ''; };
    const ooad = sel('px-f-ooad') || 'Nacional', uo = sel('px-f-uo'), area = sel('px-f-area') || 'Todas las áreas';
    const amb = [ooad, uo && !/^elige|^todas/i.test(uo) ? uo : ''].filter(Boolean).join(' · ');
    const med = n === '1' ? ' · ' + (PXMED.t ? PXMED.t() : '') : '';
    const hoy = new Date();
    const sub = 'Ámbito: ' + amb + ' · Área: ' + area + med + ' · Descargado el ' + hoy.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
    const titulo = 'Módulo ' + n + ' · ' + limpia(mod.querySelector('.px-mod-t')?.textContent).replace(/^\d+\s*/, '');
    const logos = [];
    const tmp = new Doc('', '', []);
    for (const img of document.querySelectorAll('.px-brand-l img')) {
      try { const cv = imgCanvas(img); logos.push({ i: tmp.addJpeg(jpeg(cv), cv.width, cv.height), w: cv.width, h: cv.height }); } catch (e) { /* sin logotipo */ }
    }
    const doc = Object.assign(Object.create(Doc.prototype), { pages: [], imgs: tmp.imgs, titulo, sub, logos });
    doc.nueva(true);
    for (const ch of mod.children) {
      if (ch.matches('.px-mod-h')) {
        const chips = [...ch.querySelectorAll('.px-upd-chip')].map((c) => limpia(vtext(c))).join('   ·   ');
        if (chips) doc.parrafo(chips, 7.2, false, RGB.gris, M, CW, 9.8);
        const lead = ch.querySelector('.px-lead');
        if (lead && visible(lead)) { doc.y += 2; doc.parrafo(limpia(vtext(lead)), 9, false, RGB.tinta, M, CW, 12.5); }
        doc.y += 6;
        continue;
      }
      await bloque(doc, ch);
    }
    const nombre = 'PAA2027_Modulo' + n + '_' + amb.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') + '.pdf';
    return { bytes: doc.bytes(), nombre };
  }

  async function descargar(btn) {
    const n = btn.dataset.mod;
    const txt = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Preparando PDF…';
    try {
      const r = await generar(n);
      if (!r) return;
      const blob = new Blob([r.bytes], { type: 'application/pdf' });
      let dl = null;
      try { dl = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
      if (dl) {
        try { await dl.save({ filename: r.nombre, data: blob }); } catch (e) { if (e && e.code && e.code !== 'declined') btn.title = 'No se pudo guardar el PDF (' + e.code + ').'; }
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = r.nombre;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
    } catch (e) {
      console.error('PDF', e);
      btn.title = 'No se pudo generar el PDF.';
    } finally {
      btn.disabled = false;
      btn.textContent = txt;
    }
  }
  document.addEventListener('click', (ev) => { const b = ev.target.closest && ev.target.closest('.px-pdf'); if (b) descargar(b); });
  return { generar, descargar };
})();
