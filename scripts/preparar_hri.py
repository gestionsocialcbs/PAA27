"""Convierte la base de instalaciones HRI 2027 (SIPSI) en la referencia hri_2027.json del tablero.
Uso: python3 -I preparar_hri.py HRI.xlsx|HRI.csv|HRI.md hri_2027.json
- La base no trae una clave de instalación compartida con los reportes del PAA: se une por clave de OOAD, clave de UOPSI,
  clave de Centro de Extensión (0 si es la propia unidad) y nombre de la instalación (NOMBRE_INSTALACIÓN).
- Conserva solo los campos que usa el tablero (identificación de la instalación, si es programable, su tipo y estatus).
"""
import sys, json, re, csv, io

src, out = sys.argv[1:3]


def filas():
    if src.lower().endswith('.md'):
        L = [l.rstrip('\n') for l in open(src, encoding='utf-8') if l.startswith('|')]
        spl = lambda l: [c.strip().replace('\\_', '_') for c in l.strip().strip('|').split(' | ')]
        H = spl(L[0])
        for l in L[2:]:
            c = spl(l)
            if len(c) == len(H): yield dict(zip(H, c))
    elif src.lower().endswith('.csv'):
        raw = open(src, 'rb').read()
        try: txt = raw.decode('utf-8-sig')
        except UnicodeDecodeError: txt = raw.decode('latin-1')
        dl = csv.Sniffer().sniff(txt[:5000], delimiters=',;|\t').delimiter
        yield from csv.DictReader(io.StringIO(txt), delimiter=dl)
    else:
        import openpyxl
        wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
        for ws in wb.worksheets:
            it = ws.iter_rows(values_only=True)
            for h in it:
                if h and 'NOMBRE_INSTALACIÓN' in [str(x or '').strip() for x in h]:
                    H = [str(x or '').strip() for x in h]
                    for r in it:
                        if r and any(v not in (None, '') for v in r): yield dict(zip(H, ['' if v is None else str(v) for v in r]))
                    return


def t(v):
    v = re.sub(r'\s+', ' ', str(v or '')).strip()
    return '' if v.upper() in ('NAN', 'NONE', 'NULL') else v


def n(v):
    try: return int(float(t(v)))
    except ValueError: return 0


def num(v):
    try: return round(float(t(v)), 2)
    except ValueError: return None


cap = lambda v: t(v)[:1].upper() + t(v)[1:].lower() if t(v) else ''
rows = []
for r in filas():
    if not t(r.get('NOMBRE_INSTALACIÓN')): continue
    rows.append(dict(cve_ooad=n(r['CVE_OOAD']), cve_uopsi=n(r['CVE_UOPSI']), cve_cec=n(r.get('CVE_CEC')),
                     cec=t(r.get('NOMBRE_CEC')).title() if n(r.get('CVE_CEC')) else '', tipo_uopsi=t(r.get('TIPO DE UOPSI')),
                     estado_uopsi=cap(r.get('ESTADO_UOPSI_SIPSI')), programable='SI' if t(r.get('INSTALACIÓN PROGRAMABLE')).upper() in ('SI', 'SÍ') else 'NO',
                     nivel=cap(r.get('NIVEL')), tipo_instalacion=cap(r.get('TIPO_INSTALACIÓN')), subtipo=cap(r.get('SUBTIPO_INSTALACIÓN')),
                     servicio=cap(r.get('SERVICIO')), instalacion=t(r['NOMBRE_INSTALACIÓN']), multigrupo=t(r.get('MULTIGRUPO')).upper(),
                     superficie=num(r.get('SUPERFICIE')), estatus=cap(r.get('ESTATUS_INSTALACIÓN'))))
json.dump(rows, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
print(json.dumps(dict(instalaciones=len(rows), programables=sum(r['programable'] == 'SI' for r in rows),
                      unidades=len({(r['cve_ooad'], r['cve_uopsi']) for r in rows})), ensure_ascii=False))
