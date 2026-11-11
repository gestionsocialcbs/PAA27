"""Procesa el Reporte PAA Teatros (xlsx, aunque traiga extensión .xls) para el seguimiento del registro en el tablero PAA 2027 (Módulo 3).
Uso: python3 -I procesar_teatros.py REPORTE.xls[x] unidades_operativas.json corte_anterior.json|- SALIDA_DIR [AAAA-MM-DD]
- Un renglón del reporte es un evento registrado. Asistencias = NUM_ASISTENCIA. Es seguimiento del registro: no compara contra metas.
- La fecha de corte se toma del nombre del archivo (..._DD_MM_AAAA o ..._DDMMAAAA_...) o del último argumento.
- Solo Unidades Operativas del catálogo. El área se toma del primer dígito de la clave de actividad
  (1 Promoción de la Salud, 2 CASSAAM, 3 Desarrollo Cultural, 4 Cultura Física y Deporte, 5 Capacitación y Adiestramiento Técnico, 6 CECART).
Salidas: te_registro.json (unidad, área, actividad, mes, tipo y detalle del evento), te_catalogo.json y te_corte.json.
"""
import sys, json, re, os, datetime, collections, zipfile, shutil, tempfile

src, f_uo, f_prev, out = sys.argv[1:5]
fecha = sys.argv[5] if len(sys.argv) > 5 else None
if not fecha:
    b = os.path.basename(src)
    m = re.search(r'(\d{2})[_-](\d{2})[_-](\d{4})', b) or re.search(r'_(\d{2})(\d{2})(\d{4})(?:_|\.)', b)
    fecha = f'{m.group(3)}-{m.group(2)}-{m.group(1)}' if m else datetime.date.today().isoformat()

AREAS = {'1': 'Promoción de la Salud', '2': 'CASSAAM', '3': 'Desarrollo Cultural', '4': 'Cultura Física y Deporte',
         '5': 'Capacitación y Adiestramiento Técnico', '6': 'CECART'}
MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']
NEED = ['OOAD', 'UOPSI', 'DES_ACTIVIDAD', 'NUM_ASISTENCIA', 'FEC_EVENTO', 'TIPO_EVENTO', 'DETALLE_EVENTO']
OPC = ['CAN_AFORO', 'DES_BLOQUE', 'NOM_ESTRATEGIA', 'DES_MES']

def filas(path):
    if zipfile.is_zipfile(path):
        import openpyxl
        tmp = tempfile.mkdtemp()
        p = os.path.join(tmp, 'reporte.xlsx')
        shutil.copyfile(path, p)
        wb = openpyxl.load_workbook(p, read_only=True, data_only=True)
        ws = wb.worksheets[0]
        ws.reset_dimensions()
        yield from ws.iter_rows(values_only=True)
    else:
        import xlrd  # .xls binario (pip install --break-system-packages xlrd)
        wb = xlrd.open_workbook(path)
        ws = wb.sheet_by_index(0)
        for i in range(ws.nrows):
            row = []
            for c in ws.row(i):
                if c.ctype == xlrd.XL_CELL_DATE:
                    row.append(xlrd.xldate.xldate_as_datetime(c.value, wb.datemode))
                else:
                    row.append(c.value)
            yield row

norm = lambda v: re.sub(r'\s+', '_', str(v or '').strip().upper())
it = filas(src)
hdr = None
for r in it:
    if r and 'NUM_ASISTENCIA' in [norm(c) for c in r] and 'OOAD' in [norm(c) for c in r]:
        hdr = [norm(c) for c in r]
        break
if not hdr:
    sys.exit('No encontré el encabezado (OOAD, NUM_ASISTENCIA): el archivo no es un Reporte PAA Teatros.')
falt = [c for c in NEED if c not in hdr]
if falt:
    sys.exit('Faltan columnas: ' + ', '.join(falt))
I = {c: hdr.index(c) for c in NEED + [c for c in OPC if c in hdr]}

uo = {r['cve_uo']: r for r in json.load(open(f_uo))}
prev = json.load(open(f_prev)) if f_prev != '-' else []

