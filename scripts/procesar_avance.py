"""Procesa el REPORTE PAA CURSOS (xlsx) para el avance del registro del PAA en el tablero.
Uso: python3 -I procesar_avance.py REPORTE.xlsx unidades_operativas.json instalaciones.json layout_2027.json corte_anterior.json SALIDA_DIR [AAAA-MM-DD]
- Inscripciones = CAN_CUPO; asistencias = CAN_ASISTENCIAS; un registro del reporte es un grupo.
- La fecha de corte se toma del nombre del archivo (..._DDMMAAAA_...) o del último argumento.
- Solo Unidades Operativas del catálogo (sin tiendas ni velatorios). No guarda nombres ni claves de instructores.
Salidas: avance_instalacion.json (unidad, instalación, área), avance_dimension.json (unidad, área, dimensión, valor),
  avance_actividad.json (unidad, área, actividad, con validaciones contra el Layout 2027), avance_catalogo_actividades.json,
  avance_uso.json (tiempos de uso por instalación con mapa de calor por día y hora y horas por mes, sin Centros de Extensión) y avance_corte.json (historial por fecha de corte).
- Si la clave de instalación no está en el catálogo de Instalaciones, el tipo se toma del nombre sin su número final.
- avance_alertas.json: notas de advertencia por grupo (espacio no apto por su nombre, actividad acuática fuera de alberca, actividad no
  acuática en alberca, área de paso u oficina, grupo sin instalación), con la clave del grupo para corregirlo. Sin datos del instructor.
"""
import sys, json, re, os, datetime, collections, openpyxl

xlsx, f_uo, f_inst, f_lay, f_prev, out = sys.argv[1:7]
fecha = sys.argv[7] if len(sys.argv) > 7 else None
if not fecha:
    m = re.search(r'(\d{2})(\d{2})(\d{4})', os.path.basename(xlsx))
    fecha = f'{m.group(3)}-{m.group(2)}-{m.group(1)}' if m else datetime.date.today().isoformat()

AREA = {'CULTURA FÍSICA Y DEPORTE': 'Cultura Física y Deporte', 'PROMOCIÓN DE LA SALUD': 'Promoción de la Salud',
        'CAPACITACION Y ADIESTRAMIENTO TECNICO': 'Capacitación y Adiestramiento Técnico',
        'CAPACITACIÓN Y ADIESTRAMIENTO TÉCNICO': 'Capacitación y Adiestramiento Técnico',
        'DESARROLLO CULTURAL': 'Desarrollo Cultural', 'CECART': 'CECART', 'CASSAAM': 'CASSAAM'}
NEED = ['REF_HORA_TERMINO', 'DES_DIAS_SEMANA_NOM', 'CVE_OOAD', 'CVE_UOPSI', 'CVE_CEC', 'CVE_INSTALACION', 'DES_INSTALACION', 'DES_AREA', 'CVE_ACTIVIDAD', 'DES_ACTIVIDAD',
        'DES_TIPO_ACTIVIDAD', 'DES_TIPO_CURSO', 'TIPO_INSTRUCTOR', 'FEC_FECHA_INICIO', 'FEC_FECHA_TERMINO', 'REF_HORA_INICIO',
        'CAN_CUPO', 'CAN_ASISTENCIAS', 'CVE_MES', 'CAN_CLASES', 'NUM_EDAD_MIN', 'NUM_EDAD_MAX']
OPC = ['DES_BLOQUE', 'NOM_ESTRATEGIA', 'CVE_ESTRATEGIA', 'NUM_PORCENTAJE_PAGO', 'CVE_GRUPO_ID', 'CVE_GRUPO']

uo = {r['cve_uo']: r for r in json.load(open(f_uo))}
inst = {r['cve_instalacion']: r for r in json.load(open(f_inst))}
lay = {r['clave']: r for r in json.load(open(f_lay))}
prev = json.load(open(f_prev)) if f_prev != '-' else []

wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
hdr = None
for ws in wb.worksheets:  # el encabezado puede estar en cualquier hoja (p. ej. si hay una tabla dinámica antes)
    ws.reset_dimensions()
    it = ws.iter_rows(values_only=True)
    for r in it:
        if r and 'CAN_CUPO' in r and 'CVE_OOAD' in r:
            hdr = list(r)
            break
    if hdr:
        break
