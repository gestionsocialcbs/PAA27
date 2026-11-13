"""Actualización diaria del tablero PAA 2027 desde Google Drive (se ejecuta en GitHub Actions).

Lee la carpeta del día más reciente de PAA_2027/Reportes PAA y de PAA_2027/Reportes Real, descarga los reportes
tal como están en Drive (sin límite de tamaño), los procesa con los scripts de esta carpeta, valida el resultado
y reemplaza los archivos de datos/. Escribe un resumen en datos/bitacora.json.

Requiere la variable de entorno GDRIVE_SA_JSON con la llave JSON de una cuenta de servicio de Google
que tenga acceso de lectura a la carpeta PAA_2027.
"""
import os, re, io, sys, json, shutil, datetime, subprocess, tempfile

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(RAIZ, 'datos')
SCRIPTS = os.path.join(RAIZ, 'scripts')
CARPETAS = {'PAA': '1ALcJ96-67lILW5QRs-FAt7stNK-GfoVg', 'Real': '1CWWhyg2ZuyU0tu2kdLqV_j8y0nnlcSMZ'}
REF = lambda n: os.path.join(DATOS, n + '.json')

# Cada reporte: carpeta, inicio del título, script, argumentos de referencia, tablas, tabla principal, tabla de cortes y medida a validar.
REPORTES = [
    dict(id='M1', nombre='Cursos y talleres (PAA)', carpeta='PAA', prefijo='REPORTE_PAA_CURSOS', script='procesar_avance.py',
         refs=['unidades_operativas', 'instalaciones', 'layout_2027'], corte='avance_corte', principal='avance_instalacion', medida='grupos',
         tablas=['avance_instalacion', 'avance_instalaciones', 'avance_dimension', 'avance_actividad', 'avance_catalogo_actividades', 'avance_corte', 'avance_uso']),
    dict(id='M2', nombre='Actividades complementarias (PAA)', carpeta='PAA', prefijo='REPORTE_PAA_ACOMPLEMENTARIA', script='procesar_complementarias.py',
         refs=['unidades_operativas', 'instalaciones'], corte='ac_corte', principal='ac_instalacion', medida='asistencias',
         tablas=['ac_instalacion', 'ac_detalle', 'ac_catalogo', 'ac_lugares', 'ac_corte']),
    dict(id='M3', nombre='Teatros (PAA)', carpeta='PAA', prefijo='REPORTE_PAA_TEATROS', script='procesar_teatros.py',
         refs=['unidades_operativas'], corte='te_corte', principal='te_registro', medida='asistencias',
         tablas=['te_registro', 'te_catalogo', 'te_corte']),
    dict(id='R2', nombre='Actividades complementarias (real)', carpeta='Real', prefijo='REPORTE_ACTIV_COMPLEM', script='procesar_real_complementarias.py',
         refs=['unidades_operativas'], corte='rac_corte', principal='rac_registro', medida='asistencias',
         tablas=['rac_registro', 'rac_catalogo', 'rac_corte']),
    dict(id='R3', nombre='Teatros (real)', carpeta='Real', prefijo='REPORTE_TEATROS', script='procesar_real_teatros.py',
         refs=['unidades_operativas'], corte='rte_corte', principal='rte_registro', medida='asistencias',
         tablas=['rte_registro', 'rte_catalogo', 'rte_corte']),
]
PENDIENTES = [dict(id='R1', nombre='Inscripciones y asistencias reales a cursos y talleres', carpeta='Real', prefijo='INSCRITOS')]
LIMITE_MB = 12  # tamaño máximo de cada archivo de salida (el tablero de claude.ai los carga como archivos)


def fecha_de_nombre(nombre):
    n = os.path.splitext(nombre)[0]
    for rx, orden in ((r'(\d{4})-(\d{2})-(\d{2})', 'ymd'), (r'(\d{2})[_-](\d{2})[_-](\d{4})', 'dmy'), (r'(\d{8})', 'x')):
        m = re.search(rx, n)
        if not m:
            continue
        try:
            if orden == 'ymd': return datetime.date(int(m[1]), int(m[2]), int(m[3]))
            if orden == 'dmy': return datetime.date(int(m[3]), int(m[2]), int(m[1]))
            s = m[1]
            for d, mm, y in ((s[:2], s[2:4], s[4:]), (s[6:], s[4:6], s[:4])):
                try: return datetime.date(int(y), int(mm), int(d))
                except ValueError: pass
        except ValueError:
            pass
    return None