def clave_de(v):
    m = re.match(r'\s*\[(\w+)\]\s*(.*)', str(v or ''))
    return (m.group(1), m.group(2).strip()) if m else ('', str(v or '').strip())

def num(v, d=0):
    try: return float(str(v).strip())
    except (TypeError, ValueError): return d

def fecha_de(v):
    if isinstance(v, datetime.datetime): return v.date()
    if isinstance(v, datetime.date): return v
    if isinstance(v, (int, float)) and v > 20000: return datetime.date(1899, 12, 30) + datetime.timedelta(days=int(v))
    s = str(v or '').strip()[:10]
    for f in ('%d/%m/%Y', '%Y-%m-%d'):
        try: return datetime.datetime.strptime(s, f).date()
        except ValueError: pass
    return None

txt = lambda v: re.sub(r'\s+', ' ', str(v or '')).strip()
Z = lambda: dict(eventos=0, asistencias=0, aforo=0)
AGG = collections.defaultdict(Z)
cat = {}
n = fuera = 0
for r in it:
    if not r or r[I['OOAD']] in (None, ''): continue
    r = list(r) + [None] * (len(hdr) - len(r))
    try:
        o = int(clave_de(r[I['OOAD']])[0] or r[I['OOAD']])
        u = int(clave_de(r[I['UOPSI']])[0] or r[I['UOPSI']])
    except (TypeError, ValueError):
        continue
    if o * 1000 + u not in uo:
        fuera += 1
        continue
    n += 1
    clave, nom = clave_de(r[I['DES_ACTIVIDAD']])
    area = AREAS.get(clave[:1], 'Sin área')
    if clave not in cat:
        cat[clave] = dict(clave_actividad=clave, actividad=nom.capitalize().replace('Imss', 'IMSS').replace(' imss', ' IMSS'),
                          bloque=txt(r[I['DES_BLOQUE']]).capitalize() if 'DES_BLOQUE' in I else '',
                          estrategia=txt(r[I['NOM_ESTRATEGIA']]) if 'NOM_ESTRATEGIA' in I else '')
    fe = fecha_de(r[I['FEC_EVENTO']])
    mes = fe.month if fe else (MESES.index(norm(r[I['DES_MES']])) + 1 if 'DES_MES' in I and norm(r[I['DES_MES']]) in MESES else 0)
    k = (f'{o}-{u}', area, clave, mes, txt(r[I['TIPO_EVENTO']]) or 'Sin tipo', txt(r[I['DETALLE_EVENTO']]).capitalize() or 'Sin detalle')
    AGG[k]['eventos'] += 1
    AGG[k]['asistencias'] += num(r[I['NUM_ASISTENCIA']])
    AGG[k]['aforo'] += num(r[I['CAN_AFORO']]) if 'CAN_AFORO' in I else 0

e = lambda v: int(v) if float(v).is_integer() else round(v, 2)
os.makedirs(out, exist_ok=True)
dump = lambda name, data: json.dump(data, open(out + '/' + name, 'w'), ensure_ascii=False, separators=(',', ':'))
rows = [dict(unidad=k[0], area=k[1], clave_actividad=k[2], mes=k[3], tipo_evento=k[4], detalle_evento=k[5], **{x: e(v) for x, v in b.items()}) for k, b in AGG.items()]
dump('te_registro.json', rows)
dump('te_catalogo.json', list(cat.values()))
corte = dict(fecha_corte=fecha, eventos=sum(r['eventos'] for r in rows), asistencias=e(sum(r['asistencias'] for r in rows)),
             teatros=len({r['unidad'] for r in rows}), registros_fuera_universo=fuera)
hist = sorted([c for c in prev if c.get('fecha_corte') != fecha] + [corte], key=lambda c: c['fecha_corte'])
dump('te_corte.json', hist)
print(json.dumps(dict(**corte, tamanos={f: os.path.getsize(out + '/' + f) for f in os.listdir(out)}), ensure_ascii=False))
