"""Procesa el REPORTE PAA ACTIVIDADES COMPLEMENTARIAS (xlsx) para el seguimiento del registro en el tablero PAA 2027 (Módulo 2).
Uso: python3 -I procesar_complementarias.py REPORTE.xlsx unidades_operativas.json instalaciones.json corte_anterior.json|- SALIDA_DIR [AAAA-MM-DD]
- Un renglón del reporte es una actividad complementaria registrada (grupo). Asistencias = CAN_ASISTENCIA (o CAN_ASISTENCIAS); cupo = CAN_CUPO.
- La fecha de corte se toma del nombre del archivo (..._DDMMAAAA_...) o del último argumento.
- Solo Unidades Operativas del catálogo (sin tiendas ni velatorios). No guarda nombres ni claves de instructores.
- Es seguimiento del registro: no compara contra metas.
Salidas: ac_instalacion.json (unidad, lugar, área), ac_detalle.json (unidad, área, actividad, mes, tipo de docente),
  ac_catalogo.json (actividades), ac_lugares.json (nombres de instalaciones y Centros de Extensión) y ac_corte.json (historial por fecha de corte).
"""
import sys, json, re, os, datetime, collections, openpyxl

xlsx, f_uo, f_inst, f_prev, out = sys.argv[1:6]
fecha = sys.argv[6] if len(sys.argv) > 6 else None
if not fecha:
    m = re.search(r'_(\d{2})(\d{2})(\d{4})(?:_|\.)', os.path.basename(xlsx))
    fecha = f'{m.group(3)}-{m.group(2)}-{m.group(1)}' if m else datetime.date.today().isoformat()

AREA = {'PROMOCION DE LA SALUD': 'Promoción de la Salud', 'DESARROLLO CULTURAL': 'Desarrollo Cultural',
        'CULTURA FISICA Y DEPORTE': 'Cultura Física y Deporte', 'CAPACITACION Y ADIESTRAMIENTO TECNICO': 'Capacitación y Adiestramiento Técnico',
        'CASSAAM': 'CASSAAM', 'CECART': 'CECART'}
SIN_ACENTO = str.maketrans('ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu')
def norm(v):
    return re.sub(r'[\s_]+', '_', str(v or '').strip().upper().translate(SIN_ACENTO))

NEED = ['CVE_OOAD', 'CVE_UOPSI', 'CVE_CEC', 'DES_CEC', 'CVE_INSTALACION', 'DES_INSTALACION', 'DES_AREA',
        'DES_TIPO_DE_ACTIVIDAD', 'DES_BLOQUE', 'NOM_ESTRATEGIA', 'CVE_ACTIVIDAD', 'DES_ACTIVIDAD', 'TIPO_INSTRUCTOR',
        'FEC_FECHA_INICIO', 'CAN_CUPO', 'CVE_MES', 'CAN_CLASES']

uo = {r['cve_uo']: r for r in json.load(open(f_uo))}
inst = {r['cve_instalacion']: r for r in json.load(open(f_inst))}
prev = json.load(open(f_prev)) if f_prev != '-' else []

wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
ws = wb.worksheets[0]
ws.reset_dimensions()
it = ws.iter_rows(values_only=True)
hdr = None
for r in it:
    if r and any(norm(c) == 'CAN_CUPO' for c in r) and any(norm(c) == 'CVE_OOAD' for c in r):
        hdr = [norm(c) for c in r]
        break
if not hdr:
    sys.exit('No encontré el encabezado (CVE_OOAD, CAN_CUPO): el archivo no es un REPORTE PAA ACTIVIDADES COMPLEMENTARIAS.')
ASIS = 'CAN_ASISTENCIA' if 'CAN_ASISTENCIA' in hdr else 'CAN_ASISTENCIAS' if 'CAN_ASISTENCIAS' in hdr else None
falt = [c for c in NEED if c not in hdr] + ([] if ASIS else ['CAN_ASISTENCIA'])
if falt:
    sys.exit('Faltan columnas: ' + ', '.join(falt))
I = {c: hdr.index(c) for c in NEED + [ASIS]}

def num(v, d=0):
    try: return float(str(v).strip())
    except (TypeError, ValueError): return d

def fecha_de(v):
    if isinstance(v, datetime.datetime): return v.date()
    if isinstance(v, datetime.date): return v
    s = str(v or '').strip()[:10]
    for f in ('%d/%m/%Y', '%Y-%m-%d'):
        try: return datetime.datetime.strptime(s, f).date()
        except ValueError: pass
    return None

def ent(v):
    try: return int(str(v).strip())
    except (TypeError, ValueError): return str(v or '').strip()

