"""Procesa el Reporte de Teatros REAL (Reporte_Teatros_DDMMAAAA.csv o .xlsx) para el comparativo PAA vs. Real del tablero PAA 2027 (Módulo 3).
Uso: python3 -I procesar_real_teatros.py REPORTE.csv|xlsx unidades_operativas.json corte_anterior.json|- SALIDA_DIR [AAAA-MM-DD]
- Un renglón es un evento. Asistencias reales = NUM_TOTAL_ASISTENCIAS (asistencias + ELSSA); si no viene, NUM_ASISTENCIA.
- Área del primer dígito de la clave de actividad (1 Promoción de la Salud, 2 CASSAAM, 3 Desarrollo Cultural, 4 Cultura Física y Deporte, 5 Capacitación y Adiestramiento Técnico, 6 CECART).
- Solo Unidades Operativas del catálogo. No guarda nombres de eventos ni datos personales.
Salidas: rte_registro.json (unidad, área, actividad, mes, tipo de evento: eventos y asistencias reales), rte_catalogo.json y rte_corte.json.
"""
import sys, json, re, os, datetime, collections, openpyxl

src, f_uo, f_prev, out = sys.argv[1:5]
fecha = sys.argv[5] if len(sys.argv) > 5 else None
if not fecha:
    b = os.path.basename(src)
    m = re.search(r'(\d{2})[_-](\d{2})[_-](\d{4})', b) or re.search(r'_(\d{2})(\d{2})(\d{4})(?:_|\.)', b)
    fecha = f'{m.group(3)}-{m.group(2)}-{m.group(1)}' if m else datetime.date.today().isoformat()

AREAS = {'1': 'Promoción de la Salud', '2': 'CASSAAM', '3': 'Desarrollo Cultural', '4': 'Cultura Física y Deporte', '5': 'Capacitación y Adiestramiento Técnico', '6': 'CECART'}
MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']
norm = lambda v: re.sub(r'\s+', '_', str(v or '').strip().upper())
uo = {r['cve_uo'] for r in json.load(open(f_uo))}
prev = json.load(open(f_prev)) if f_prev != '-' else []

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

hdr = None
it = filas_de(src)
for r in it:
    h = [norm(c) for c in r] if r else []
    if 'CVE_OOAD' in h and ('NUM_TOTAL_ASISTENCIAS' in h or 'NUM_ASISTENCIA' in h):
        hdr = h; break
if not hdr:
    sys.exit('No encontré el encabezado (CVE_OOAD, NUM_TOTAL_ASISTENCIAS): el archivo no es un Reporte de Teatros.')
ASIS = 'NUM_TOTAL_ASISTENCIAS' if 'NUM_TOTAL_ASISTENCIAS' in hdr else 'NUM_ASISTENCIA'
NEED = ['CVE_UOPSI', 'CVE_ACTIVIDAD']
falt = [c for c in NEED if c not in hdr]
if falt: sys.exit('Faltan columnas: ' + ', '.join(falt))
I = {c: hdr.index(c) for c in ['CVE_OOAD', ASIS] + NEED + [c for c in ('FEC_EVENTO', 'DES_MES', 'TIPO_EVENTO', 'DES_ACTIVIDAD') if c in hdr]}

def num(v):
    try: return float(str(v).strip())
    except (TypeError, ValueError): return 0.0
def fdate(v):
    if isinstance(v, datetime.datetime): return v.date()
    if isinstance(v, datetime.date): return v
    s = str(v or '').strip()[:10]
    for f in ('%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d'):
        try: return datetime.datetime.strptime(s, f).date()
        except ValueError: pass
    return None

AGG = collections.defaultdict(lambda: dict(eventos=0, asistencias=0.0))
anios = collections.Counter()
cat = {}
fuera = 0
for r in it:
    if not r or r[I['CVE_OOAD']] in (None, ''): continue
    r = list(r) + [None] * (len(hdr) - len(r))
    o, u = int(num(r[I['CVE_OOAD']])), int(num(r[I['CVE_UOPSI']]))
    if o * 1000 + u not in uo:
        fuera += 1; continue
    d = fdate(r[I['FEC_EVENTO']]) if 'FEC_EVENTO' in I else None
    if d: anios[d.year] += 1
    mes = d.month if d else (MESES.index(norm(r[I['DES_MES']])) + 1 if 'DES_MES' in I and norm(r[I['DES_MES']]) in MESES else 0)
    clave = str(int(num(r[I['CVE_ACTIVIDAD']])))
    tipo = re.sub(r'\s+', ' ', str(r[I['TIPO_EVENTO']] or '')).strip() if 'TIPO_EVENTO' in I else ''
    if clave not in cat:
        cat[clave] = dict(clave_actividad=clave, actividad=re.sub(r'\s+', ' ', str(r[I['DES_ACTIVIDAD']] or clave)).strip().capitalize().replace('Imss', 'IMSS').replace(' imss', ' IMSS') if 'DES_ACTIVIDAD' in I else clave)
    k = (f'{o}-{u}', AREAS.get(clave[:1], 'Sin área'), clave, mes, tipo or 'Sin tipo')
    AGG[k]['eventos'] += 1
    AGG[k]['asistencias'] += num(r[I[ASIS]])

e = lambda v: int(v) if float(v).is_integer() else round(v, 2)
rows = [dict(unidad=k[0], area=k[1], clave_actividad=k[2], mes=k[3], tipo_evento=k[4], eventos=v['eventos'], asistencias=e(v['asistencias'])) for k, v in AGG.items()]
os.makedirs(out, exist_ok=True)
dump = lambda n, d: json.dump(d, open(out + '/' + n, 'w'), ensure_ascii=False, separators=(',', ':'))
dump('rte_registro.json', rows)
dump('rte_catalogo.json', list(cat.values()))
corte = dict(fecha_corte=fecha, asistencias=e(sum(r['asistencias'] for r in rows)), eventos=sum(r['eventos'] for r in rows),
             teatros=len({r['unidad'] for r in rows}), anios=sorted(anios), registros_fuera_universo=fuera, medida=ASIS)
hist = sorted([c for c in prev if c.get('fecha_corte') != fecha] + [corte], key=lambda c: c['fecha_corte'])
dump('rte_corte.json', hist)
print(json.dumps(dict(**corte, tamanos={f: os.path.getsize(out + '/' + f) for f in os.listdir(out)}), ensure_ascii=False))