def iso(t):
    return datetime.datetime.fromisoformat(t.replace('Z', '+00:00'))


def listar(svc, padre, carpetas=False):
    q = f"'{padre}' in parents and trashed = false" + (" and mimeType = 'application/vnd.google-apps.folder'" if carpetas else '')
    out, tok = [], None
    while True:
        r = svc.files().list(q=q, fields='nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime)', pageSize=200,
                             pageToken=tok, supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
        out += r.get('files', [])
        tok = r.get('nextPageToken')
        if not tok: return out


def descargar(svc, f, destino):
    if f['mimeType'] == 'application/vnd.google-apps.spreadsheet':
        req = svc.files().export_media(fileId=f['id'], mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    else:
        req = svc.files().get_media(fileId=f['id'], supportsAllDrives=True)
    with io.FileIO(destino, 'wb') as fh:
        dl = MediaIoBaseDownload(fh, req, chunksize=32 * 1024 * 1024)
        hecho = False
        while not hecho:
            _, hecho = dl.next_chunk(num_retries=5)


def ultimo(corte):
    try:
        c = json.load(open(REF(corte)))
        return sorted(c, key=lambda r: r['fecha_corte'])[-1] if c else None
    except FileNotFoundError:
        return None


def encabezado(path):
    """Solo los nombres de columna (sin datos), para preparar el procesamiento de un reporte nuevo."""
    import openpyxl, zipfile, csv
    try:
        if not zipfile.is_zipfile(path):
            raw = open(path, 'rb').read(200000)
            try: txt = raw.decode('utf-8-sig')
            except UnicodeDecodeError: txt = raw.decode('latin-1')
            linea = txt.splitlines()[0] if txt else ''
            try: sep = csv.Sniffer().sniff(linea + '\n', delimiters=',;|\t').delimiter
            except csv.Error: sep = ','
            return [dict(hoja='CSV', separador=sep, columnas=[c.strip() for c in next(csv.reader([linea], delimiter=sep))])]
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        hojas = []
        for ws in wb.worksheets:
            ws.reset_dimensions()
            for r in ws.iter_rows(values_only=True, max_row=30):
                vals = [str(c).strip() for c in r if c not in (None, '')]
                if len(vals) >= 5 and sum(1 for v in vals if re.fullmatch(r'[A-Z_0-9]+', v)) >= 3:
                    hojas.append(dict(hoja=ws.title, columnas=vals))
                    break
        return hojas
    except Exception as e:
        return [dict(error=str(e)[:200])]


def main():
    cred = service_account.Credentials.from_service_account_info(json.loads(os.environ['GDRIVE_SA_JSON']), scopes=['https://www.googleapis.com/auth/drive.readonly'])
    svc = build('drive', 'v3', credentials=cred, cache_discovery=False)
    manifest = json.load(open(os.path.join(DATOS, 'manifest.json')))
    ahora = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
    bit = dict(ejecucion=ahora.isoformat().replace('+00:00', 'Z'), carpetas={}, reportes=[], pendientes=[])
    tmp = tempfile.mkdtemp()
    archivos = {}
    for k, padre in CARPETAS.items():
        dias = [(fecha_de_nombre(c['name']) or iso(c['createdTime']).date(), c) for c in listar(svc, padre, carpetas=True)]
        if not dias:
            bit['carpetas'][k] = None
            continue
        _, dia = max(dias, key=lambda x: (x[0], x[1]['createdTime']))
        bit['carpetas'][k] = dia['name']
        archivos[k] = listar(svc, dia['id'])

    for rep in REPORTES + PENDIENTES:
        res = dict(id=rep['id'], reporte=rep['nombre'])
        bit['reportes' if rep in REPORTES else 'pendientes'].append(res)
        cands = [f for f in archivos.get(rep['carpeta'], []) if f['name'].upper().replace(' ', '_').startswith(rep['prefijo'])]
        if not cands:
            res['estado'] = 'sin archivo en la carpeta del día'
            continue
        f = max(cands, key=lambda f: max(f['createdTime'], f['modifiedTime']))
        res.update(archivo=f['name'], tamano_mb=round(int(f.get('size') or 0) / 1048576, 1))
        if rep in PENDIENTES:
            p = os.path.join(tmp, f['name'])
            descargar(svc, f, p)
            res.update(estado='aún no se procesa; se registran solo los nombres de columna', encabezado=encabezado(p))
            os.remove(p)
            continue
        fc = fecha_de_nombre(f['name'])
        if not fc:
            res['estado'] = 'el nombre del archivo no trae fecha de corte'
            continue
        res['fecha_corte'] = fc.isoformat()
        prev = ultimo(rep['corte'])
        act = manifest['datasets'].get(rep['principal'], {}).get('actualizado')
        t_arch = max(iso(f['createdTime']), iso(f['modifiedTime']))
        nuevo = (not prev or fc.isoformat() > prev['fecha_corte'] or
                 (fc.isoformat() == prev['fecha_corte'] and (not act or t_arch > iso(act))))
        if not nuevo:
            res['estado'] = 'sin cambios (ya publicado)'
            continue
        p = os.path.join(tmp, f['name'])
        descargar(svc, f, p)
        sal = os.path.join(tmp, 'salida_' + rep['id'])
        cmd = [sys.executable, '-I', os.path.join(SCRIPTS, rep['script']), p] + [REF(r) for r in rep['refs']] + [REF(rep['corte']) if prev else '-', sal]
        r = subprocess.run(cmd, capture_output=True, text=True)
        os.remove(p)
        if r.returncode != 0:
            res['estado'] = 'error del script: ' + (r.stderr.strip().splitlines() or ['sin mensaje'])[-1][:300]
            continue
        nuevo_c = ultimo_de(os.path.join(sal, rep['corte'] + '.json'))
        # Validación
        motivo = None
        if not nuevo_c or not nuevo_c.get(rep['medida']):
            motivo = 'el reporte no trae registros'
        elif prev and prev.get(rep['medida']) and nuevo_c[rep['medida']] < 0.7 * prev[rep['medida']]:
            motivo = f"la medida ({rep['medida']}) baja más de 30 % respecto del corte anterior: {prev[rep['medida']]:,} → {nuevo_c[rep['medida']]:,}"
        for t in rep['tablas']:
            pt = os.path.join(sal, t + '.json')
            if not os.path.exists(pt): motivo = motivo or f'falta {t}.json en la salida'
            elif os.path.getsize(pt) > LIMITE_MB * 1048576: motivo = motivo or f'{t}.json pasa de {LIMITE_MB} MB'
        if rep['id'] == 'M1' and not motivo:
            for u in json.load(open(os.path.join(sal, 'avance_uso.json'))):
                if any((v or 0) > 1 for v in [u.get('ocupacion'), u.get('ocup_hora_pico')]) or (u.get('horas_ocupadas') or 0) > (u.get('horas_disponibles') or 0) + 1e-6:
                    motivo = 'avance_uso trae una ocupación mayor que 1 u horas ocupadas mayores que las disponibles'; break
        if motivo:
            res['estado'] = 'no publicado: ' + motivo
            continue
        for t in rep['tablas']:
            shutil.copyfile(os.path.join(sal, t + '.json'), REF(t))
            d = manifest['datasets'].setdefault(t, dict(archivo=f'datos/{t}.json'))
            d['actualizado'] = bit['ejecucion']
            d['fuente'] = f"Jorge ({f['name']})"
        res.update(estado='actualizado', corte=nuevo_c, corte_anterior=prev)
    json.dump(manifest, open(os.path.join(DATOS, 'manifest.json'), 'w'), ensure_ascii=False, indent=1)
    json.dump(bit, open(os.path.join(DATOS, 'bitacora.json'), 'w'), ensure_ascii=False, indent=1)
    # Resumen para la página de la ejecución en GitHub
    lin = [f"## Actualización PAA 2027 · {bit['ejecucion']}", '', f"Carpetas del día: Reportes PAA = {bit['carpetas'].get('PAA')}, Reportes Real = {bit['carpetas'].get('Real')}", '',
           '| Reporte | Archivo | Corte | Estado |', '|---|---|---|---|']
    for r in bit['reportes'] + bit['pendientes']:
        lin.append(f"| {r['reporte']} | {r.get('archivo', '—')} | {r.get('fecha_corte', '—')} | {r['estado']} |")
    s = os.environ.get('GITHUB_STEP_SUMMARY')
    if s: open(s, 'a').write('\n'.join(lin) + '\n')
    print('\n'.join(lin))


def ultimo_de(path):
    try:
        c = json.load(open(path))
        return sorted(c, key=lambda r: r['fecha_corte'])[-1] if c else None
    except FileNotFoundError:
        return None


if __name__ == '__main__':
    main()