if not hdr:
    sys.exit('No encontré el encabezado (CVE_OOAD, CAN_CUPO): el archivo no es un REPORTE PAA CURSOS.')
falt = [c for c in NEED if c not in hdr]
if falt:
    sys.exit('Faltan columnas: ' + ', '.join(falt))
I = {c: hdr.index(c) for c in NEED + [c for c in OPC if c in hdr]}

def num(v, d=0):
    try: return float(str(v).strip())
    except (TypeError, ValueError): return d

def fecha_de(v):
    if isinstance(v, datetime.datetime): return v.date()
    if isinstance(v, datetime.date): return v
    s = str(v).strip()[:10]
    for f in ('%Y-%m-%d', '%d/%m/%Y'):
        try: return datetime.datetime.strptime(s, f).date()
        except ValueError: pass
    return None

DIAS = {'lun': 0, 'mar': 1, 'mie': 2, 'mié': 2, 'jue': 3, 'vie': 4, 'sab': 5, 'sáb': 5, 'dom': 6}
def dias_de(v):
    out = set()
    for p in str(v or '').split(','):
        k = p.strip().lower()[:3]
        if k in DIAS: out.add(DIAS[k])
    return out

def minutos(v):
    try:
        hh, mm = str(v).strip()[:5].split(':')
        return int(hh) * 60 + int(mm)
    except ValueError:
        return None

USO = collections.defaultdict(list)

def franja(h):
    try: hh = int(str(h).strip()[:2])
    except ValueError: return 'Sin horario'
    return 'Matutino (antes de 12:00)' if hh < 12 else 'Vespertino (12:00 a 17:59)' if hh < 18 else 'Nocturno (18:00 o después)'

def duracion(ini, fin):
    if not ini or not fin: return 'Sin fechas'
    sem = ((fin - ini).days + 1) / 7
    return 'Hasta 4 semanas' if sem <= 4 else '5 a 8 semanas' if sem <= 8 else '9 a 12 semanas' if sem <= 12 else '13 a 24 semanas' if sem <= 24 else 'Más de 24 semanas'

Z = lambda: dict(grupos=0, inscripciones=0, asistencias=0, clases=0)
AGG_I, AGG_D, AGG_A = collections.defaultdict(Z), collections.defaultdict(Z), collections.defaultdict(Z)
AGG_V = collections.defaultdict(lambda: dict(grupos_clave_vigente=0, grupos_cumplen_meta_minima=0, grupos_edad_en_rango=0, grupos_con_pago=0))
acts, insts = {}, {}
ALERTAS = []

# Notas de advertencia del registro: reglas sobre el nombre del espacio y el tipo de actividad (ver el apartado en el tablero).
SIN_AC = str.maketrans('ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu')
low = lambda v: ' ' + re.sub(r'\s+', ' ', str(v or '').translate(SIN_AC).lower()) + ' '
RX_NO_APTO = re.compile(r'sanitari|\bbanos?\b|\bwc\b|regadera|vestidor|bodega|almacen|estacionamiento|cuarto de maquinas|caseta|cisterna|azotea|cuarto de aseo|intendencia|basura')
RX_PASO = re.compile(r'vestibulo|pasillo|escalera|recepcion|oficina|cubiculo|\bdireccion\b|administraci|sala de espera')
RX_ALBERCA = re.compile(r'alberca|chapoteadero|fosa de clavados|piscina')
RX_ACUATICA = re.compile(r'natacion|clavados|polo acuatic|acuatic|aquaer|acuaer|hidrogimnasia|hidroterapia|matronatacion|nado sincronizado|buceo|salvavidas|aquazumba|acuazumba')
REGLAS = {
    'no_apto': ('Alerta', 'Espacio no apto por su nombre (sanitarios, bodegas, estacionamiento u otros servicios)'),
    'acuatica_fuera': ('Alerta', 'Actividad acuática fuera de alberca'),
    'no_acuatica_alberca': ('Revisar', 'Actividad no acuática en alberca'),
    'paso': ('Revisar', 'Área de paso u oficina (vestíbulo, pasillo, oficina, cubículo)'),
    'sin_instalacion': ('Revisar', 'Grupo sin instalación asignada'),
}
def reglas_de(nom_rep, cat, es_cec, actividad, agrupacion):
    """Devuelve las reglas que incumple un grupo según el nombre de su espacio y su actividad."""
    n = low(nom_rep) + (low(cat.get('nombre_instalacion')) + low(cat.get('servicio')) + low(cat.get('subtipo_instalacion')) if cat else '')
    acuatica = bool(RX_ACUATICA.search(low(actividad))) or low(agrupacion).strip() == 'actividades acuaticas'
    alberca = bool(RX_ALBERCA.search(n)) or (cat or {}).get('tipo_instalacion') == 'Instalaciones Deportivas Acuáticas'
    out = []
    if es_cec:
        return out  # en los Centros de Extensión el espacio no está en el catálogo de instalaciones
    if low(nom_rep).strip() in ('', 'sin instalacion', 'none'):
        out.append('sin_instalacion')
    if RX_NO_APTO.search(n): out.append('no_apto')
    elif RX_PASO.search(n): out.append('paso')
    if acuatica and not alberca and 'sin_instalacion' not in out: out.append('acuatica_fuera')
    if alberca and not acuatica: out.append('no_acuatica_alberca')
    return out
