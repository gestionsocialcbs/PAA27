"""Procesa el reporte REAL de inscripciones y asistencias a cursos y talleres (Inscritos_DDMMAAAA.csv|xlsx, carpeta Reportes Real)
para el comparativo programado contra real del tablero PAA 2027 (Módulo 1).
Uso: python3 -I procesar_real_cursos.py REPORTE.csv|xlsx unidades_operativas.json corte_anterior.json|- SALIDA_DIR [AAAA-MM-DD] [--inscripciones=max|suma|altas]
- Un renglón es un grupo en un mes (CVE_MES). Asistencias reales = CAN_ASISTENCIAS, sumadas por mes.
- Inscripciones reales por grupo (CAN_INSCRITOS): el reporte repite el grupo en cada mes, por lo que se toma por omisión el
  máximo de CAN_INSCRITOS del grupo en el año (--inscripciones=max); también se calculan la suma de todos los meses y el primer mes
  más las altas posteriores, para validar el criterio. Las inscripciones se asignan al mes de inicio del grupo.
- Solo Unidades Operativas del catálogo. No guarda nombres ni claves de instructores ni otros datos personales.
Salidas: ri_registro.json (unidad, área, mes), ri_actividad.json (unidad, área, actividad), ri_catalogo.json y ri_corte.json.
"""
import sys, json, re, os, datetime, collections, openpyxl

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
METODO = opts.get('inscripciones', 'max')
src, f_uo, f_prev, out = args[:4]
fecha = args[4] if len(args) > 4 else None
if not fecha:
    b = os.path.basename(src)
    m = re.search(r'(\d{2})[_-](\d{2})[_-](\d{4})', b) or re.search(r'_(\d{2})(\d{2})(\d{4})(?:_|\.)', b)
    fecha = f'{m.group(3)}-{m.group(2)}-{m.group(1)}' if m else datetime.date.today().isoformat()

SIN_ACENTO = str.maketrans('ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu')
norm = lambda v: re.sub(r'[\s_]+', '_', str(v or '').strip().upper().translate(SIN_ACENTO))
AREA = {'PROMOCION_DE_LA_SALUD': 'Promoción de la Salud', 'DESARROLLO_CULTURAL': 'Desarrollo Cultural',
        'CULTURA_FISICA_Y_DEPORTE': 'Cultura Física y Deporte', 'CAPACITACION_Y_ADIESTRAMIENTO_TECNICO': 'Capacitación y Adiestramiento Técnico',
        'CASSAAM': 'CASSAAM', 'CECART': 'CECART'}


def filas_de(path):
    """Renglones del reporte: CSV (cualquier separador , ; | o tabulador; UTF-8 o Latin-1) o Excel (todas las hojas)."""
    import csv, zipfile
    if not zipfile.is_zipfile(path):
        raw = open(path, 'rb').read(200000)
        enc = 'utf-8-sig'
        try: raw.decode('utf-8')
        except UnicodeDecodeError: enc = 'latin-1'
        muestra = raw.decode(enc, errors='ignore')
        try: sep = csv.Sniffer().sniff(muestra.split('\n', 1)[0] + '\n', delimiters=',;|\t').delimiter
        except csv.Error: sep = ','
        csv.field_size_limit(10 ** 8)
        with open(path, newline='', encoding=enc, errors='replace') as fh:
            for r in csv.reader(fh, delimiter=sep):
                yield [c.strip() if c.strip() != '' else None for c in r]
        return
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    for ws in wb.worksheets:
        ws.reset_dimensions()
        yield from ws.iter_rows(values_only=True)


def num(v):
    try: return float(str(v).strip().replace(',', ''))
    except (TypeError, ValueError): return 0.0


def fdate(v):
    if isinstance(v, datetime.datetime): return v.date()
    if isinstance(v, datetime.date): return v
    s = str(v or '').strip()[:10]
    for f in ('%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y'):
        try: return datetime.datetime.strptime(s, f).date()
        except ValueError: pass
    return None


uo = {r['cve_uo'] for r in json.load(open(f_uo))}
prev = json.load(open(f_prev)) if f_prev != '-' else []

it = filas_de(src)
hdr = None
for r in it:
    h = [norm(c) for c in r] if r else []
    if 'CVE_OOAD' in h and 'CAN_INSCRITOS' in h:
        hdr = h; break
if not hdr:
    sys.exit('No encontré el encabezado (CVE_OOAD, CAN_INSCRITOS): el archivo no es el reporte de Inscritos.')
GRUPO = 'CVE_GRUPO_ID' if 'CVE_GRUPO_ID' in hdr else 'CVE_GRUPO'
NEED = ['CVE_OOAD', 'CVE_UOPSI', 'DES_AREA', 'CVE_ACTIVIDAD', GRUPO, 'CVE_MES', 'CAN_INSCRITOS', 'CAN_ASISTENCIAS']
falt = [c for c in NEED if c not in hdr]
if falt: sys.exit('Faltan columnas: ' + ', '.join(falt))
I = {c: hdr.index(c) for c in NEED + [c for c in ('DES_ACTIVIDAD', 'NUM_ALTAS', 'FEC_FECHA_INICIO', 'CAN_CUPO', 'CVE_GRUPO') if c in hdr]}

