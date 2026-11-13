"""Procesa el Reporte de actividades complementarias REAL (Reporte_Activ_Complem_DDMMAAAA.xlsx) para el comparativo PAA vs. Real del tablero PAA 2027 (Módulo 2).
Uso: python3 -I procesar_real_complementarias.py REPORTE.xlsx unidades_operativas.json corte_anterior.json|- SALIDA_DIR [AAAA-MM-DD]
- Un renglón es una sesión (fecha) de una actividad. Asistencias reales = TOTAL_ASISTENCIAS (asistencias + ELSSA); si no viene, NUM_ASISTENCIA.
- La fecha de corte se toma del nombre del archivo (..._DDMMAAAA) o del último argumento.
- Solo Unidades Operativas del catálogo. No guarda nombres ni claves de instructores ni otros datos personales.
Salidas: rac_registro.json (unidad, área, actividad, mes: sesiones, grupos y asistencias reales), rac_catalogo.json (nombre y tipo de cada actividad) y rac_corte.json (historial por fecha de corte).
"""
import sys, json, re, os, datetime, collections, openpyxl

src, f_uo, f_prev, out = sys.argv[1:5]
fecha = sys.argv[5] if len(sys.argv) > 5 else None
if not fecha:
    b = os.path.basename(src)
    m = re.search(r'(\d{2})[_-](\d{2})[_-](\d{4})', b) or re.search(r'_(\d{2})(\d{2})(\d{4})(?:_|\.)', b)
    fecha = f'{m.group(3)}-{m.group(2)}-{m.group(1)}' if m else datetime.date.today().isoformat()

SIN_ACENTO = str.maketrans('ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu')
norm = lambda v: re.sub(r'[\s_]+', '_', str(v or '').strip().upper().translate(SIN_ACENTO))
AREA = {'PROMOCION_DE_LA_SALUD': 'Promoción de la Salud', 'DESARROLLO_CULTURAL': 'Desarrollo Cultural',
        'CULTURA_FISICA_Y_DEPORTE': 'Cultura Física y Deporte', 'CAPACITACION_Y_ADIESTRAMIENTO_TECNICO': 'Capacitación y Adiestramiento Técnico',
        'CASSAAM': 'CASSAAM', 'CECART': 'CECART'}
NEED = ['CVE_OOAD', 'CVE_UOPSI', 'DES_AREA', 'CVE_ACTIVIDAD', 'CVE_GRUPO']

uo = {r['cve_uo'] for r in json.load(open(f_uo))}
prev = json.load(open(f_prev)) if f_prev != '-' else []

wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
hdr = it = None
for ws in wb.worksheets:
    ws.reset_dimensions()
    it = ws.iter_rows(values_only=True)
    for r in it:
        if r and 'CVE_OOAD' in [norm(c) for c in r] and any(norm(c) in ('TOTAL_ASISTENCIAS', 'NUM_ASISTENCIA') for c in r):
            hdr = [norm(c) for c in r]
            break
    if hdr: break
if not hdr:
    sys.exit('No encontré el encabezado (CVE_OOAD, TOTAL_ASISTENCIAS): el archivo no es un Reporte de actividades complementarias.')
ASIS = 'TOTAL_ASISTENCIAS' if 'TOTAL_ASISTENCIAS' in hdr else 'NUM_ASISTENCIA'
falt = [c for c in NEED if c not in hdr]
if falt: sys.exit('Faltan columnas: ' + ', '.join(falt))
I = {c: hdr.index(c) for c in NEED + [ASIS] + [c for c in ('CVE_MES', 'FEC_FECHA', 'DES_ACTIVIDAD', 'DES_TIPO_ACTIVIDAD') if c in hdr]}
cat = {}

def num(v):
    try: return float(str(v).strip())
    except (TypeError, ValueError): return 0.0
def fdate(v):
    if isinstance(v, (datetime.datetime, datetime.date)): return v if isinstance(v, datetime.date) and not isinstance(v, datetime.datetime) else v.date()
    s = str(v or '').strip()[:10]
    for f in ('%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y'):
        try: return datetime.datetime.strptime(s, f).date()
        except ValueError: pass
    return None

Z = lambda: dict(sesiones=0, asistencias=0.0)
AGG = collections.defaultdict(Z)
grupos = collections.defaultdict(set)
anios = collections.Counter()
fuera = 0
for r in it:
    if not r or r[I['CVE_OOAD']] in (None, ''): continue
    r = list(r) + [None] * (len(hdr) - len(r))
    try: o, u = int(num(r[I['CVE_OOAD']])), int(num(r[I['CVE_UOPSI']]))
    except (TypeError, ValueError): continue
    if o * 1000 + u not in uo:
        fuera += 1; continue
    d = fdate(r[I['FEC_FECHA']]) if 'FEC_FECHA' in I else None
    mes = int(num(r[I['CVE_MES']])) if 'CVE_MES' in I and num(r[I['CVE_MES']]) else (d.month if d else 0)
    if d: anios[d.year] += 1
    area = AREA.get(norm(r[I['DES_AREA']]), str(r[I['DES_AREA']] or 'Sin área').strip().title())
    clave = str(int(num(r[I['CVE_ACTIVIDAD']])))
    if clave not in cat:
        cat[clave] = dict(clave_actividad=clave, actividad=re.sub(r'\s+', ' ', str(r[I['DES_ACTIVIDAD']] or clave)).strip().capitalize().replace('Imss', 'IMSS').replace(' imss', ' IMSS') if 'DES_ACTIVIDAD' in I else clave,
                          tipo_actividad=str(r[I['DES_TIPO_ACTIVIDAD']] or '').strip().capitalize() if 'DES_TIPO_ACTIVIDAD' in I else '')
    k = (f'{o}-{u}', area, clave, mes)
    AGG[k]['sesiones'] += 1
    AGG[k]['asistencias'] += num(r[I[ASIS]])
    grupos[k].add(str(r[I['CVE_GRUPO']]))

e = lambda v: int(v) if float(v).is_integer() else round(v, 2)
rows = [dict(unidad=k[0], area=k[1], clave_actividad=k[2], mes=k[3], grupos=len(grupos[k]), sesiones=v['sesiones'], asistencias=e(v['asistencias'])) for k, v in AGG.items()]
os.makedirs(out, exist_ok=True)
dump = lambda n, d: json.dump(d, open(out + '/' + n, 'w'), ensure_ascii=False, separators=(',', ':'))
dump('rac_registro.json', rows)
dump('rac_catalogo.json', list(cat.values()))
corte = dict(fecha_corte=fecha, asistencias=e(sum(r['asistencias'] for r in rows)), sesiones=sum(r['sesiones'] for r in rows),
             unidades=len({r['unidad'] for r in rows}), anios=sorted(anios), registros_fuera_universo=fuera, medida=ASIS)
hist = sorted([c for c in prev if c.get('fecha_corte') != fecha] + [corte], key=lambda c: c['fecha_corte'])
dump('rac_corte.json', hist)
print(json.dumps(dict(**corte, tamanos={f: os.path.getsize(out + '/' + f) for f in os.listdir(out)}), ensure_ascii=False))
