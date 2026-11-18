"""Pronóstico de cumplimiento del Programa Anual 2027 (cursos y talleres).
Uso: python3 -I procesar_prediccion.py DATOS_DIR SALIDA_DIR [--cierre AAAA-MM-DD] [--agregar-corte avance_instalacion.json AAAA-MM-DD]

Dos modelos, a nivel nacional, por OOAD y por Unidad Operativa, por área normativa y en total:

1) Cierre del registro (fecha límite, por omisión el 30 de noviembre de 2026).
   - Historial: inscripciones, asistencias y grupos registrados por unidad y área en cada fecha de corte (avance_hist.json).
   - Ritmo diario = aumento de inscripciones registradas entre el corte actual y el de hasta tres cortes antes, entre los días hábiles
     transcurridos (lunes a viernes).
   - Proyección al cierre = registrado + ritmo × días hábiles que faltan, sin superar la meta 2027 de la unidad y área
     (una unidad que ya rebasó su meta conserva lo registrado). Las unidades sin registro se proyectan en 0.
   - Asistencias proyectadas = asistencias registradas × (inscripciones proyectadas ÷ inscripciones registradas).
   - Ritmo necesario = (meta − registrado) ÷ días hábiles que faltan.

2) Cumplimiento real 2027 estimado.
   - Factor de cumplimiento 2026 de cada unidad y área = inscripciones reales 2026 (reporte de Inscritos) ÷ inscripciones
     programadas 2026; si la unidad no tiene dato se usa el de su OOAD y, si tampoco, el nacional. Se acota entre 0 y 1.5.
   - Inscripciones reales 2027 estimadas = inscripciones proyectadas al cierre × factor.
   - Asistencias reales 2027 estimadas = inscripciones reales estimadas × asistencias por inscripción reales 2026 de la unidad.

Salidas: avance_hist.json (historial), pred_registro.json (un renglón por nivel, clave y área) y pred_corte.json (resumen nacional
por fecha de corte, para ver cómo cambia el pronóstico).
"""
import sys, os, json, datetime, collections

args = sys.argv[1:]
datos, out = args[0], args[1]
cierre = datetime.date(2026, 11, 30)
agregar = None
i = 2
while i < len(args):
    if args[i] == '--cierre': cierre = datetime.date.fromisoformat(args[i + 1]); i += 2
    elif args[i] == '--agregar-corte': agregar = (args[i + 1], args[i + 2]); i += 3
    else: sys.exit('argumento desconocido: ' + args[i])
FESTIVOS = set()  # días inhábiles adicionales (AAAA-MM-DD) si se requieren

ld = lambda n: json.load(open(os.path.join(datos, n + '.json')))
areaN = lambda a: {'CECART': 'Capacitación y Adiestramiento Técnico', 'CASSAAM': 'Promoción de la Salud'}.get(a, a)
uos = {f"{u['cve_uo'] // 1000}-{u['cve_uo'] % 1000}": u for u in ld('unidades_operativas')}


def habiles(a, b):
    """Días hábiles en (a, b]."""
    n, d = 0, a
    while d < b:
        d += datetime.timedelta(days=1)
        if d.weekday() < 5 and d.isoformat() not in FESTIVOS: n += 1
    return n


# ── Historial por unidad y área ────────────────────────────────────────────
hist_p = os.path.join(datos, 'avance_hist.json')
hist = json.load(open(hist_p)) if os.path.exists(hist_p) else []


def resumen(inst, fecha):
    acc = collections.defaultdict(lambda: [0, 0.0, 0.0])
    for r in inst:
        if r['unidad'] not in uos: continue
        k = (r['unidad'], areaN(r['area']))
        acc[k][0] += r['grupos']; acc[k][1] += r['inscripciones']; acc[k][2] += r['asistencias']
    return [dict(fecha_corte=fecha, unidad=k[0], area=k[1], grupos=v[0], inscripciones=round(v[1], 2), asistencias=round(v[2], 2)) for k, v in acc.items()]


if agregar:
    inst, fecha = json.load(open(agregar[0])), agregar[1]