n = fuera = 0
for r in it:
    if not r or r[I['CVE_OOAD']] in (None, ''): continue
    r = list(r) + [None] * (len(hdr) - len(r))
    try: o, u = int(r[I['CVE_OOAD']]), int(r[I['CVE_UOPSI']])
    except (TypeError, ValueError): continue
    cu = o * 1000 + u
    if cu not in uo:
        fuera += 1
        continue
    n += 1
    unidad = f'{o}-{u}'
    area = AREA.get(str(r[I['DES_AREA']]).strip().upper(), str(r[I['DES_AREA']]).strip())
    ck = r[I['CVE_INSTALACION']]
    try: ck = int(ck)
    except (TypeError, ValueError): pass
    if str(r[I['CVE_CEC']]).strip() not in ('0', '', 'None'):
        key, nom, tipo = 'CEC', 'Centros de Extensión', 'Centro de Extensión'
    elif ck in inst:
        key, nom, tipo = str(ck), inst[ck]['nombre_instalacion'], inst[ck]['tipo_instalacion']
    else:
        nm = str(r[I['DES_INSTALACION']]).strip()
        key, nom, tipo = str(ck), nm, (re.sub(r'\s+\d+$', '', nm).strip().capitalize() if nm and nm.upper() != 'SIN INSTALACION' else 'Sin instalación')
    insts[(unidad, key)] = (nom, tipo)
    clave = str(r[I['CVE_ACTIVIDAD']]).strip()
    L = lay.get(clave)
    if clave not in acts:
        acts[clave] = dict(clave_actividad=clave, actividad=str(r[I['DES_ACTIVIDAD']]).strip(),
                           tipo_actividad=str(r[I['DES_TIPO_ACTIVIDAD']]).strip(),
                           bloque=str(r[I['DES_BLOQUE']]).strip() if 'DES_BLOQUE' in I and r[I['DES_BLOQUE']] else (L['agrupacion'] if L else ''),
                           estrategia=str(r[I['NOM_ESTRATEGIA']]).strip() if 'NOM_ESTRATEGIA' in I and r[I['NOM_ESTRATEGIA']] else (L['estrategia'] if L else ''),
                           en_catalogo_2027='Sí' if L else 'No',
                           meta_minima=L['meta_minima'] if L else None)
    ini, fin = fecha_de(r[I['FEC_FECHA_INICIO']]), fecha_de(r[I['FEC_FECHA_TERMINO']])
    if key != 'CEC' and tipo != 'Sin instalación' and ini and fin:
        hi, hf, ds = minutos(r[I['REF_HORA_INICIO']]), minutos(r[I['REF_HORA_TERMINO']]), dias_de(r[I['DES_DIAS_SEMANA_NOM']])
        if hi is not None and hf is not None and hf > hi and ds:
            USO[(unidad, key)].append((ini, max(fin, ini), ds, hi, hf))
    mes = int(num(r[I['CVE_MES']], ini.month if ini else 0)) or (ini.month if ini else 0)
    cupo = num(r[I['CAN_CUPO']])
    for rg in reglas_de(r[I['DES_INSTALACION']], inst.get(ck), key == 'CEC', r[I['DES_ACTIVIDAD']], L['agrupacion'] if L else ''):
        ALERTAS.append(dict(unidad=unidad, area=area, regla=rg, nivel=REGLAS[rg][0],
                            grupo=str(r[I['CVE_GRUPO_ID']]).strip() if 'CVE_GRUPO_ID' in I else (str(r[I['CVE_GRUPO']]).strip() if 'CVE_GRUPO' in I else ''),
                            cve_instalacion=key, instalacion=re.sub(r'\s+', ' ', str(r[I['DES_INSTALACION']] or '')).strip().capitalize(),
                            clave_actividad=clave, actividad=str(r[I['DES_ACTIVIDAD']] or '').strip().capitalize().replace('Imss', 'IMSS').replace(' imss', ' IMSS'),
                            mes=mes, inscripciones=int(cupo) if float(cupo).is_integer() else cupo))
    emin, emax = num(r[I['NUM_EDAD_MIN']], None), num(r[I['NUM_EDAD_MAX']], None)
    vals = dict(grupos=1, inscripciones=cupo, asistencias=num(r[I['CAN_ASISTENCIAS']]), clases=num(r[I['CAN_CLASES']]))
    def acum(d, k):
        for x, v in vals.items(): d[k][x] += v
    acum(AGG_I, (unidad, key, area))
    dims = {'Tipo de docente': str(r[I['TIPO_INSTRUCTOR']] or 'Sin tipo').strip().capitalize(),
            'Mes de inicio': f'{mes:02d}', 'Franja horaria': franja(r[I['REF_HORA_INICIO']]),
            'Duración del grupo': duracion(ini, fin), 'Tipo de curso': str(r[I['DES_TIPO_CURSO']] or 'Sin tipo').strip().capitalize(),
            'Tipo de actividad': acts[clave]['tipo_actividad'].capitalize(), 'Estrategia': acts[clave]['estrategia'] or 'Sin estrategia',
            'Lugar': 'Centro de Extensión' if key == 'CEC' else 'Instalación de la Unidad Operativa'}
    for dn, dv in dims.items(): acum(AGG_D, (unidad, area, dn, dv))
    acum(AGG_A, (unidad, area, clave))
    v = AGG_V[(unidad, area, clave)]
    if L:
        v['grupos_clave_vigente'] += 1
        if L['meta_minima'] is not None and cupo >= float(L['meta_minima']): v['grupos_cumplen_meta_minima'] += 1
        lmin, lmax = int(L['edad_minima']), int(L['edad_maxima'])
        if lmax == 0 or (emin is not None and emax is not None and emin >= lmin and emax <= lmax): v['grupos_edad_en_rango'] += 1
    if 'NUM_PORCENTAJE_PAGO' in I and num(r[I['NUM_PORCENTAJE_PAGO']]) > 0: v['grupos_con_pago'] += 1

