"""Cruza el registro del PAA 2027 con la base de instalaciones HRI 2027 para saber qué instalaciones PROGRAMABLES tienen registro.
Uso: python3 -I procesar_programables.py hri_2027.json unidades_operativas.json avance_inst_reg.json ac_inst_reg.json avance_corte.json corte_anterior.json|- SALIDA_DIR
- La HRI no comparte clave de instalación con los reportes: se une por clave de OOAD, clave de UOPSI, clave de Centro de Extensión
  y nombre de la instalación (sin acentos, mayúsculas, espacios normalizados).
- Si el nombre reportado no trae número (p. ej. «AULA LÚDICA») y en esa unidad hay una sola instalación con ese nombre base
  («AULA LÚDICA 1»), se une con ella y se marca como unión por nombre base.
- Universo: unidades del catálogo de Unidades Operativas (sin tiendas ni velatorios).
Salidas:
  ip_instalaciones.json  instalaciones programables de la HRI y las no programables que tienen registro (id, unidad, CEC, nombre, servicio...)
  ip_registro.json       registro por instalación (id) y área: grupos, inscripciones y asistencias de cursos y talleres; actividades y asistencias complementarias
  ip_sin_catalogo.json   registro que no se pudo unir con una instalación de la HRI, con el motivo
  ip_corte.json          resumen por fecha de corte
"""
import sys, json, re, os, collections, unicodedata

f_hri, f_uo, f_cu, f_ac, f_cc, f_prev, out = sys.argv[1:8]
uo = {r['cve_uo']: r for r in json.load(open(f_uo))}
hri = json.load(open(f_hri))
cu = json.load(open(f_cu)) if os.path.exists(f_cu) else []
ac = json.load(open(f_ac)) if os.path.exists(f_ac) else []
fecha = sorted(json.load(open(f_cc)), key=lambda c: c['fecha_corte'])[-1]['fecha_corte']
prev = json.load(open(f_prev)) if f_prev != '-' and os.path.exists(f_prev) else []


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().upper()
    return re.sub(r'\s+', ' ', re.sub(r'[^A-Z0-9 ]', ' ', s)).strip()


base = lambda s: re.sub(r'\s+\d+$', '', s).strip()
H = {}
for i, r in enumerate(hri):
    r['id'] = i
    if r['cve_ooad'] * 1000 + r['cve_uopsi'] in uo:
        H[(r['cve_ooad'], r['cve_uopsi'], r['cve_cec'], norm(r['instalacion']))] = r
por_base = collections.defaultdict(list)
for k, r in H.items(): por_base[k[:3] + (base(k[3]),)].append(r)
unidades_hri = {k[:2] for k in H}

REG = collections.defaultdict(lambda: dict(cu_grupos=0, cu_inscripciones=0, cu_asistencias=0, ac_grupos=0, ac_asistencias=0))
SIN = collections.defaultdict(lambda: dict(grupos=0, inscripciones=0, asistencias=0))
union = {}
e = lambda v: int(v) if float(v).is_integer() else round(v, 2)
for mod, rows in (('cu', cu), ('ac', ac)):
    for x in rows:
        o, u, c, nom = int(x['cve_ooad']), int(x['cve_uopsi']), int(x['cve_cec'] or 0), x['instalacion']
        if o * 1000 + u not in uo: continue
        k = (o, u, c, norm(nom))
        r, como = H.get(k), 'nombre'
        if not r and not re.search(r'\d$', k[3]):
            cand = por_base.get(k[:3] + (k[3],), [])
            if len(cand) == 1: r, como = cand[0], 'nombre base'
        if r:
            union[r['id']] = como if union.get(r['id']) != 'nombre' else 'nombre'
            g = REG[(r['id'], x['area'])]
            if mod == 'cu':
                g['cu_grupos'] += x['grupos']; g['cu_inscripciones'] += x['inscripciones']; g['cu_asistencias'] += x['asistencias']
            else:
                g['ac_grupos'] += x['grupos']; g['ac_asistencias'] += x['asistencias']
            continue
        if norm(nom) in ('', 'SIN INSTALACION', 'NONE'):
            motivo = 'Centro de Extensión sin instalación registrada' if c else 'Grupo sin instalación asignada'
        elif (o, u) not in unidades_hri:
            motivo = 'La Unidad Operativa no está en la base de instalaciones'
        else:
            motivo = 'La instalación no está en la base de instalaciones de la unidad'
        s = SIN[(f'{o}-{u}', c, nom, motivo, x['area'], 'Cursos y talleres' if mod == 'cu' else 'Actividades complementarias')]
        s['grupos'] += x['grupos']
        s['inscripciones'] += x.get('inscripciones', 0) if mod == 'cu' else 0
        s['asistencias'] += x['asistencias']

ids_reg = {k[0] for k in REG}
inst = [dict(id=r['id'], unidad=f"{r['cve_ooad']}-{r['cve_uopsi']}", cve_ooad=r['cve_ooad'], cve_cec=r['cve_cec'], cec=r['cec'],
             instalacion=r['instalacion'], servicio=r['servicio'], tipo_instalacion=r['tipo_instalacion'], nivel=r['nivel'],
             programable=r['programable'], estatus=r['estatus'] or 'Sin incidencia', multigrupo=r['multigrupo'], superficie=r['superficie'],
             union=union.get(r['id'], ''))
        for r in H.values() if r['programable'] == 'SI' or r['id'] in ids_reg]
inst.sort(key=lambda r: r['id'])
os.makedirs(out, exist_ok=True)
dump = lambda name, data: json.dump(data, open(os.path.join(out, name), 'w'), ensure_ascii=False, separators=(',', ':'))
dump('ip_instalaciones.json', inst)
dump('ip_registro.json', [dict(id=k[0], area=k[1], **{x: e(v) for x, v in g.items()}) for k, g in sorted(REG.items())])
dump('ip_sin_catalogo.json', [dict(unidad=k[0], cve_cec=k[1], instalacion=k[2], motivo=k[3], area=k[4], modulo=k[5], **{x: e(v) for x, v in g.items()}) for k, g in SIN.items()])
P = [r for r in inst if r['programable'] == 'SI']
corte = dict(fecha_corte=fecha, programables=len(P), programables_con_registro=sum(r['id'] in ids_reg for r in P),
             no_programables_con_registro=sum(r['programable'] == 'NO' for r in inst),
             grupos_sin_catalogo=e(sum(g['grupos'] for g in SIN.values())), unidades=len({r['unidad'] for r in P}))
hist = [c for c in prev if c.get('fecha_corte') != fecha] + [corte]
hist.sort(key=lambda c: c['fecha_corte'])
dump('ip_corte.json', hist)
print(json.dumps(dict(corte, tamanos={f: os.path.getsize(os.path.join(out, f)) for f in os.listdir(out)}), ensure_ascii=False))
