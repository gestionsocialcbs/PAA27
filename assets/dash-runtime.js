/*
 * Motor mínimo del tablero PAA 2027 para GitHub Pages.
 * Reproduce la interfaz `dash` que usa la página en claude.ai:
 *   dash.calc(id, {inputs, fn})   cálculo derivado de otras tablas
 *   dash.draw(nombre, fn)         dibujo de los elementos con data-draw="nombre"
 *   dash.data(id)                 {status: 'loading' | 'ok' | 'error' | 'missing', data}
 *   dash.params() / setParams() / resetParams()   filtros (se guardan en la URL)
 *   dash.onData(fn)               se llama en cada redibujo
 *   dash.setLink(id)              ancla de la URL
 * Los datos se leen de datos/manifest.json y de los archivos JSON que enlista.
 */
(function () {
  'use strict';
  var PARAMS = ['area', 'ooad', 'uo', 'inst', 'tinst', 'medida'];
  var raw = {};        // id -> {status, data}
  var calcs = {};      // id -> {inputs, fn}
  var memo = {};       // id -> {status, data}
  var draws = {};      // nombre -> fn
  var hooks = [];
  var params = {};
  var loaded = false;

  function leerParams() {
    var q = new URLSearchParams(location.search);
    params = {};
    PARAMS.forEach(function (k) { var v = q.get(k); params[k] = v === null || v === '' ? null : v; });
  }
  function escribirParams() {
    var q = new URLSearchParams();
    PARAMS.forEach(function (k) { if (params[k] !== null && params[k] !== undefined) q.set(k, params[k]); });
    var s = q.toString();
    history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
  }

  function data(id) {
    if (raw[id]) return raw[id];
    var c = calcs[id];
    if (!c) return { status: loaded ? 'missing' : 'loading', data: null };
    if (memo[id]) return memo[id];
    var ins = c.inputs.map(data);
    if (ins.some(function (x) { return x.status === 'error' || x.status === 'missing'; })) return { status: 'error', data: null };
    if (ins.some(function (x) { return x.status !== 'ok'; })) return { status: 'loading', data: null };
    try {
      memo[id] = { status: 'ok', data: c.fn.apply(null, ins.map(function (x) { return x.data; })) };
    } catch (e) {
      console.error('Cálculo ' + id, e);
      memo[id] = { status: 'error', data: null };
    }
    return memo[id];
  }

  var pendiente = false;
  function render() {
    pendiente = false;
    hooks.forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
    document.querySelectorAll('[data-draw]').forEach(function (el) {
      if (el.closest('[hidden]')) return;
      var f = draws[el.dataset.draw];
      if (!f) return;
      el.replaceChildren();
      try { (typeof f === 'function' ? f : f.update || f.mount)(el); } catch (e) { console.error('Dibujo ' + el.dataset.draw, e); }
    });
    if (loaded) document.querySelectorAll('.dash-skeleton').forEach(function (el) { el.classList.remove('dash-skeleton'); });
  }
  function programar() { if (!pendiente) { pendiente = true; requestAnimationFrame(render); } }

  window.dash = {
    calc: function (id, o) { calcs[id] = o; },
    draw: function (n, f) { draws[n] = f; },
    data: data,
    onData: function (f) { hooks.push(f); },
    params: function () { return Object.assign({}, params); },
    setParams: function (p) {
      Object.keys(p).forEach(function (k) { params[k] = p[k] === undefined ? null : p[k]; });
      escribirParams();
      programar();
    },
    resetParams: function () { PARAMS.forEach(function (k) { params[k] = null; }); escribirParams(); programar(); },
    setLink: function (id) { history.replaceState(null, '', location.pathname + location.search + (id ? '#' + id : '')); },
  };

  leerParams();

  function cargar() {
    fetch('datos/manifest.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
      .then(function (m) {
        var ids = Object.keys(m.datasets);
        ids.forEach(function (id) { raw[id] = { status: 'loading', data: null }; });
        return Promise.all(ids.map(function (id) {
          return fetch(m.datasets[id].archivo, { cache: 'no-cache' })
            .then(function (r) { if (!r.ok) throw new Error(id + ' ' + r.status); return r.json(); })
            .then(function (d) { raw[id] = { status: 'ok', data: d }; })
            .catch(function (e) { console.error(e); raw[id] = { status: 'error', data: null }; });
        }));
      })
      .catch(function (e) { console.error('No se pudo leer datos/manifest.json', e); })
      .then(function () { loaded = true; memo = {}; render(); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    render();
    cargar();
    // Las pestañas de módulo usan el atributo hidden: al mostrarse un módulo se dibuja.
    var obs = new MutationObserver(function (lista) {
      if (lista.some(function (m) { return !m.target.hidden; })) programar();
    });
    document.querySelectorAll('.px-mod').forEach(function (m) { obs.observe(m, { attributes: true, attributeFilter: ['hidden'] }); });
    var t;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(programar, 180); });
  });
})();