else:
    inst, fecha = ld('avance_instalacion'), sorted(ld('avance_corte'), key=lambda c: c['fecha_corte'])[-1]['fecha_corte']
hist = [h for h in hist if h['fecha_corte'] != fecha] + resumen(inst, fecha)
hist.sort(key=lambda h: (h['fecha_corte'], h['unidad'], h['area']))
fechas = sorted({h['fecha_corte'] for h in hist})
ultima = fechas[-1]
hoy = datetime.date.fromisoformat(ultima)
restantes = habiles(hoy, cierre)

# ── Metas, programado y real 2026 por unidad y área ───────────────────────
metas = {(m['unidad'], m['area']): m for m in ld('metas_2027_uopsi') if m['area'] != 'Total' and m['unidad'] in uos}
real = collections.defaultdict(lambda: [0.0, 0.0])
for r in ld('ri_registro') if os.path.exists(os.path.join(datos, 'ri_registro.json')) else []:
    if r['unidad'] in uos:
        k = (r['unidad'], areaN(r['area'])); real[k][0] += r['inscripciones']; real[k][1] += r['asistencias']

serie = collections.defaultdict(dict)
for h in hist: serie[(h['unidad'], h['area'])][h['fecha_corte']] = h
claves = set(metas) | set(serie)

# Factores de cumplimiento 2026 (unidad → OOAD → nacional).
def factores(nivel_de):
    p, r, a = collections.defaultdict(float), collections.defaultdict(float), collections.defaultdict(float)
    for k in claves:
        g = nivel_de(k)
        p[g] += metas.get(k, {}).get('programado_2026', 0) or 0
        r[g] += real[k][0]; a[g] += real[k][1]
    return {g: (min(1.5, r[g] / p[g]) if p[g] > 0 and r[g] > 0 else None, a[g] / r[g] if r[g] > 0 else None) for g in p}
f_uo = factores(lambda k: k)
f_oo = factores(lambda k: uos[k[0]]['cve_ooad'])
f_na = factores(lambda k: 'N')['N']

filas = {}
for k in claves:
    s = serie.get(k, {})
    act = s.get(ultima)
    ins, asi, gru = (act['inscripciones'], act['asistencias'], act['grupos']) if act else (0.0, 0.0, 0)
    prev = [f for f in fechas[:-1] if f in s or True][-3:]
    ritmo = None
    if len(fechas) > 1:
        f0 = fechas[max(0, len(fechas) - 4)]
        d = habiles(datetime.date.fromisoformat(f0), hoy)
        i0 = s.get(f0, {}).get('inscripciones', 0.0)
        ritmo = max(0.0, (ins - i0) / d) if d > 0 else None
    meta = metas.get(k, {}).get('meta_2027', 0) or 0
    proy = ins + (ritmo or 0) * restantes
    if meta > 0: proy = max(ins, min(proy, meta))
    asi_p = asi * (proy / ins) if ins > 0 else 0.0
    fu, fo = f_uo.get(k, (None, None)), f_oo.get(uos[k[0]]['cve_ooad'], (None, None))
    fac = fu[0] if fu[0] is not None else fo[0] if fo[0] is not None else f_na[0]
    apr = fu[1] if fu[1] is not None else fo[1] if fo[1] is not None else f_na[1]
    real_i = proy * (fac or 0)
    filas[k] = dict(meta=meta, programado_2026=metas.get(k, {}).get('programado_2026', 0) or 0, grupos=gru, inscripciones=ins, asistencias=asi,
                    ritmo=ritmo or 0.0, proyeccion=proy, asistencias_proyectadas=asi_p, real_2026=real[k][0],
                    real_inscripciones=real_i, real_asistencias=real_i * (apr or 0))


def sem(av):
    if av is None: return None
    return 'Morado' if av > 1.25 else 'Verde' if 0.85 < av < 1.15 else 'Amarillo' if 0.75 <= av <= 1.25 else 'Rojo'