# Tiempos de uso por instalación (bloques de 15 minutos). Solo cuenta el tiempo con actividad:
# horario = de la primera a la última hora con grupos (horas completas); días = los días de la semana con grupos;
# periodo = de la primera a la última fecha con grupos. Disponibles = fechas del periodo en esos días × horas del horario;
# ocupadas = bloques con al menos un grupo (los traslapes cuentan una sola vez).
# heat: 7 días × 17 horas (06:00 a 22:59), % de las fechas de ese día de la semana en el periodo con algún grupo en esa hora.
# mes_ocupadas / mes_disponibles: horas por mes (enero a diciembre) para calcular la ocupación mensual.
DC = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
def dias_txt(ds):
    ds = sorted(ds)
    if len(ds) >= 3 and ds == list(range(ds[0], ds[-1] + 1)):
        return DC[ds[0]] + ' a ' + DC[ds[-1]]
    return ', '.join(DC[i] for i in ds)
uso_rows = []
for (unidad, key), gs in USO.items():
    h0 = min(g[3] for g in gs) // 60 * 60
    h1 = -(-max(g[4] for g in gs) // 60) * 60
    nh = (h1 - h0) / 60
    dias = set().union(*[g[2] for g in gs])
    d0, d1 = min(g[0] for g in gs), max(g[1] for g in gs)
    fechas = bloques = con_uso = 0
    bloques_grupo = 0
    f_dia = [0] * 7
    hit = [[0] * 17 for _ in range(7)]
    hora_tot = collections.Counter()
    m_occ, m_disp = [0.0] * 12, [0.0] * 12
    d = d0
    while d <= d1:
        wd = d.weekday()
        if wd in dias:
            fechas += 1
            f_dia[wd] += 1
            occ = set()
            for (gi, gf, gd, a, b) in gs:
                if gi <= d <= gf and wd in gd:
                    bl = range(a // 15, -(-b // 15))
                    occ.update(bl)
                    bloques_grupo += len(bl)
            bloques += len(occ)
            if occ: con_uso += 1
            hrs = {x // 4 for x in occ}
            for h in hrs:
                hora_tot[h] += 1
                if 6 <= h <= 22: hit[wd][h - 6] += 1
            m_occ[d.month - 1] += len(occ) / 4
            m_disp[d.month - 1] += nh
        d += datetime.timedelta(days=1)
    horas_disp = fechas * nh
    horas_occ = bloques / 4
    semanas = ((d1 - d0).days + 1) / 7
    hp, hpn = (max(hora_tot.items(), key=lambda kv: (kv[1], -kv[0])) if hora_tot else (None, 0))
    r2 = lambda v: round(v, 2)
    uso_rows.append(dict(unidad=unidad, cve_instalacion=key, grupos=len(gs),
        horario=f'{h0 // 60:02d}:00 a {h1 // 60:02d}:00', horas_dia=int(nh) if nh.is_integer() else r2(nh),
        dias=dias_txt(dias), dias_n=len(dias),
        fecha_inicio=d0.isoformat(), fecha_termino=d1.isoformat(), fechas_con_actividad=fechas, fechas_con_uso=con_uso,
        horas_grupo=r2(bloques_grupo / 4), horas_disponibles=r2(horas_disp), horas_ocupadas=r2(horas_occ),
        ocupacion=round(horas_occ / horas_disp, 4) if horas_disp else None,
        horas_semana=round(horas_occ / semanas, 1), horas_semana_disp=round(horas_disp / semanas, 1),
        hora_pico=f'{hp:02d}:00' if hp is not None else None, ocup_hora_pico=round(hpn / fechas, 4) if fechas else None,
        heat=','.join(str(round(hit[w][h] * 100 / f_dia[w])) if f_dia[w] else '0' for w in range(7) for h in range(17)),
        mes_ocupadas=','.join(str(r2(v)) for v in m_occ), mes_disponibles=','.join(str(r2(v)) for v in m_disp)))

ent = lambda v: int(v) if float(v).is_integer() else round(v, 2)
os.makedirs(out, exist_ok=True)
dump = lambda name, data: json.dump(data, open(out + '/' + name, 'w'), ensure_ascii=False, separators=(',', ':'))
rows = [dict(unidad=k[0], cve_instalacion=k[1], area=k[2], **{x: ent(v) for x, v in b.items()}) for k, b in AGG_I.items()]
dump('avance_instalacion.json', rows)
dump('avance_dimension.json', [dict(unidad=k[0], area=k[1], dimension=k[2], valor=k[3], **{x: ent(v) for x, v in b.items()}) for k, b in AGG_D.items()])
dump('avance_actividad.json', [dict(unidad=k[0], area=k[1], clave_actividad=k[2], **{x: ent(v) for x, v in b.items()}, **AGG_V[k]) for k, b in AGG_A.items()])
dump('avance_catalogo_actividades.json', list(acts.values()))
dump('avance_uso.json', uso_rows)
dump('avance_alertas.json', ALERTAS)
dump('avance_instalaciones.json', [dict(unidad=k[0], cve_instalacion=k[1], instalacion=v[0], tipo_instalacion=v[1]) for k, v in insts.items()])
T = lambda f: sum(r[f] for r in rows)
corte = dict(fecha_corte=fecha, grupos=T('grupos'), inscripciones=T('inscripciones'), asistencias=T('asistencias'),
             unidades=len({r['unidad'] for r in rows}), instalaciones=len({(r['unidad'], r['cve_instalacion']) for r in rows}),
             grupos_fuera_universo=fuera, grupos_con_advertencia=len({(a['unidad'], a['grupo'], a['clave_actividad']) for a in ALERTAS}),
             advertencias={k: sum(1 for a in ALERTAS if a['regla'] == k) for k in REGLAS})
hist = [p for p in prev if p.get('fecha_corte') != fecha] + [corte]
hist.sort(key=lambda p: p['fecha_corte'])
dump('avance_corte.json', hist)
print(json.dumps(dict(corte, tamanos={f: os.path.getsize(out + '/' + f) for f in os.listdir(out)}), ensure_ascii=False))