def txt(v):
    s = re.sub(r'\s+', ' ', str(v or '')).strip()
    return s

Z = lambda: dict(grupos=0, cupo=0, asistencias=0, clases=0)
AGG_L, AGG_D = collections.defaultdict(Z), collections.defaultdict(Z)
cat, lugares = {}, {}
n = fuera = 0
for r in it:
    if not r or r[I['CVE_OOAD']] in (None, ''): continue
    r = list(r) + [None] * (len(hdr) - len(r))
    try: o, u = int(str(r[I['CVE_OOAD']]).strip()), int(str(r[I['CVE_UOPSI']]).strip())
    except (TypeError, ValueError): continue
    if o * 1000 + u not in uo:
        fuera += 1
        continue
    n += 1
    unidad = f'{o}-{u}'
    area = AREA.get(norm(r[I['DES_AREA']]).replace('_', ' '), txt(r[I['DES_AREA']]).title())
    cec = ent(r[I['CVE_CEC']])
    ck = ent(r[I['CVE_INSTALACION']])
    ni = txt(r[I['DES_INSTALACION']])
    if cec not in (0, '', '0'):
        key, nom, tipo, lugar = 'CEC-' + str(cec), txt(r[I['DES_CEC']]).title(), 'Centro de Extensión', 'Centro de Extensión'
    elif norm(ni) == 'SIN_INSTALACION' or ni == '':
        key, nom, tipo, lugar = 'SIN', 'Sin instalación', 'Sin instalación', 'Sin instalación asignada'
    else:
        key = str(ck)
        if ck in inst: nom, tipo = inst[ck]['nombre_instalacion'], inst[ck]['tipo_instalacion']
        else: nom, tipo = ni.capitalize(), re.sub(r'\s+\d+$', '', ni).strip().capitalize()
        lugar = 'Instalación de la Unidad Operativa'
    lugares[(unidad, key)] = (nom, tipo, lugar)
    clave = str(ent(r[I['CVE_ACTIVIDAD']]))
    if clave not in cat:
        cat[clave] = dict(clave_actividad=clave, actividad=txt(r[I["DES_ACTIVIDAD"]]).capitalize().replace('Imss', 'IMSS').replace(' imss', ' IMSS'),
                          tipo_actividad=txt(r[I['DES_TIPO_DE_ACTIVIDAD']]).capitalize(),
                          bloque=txt(r[I['DES_BLOQUE']]).capitalize(), estrategia=txt(r[I['NOM_ESTRATEGIA']]))
    ini = fecha_de(r[I['FEC_FECHA_INICIO']])
    mes = int(num(r[I['CVE_MES']], ini.month if ini else 0)) or (ini.month if ini else 0)
    doc = txt(r[I['TIPO_INSTRUCTOR']]).capitalize() or 'Sin tipo'
    vals = dict(grupos=1, cupo=num(r[I['CAN_CUPO']]), asistencias=num(r[I[ASIS]]), clases=num(r[I['CAN_CLASES']]))
    for d, k in ((AGG_L, (unidad, key, area)), (AGG_D, (unidad, area, clave, mes, doc))):
        for x, v in vals.items(): d[k][x] += v

e = lambda v: int(v) if float(v).is_integer() else round(v, 2)
os.makedirs(out, exist_ok=True)
dump = lambda name, data: json.dump(data, open(out + '/' + name, 'w'), ensure_ascii=False, separators=(',', ':'))
rl = [dict(unidad=k[0], lugar_clave=k[1], area=k[2], **{x: e(v) for x, v in b.items()}) for k, b in AGG_L.items()]
dump('ac_instalacion.json', rl)
dump('ac_detalle.json', [dict(unidad=k[0], area=k[1], clave_actividad=k[2], mes=k[3], tipo_docente=k[4], **{x: e(v) for x, v in b.items()}) for k, b in AGG_D.items()])
dump('ac_catalogo.json', list(cat.values()))
dump('ac_lugares.json', [dict(unidad=k[0], lugar_clave=k[1], nombre=v[0], tipo=v[1], lugar=v[2]) for k, v in lugares.items()])
T = lambda f: e(sum(r[f] for r in rl))
corte = dict(fecha_corte=fecha, actividades=T('grupos'), asistencias=T('asistencias'), cupo=T('cupo'),
             unidades=len({r['unidad'] for r in rl}), grupos_fuera_universo=fuera)
hist = [c for c in prev if c.get('fecha_corte') != fecha] + [corte]
hist.sort(key=lambda c: c['fecha_corte'])
dump('ac_corte.json', hist)
print(json.dumps(dict(**corte, tamanos={f: os.path.getsize(out + '/' + f) for f in os.listdir(out)}), ensure_ascii=False))