acc = collections.defaultdict(lambda: collections.Counter())
for (u, a), v in filas.items():
    o = str(uos[u]['cve_ooad'])
    for nivel, clave in (('Nacional', 'Nacional'), ('OOAD', o), ('Unidad Operativa', u)):
        for area in ('Todas', a):
            acc[(nivel, clave, area)].update({x: y for x, y in v.items()})
            acc[(nivel, clave, area)]['_con'] += 1 if v['inscripciones'] > 0 else 0
r2 = lambda x: round(x, 4)
pred = []
# Metas oficiales por OOAD y área (incluye el total nacional de 1,267,527); por unidad, la meta de cada UOPSI.
mo = collections.defaultdict(float)
for m in ld('metas_2027'):
    ar = 'Todas' if m['area'] == 'Total' else m['area']
    mo[(str(m['cve_ooad']), ar)] += m['meta_2027'] or 0
    mo[('Nacional', ar)] += m['meta_2027'] or 0
for (nivel, clave, area), v in acc.items():
    meta = mo.get((clave, area), v['meta']) if nivel != 'Unidad Operativa' else v['meta']
    nec = (meta - v['inscripciones']) / restantes if restantes > 0 and meta > v['inscripciones'] else 0.0
    nombre = 'Nacional' if nivel == 'Nacional' else next(uu['ooad'] for uu in uos.values() if str(uu['cve_ooad']) == clave) if nivel == 'OOAD' else uos[clave].get('unidad_operativa') or clave
    padre = '' if nivel == 'Nacional' else 'Nacional' if nivel == 'OOAD' else str(uos[clave]['cve_ooad'])
    av_p = v['proyeccion'] / meta if meta else None
    cum_r = v['real_inscripciones'] / meta if meta else None
    pred.append(dict(nivel=nivel, clave=clave, padre=padre, nombre=nombre, area=area, meta_2027=round(meta), programado_2026=round(v['programado_2026']),
                     inscripciones=round(v['inscripciones']), asistencias=round(v['asistencias']), grupos=v['grupos'],
                     ritmo_diario=round(v['ritmo'], 1), ritmo_necesario=round(nec, 1), dias_habiles_restantes=restantes,
                     proyeccion_cierre=round(v['proyeccion']), asistencias_proyectadas=round(v['asistencias_proyectadas']),
                     avance_proyectado=r2(av_p) if av_p is not None else None, semaforo_proyectado=sem(av_p),
                     factor_cumplimiento_2026=r2(v['real_2026'] / v['programado_2026']) if v['programado_2026'] else None,
                     real_2027_inscripciones=round(v['real_inscripciones']), real_2027_asistencias=round(v['real_asistencias']),
                     cumplimiento_real_estimado=r2(cum_r) if cum_r is not None else None, semaforo_real=sem(cum_r)))
pred.sort(key=lambda p: (p['nivel'], p['clave'], p['area']))
nac = next(p for p in pred if p['nivel'] == 'Nacional' and p['area'] == 'Todas')
os.makedirs(out, exist_ok=True)
dump = lambda n, d: json.dump(d, open(os.path.join(out, n), 'w'), ensure_ascii=False, separators=(',', ':'))
dump('avance_hist.json', hist)
dump('pred_registro.json', pred)
pc_p = os.path.join(datos, 'pred_corte.json')
pc = [c for c in (json.load(open(pc_p)) if os.path.exists(pc_p) else []) if c['fecha_corte'] != ultima]
pc.append(dict(fecha_corte=ultima, cierre=cierre.isoformat(), dias_habiles_restantes=restantes, cortes=len(fechas),
               **{k: nac[k] for k in ('meta_2027', 'inscripciones', 'asistencias', 'ritmo_diario', 'ritmo_necesario', 'proyeccion_cierre', 'asistencias_proyectadas',
                                      'avance_proyectado', 'real_2027_inscripciones', 'real_2027_asistencias', 'cumplimiento_real_estimado')}))
pc.sort(key=lambda c: c['fecha_corte'])
dump('pred_corte.json', pc)
print(json.dumps(pc[-1], ensure_ascii=False))