G = {}  # grupo -> datos
cat = {}
fuera = filas = 0
anios = collections.Counter()
for r in it:
    if not r or r[I['CVE_OOAD']] in (None, ''): continue
    r = list(r) + [None] * (len(hdr) - len(r))
    o, u = int(num(r[I['CVE_OOAD']])), int(num(r[I['CVE_UOPSI']]))
    if o * 1000 + u not in uo:
        fuera += 1; continue
    filas += 1
    unidad = f'{o}-{u}'
    gid = unidad + '|' + str(r[I[GRUPO]]).strip()
    mes = int(num(r[I['CVE_MES']]))
    clave = str(int(num(r[I['CVE_ACTIVIDAD']])))
    if clave not in cat and 'DES_ACTIVIDAD' in I:
        cat[clave] = dict(clave_actividad=clave, actividad=re.sub(r'\s+', ' ', str(r[I['DES_ACTIVIDAD']] or clave)).strip().capitalize().replace('Imss', 'IMSS').replace(' imss', ' IMSS'))
    g = G.get(gid)
    if not g:
        ini = fdate(r[I['FEC_FECHA_INICIO']]) if 'FEC_FECHA_INICIO' in I else None
        if ini: anios[ini.year] += 1
        g = G[gid] = dict(unidad=unidad, area=AREA.get(norm(r[I['DES_AREA']]), str(r[I['DES_AREA']] or 'Sin área').strip().title()), clave=clave,
                          inicio=ini.month if ini else None, meses={})
    m = g['meses'].setdefault(mes, dict(inscritos=0.0, asistencias=0.0, altas=0.0))
    m['inscritos'] = max(m['inscritos'], num(r[I['CAN_INSCRITOS']]))
    m['asistencias'] += num(r[I['CAN_ASISTENCIAS']])
    m['altas'] += num(r[I['NUM_ALTAS']]) if 'NUM_ALTAS' in I else 0

d_suma = d_max = d_altas = 0.0
multimes = varian = 0
REG = collections.defaultdict(lambda: dict(grupos=0, inscripciones=0.0, asistencias=0.0))
ACT = collections.defaultdict(lambda: dict(grupos=0, inscripciones=0.0, asistencias=0.0))
for g in G.values():
    ms = sorted(g['meses'])
    ins = [g['meses'][m]['inscritos'] for m in ms]
    s_suma, s_max = sum(ins), max(ins) if ins else 0
    s_altas = (ins[0] if ins else 0) + sum(g['meses'][m]['altas'] for m in ms[1:])
    d_suma += s_suma; d_max += s_max; d_altas += s_altas
    if len(ms) > 1:
        multimes += 1
        if len(set(ins)) > 1: varian += 1
    insc = {'suma': s_suma, 'altas': s_altas}.get(METODO, s_max)
    mi = g['inicio'] or (ms[0] if ms else 0)
    REG[(g['unidad'], g['area'], mi)]['grupos'] += 1
    REG[(g['unidad'], g['area'], mi)]['inscripciones'] += insc
    for m in ms:
        REG[(g['unidad'], g['area'], m)]['asistencias'] += g['meses'][m]['asistencias']
    a = ACT[(g['unidad'], g['area'], g['clave'])]
    a['grupos'] += 1; a['inscripciones'] += insc; a['asistencias'] += sum(g['meses'][m]['asistencias'] for m in ms)

e = lambda v: int(v) if float(v).is_integer() else round(v, 2)
os.makedirs(out, exist_ok=True)
dump = lambda n, d: json.dump(d, open(out + '/' + n, 'w'), ensure_ascii=False, separators=(',', ':'))
reg = [dict(unidad=k[0], area=k[1], mes=k[2], **{x: e(v) for x, v in b.items()}) for k, b in REG.items()]
dump('ri_registro.json', reg)
dump('ri_actividad.json', [dict(unidad=k[0], area=k[1], clave_actividad=k[2], **{x: e(v) for x, v in b.items()}) for k, b in ACT.items()])
dump('ri_catalogo.json', list(cat.values()))
corte = dict(fecha_corte=fecha, grupos=len(G), inscripciones=e(sum(r['inscripciones'] for r in reg)), asistencias=e(sum(r['asistencias'] for r in reg)),
             unidades=len({g['unidad'] for g in G.values()}), anios=sorted(anios), registros_fuera_universo=fuera, metodo_inscripciones=METODO,
             diagnostico=dict(renglones=filas, grupos=len(G), grupos_en_varios_meses=multimes, grupos_con_inscritos_distintos_por_mes=varian,
                              inscripciones_suma_meses=e(d_suma), inscripciones_maximo_grupo=e(d_max), inscripciones_primer_mes_mas_altas=e(d_altas)))
hist = sorted([c for c in prev if c.get('fecha_corte') != fecha] + [corte], key=lambda c: c['fecha_corte'])
dump('ri_corte.json', hist)
print(json.dumps(dict(**corte, tamanos={f: os.path.getsize(out + '/' + f) for f in os.listdir(out)}), ensure_ascii=False))
