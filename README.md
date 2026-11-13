# Programación Anual de Actividades 2027 · Tablero de seguimiento

Tablero de la Coordinación de Bienestar Social (IMSS) · División de Apoyo Técnico y Mejora de Procesos (DATMP) para dar seguimiento al registro del Programa Anual de Actividades (PAA) 2027.

| Módulo | Medida | Fuente |
|---|---|---|
| 1 · Inscripciones y asistencias a cursos y talleres | Inscripciones (CAN_CUPO) contra la meta 2027 y asistencias (CAN_ASISTENCIAS); tiempos de uso de las instalaciones | `REPORTE_PAA_CURSOS_DDMMAAAA_*.xlsx` |
| 2 · Asistencias en actividades complementarias | Asistencias registradas (CAN_ASISTENCIA), sin metas | `REPORTE_PAA_ACOMPLEMENTARIA_DDMMAAAA_*.xlsx` |
| 3 · Asistencias en teatros | Asistencias registradas (NUM_ASISTENCIA), sin metas | `Reporte_PAA_Teatros_DD_MM_AAAA.xls` |
| 1 · Programado contra real | Inscripciones reales (CAN_INSCRITOS, inscripciones nuevas de cada mes) y asistencias reales (CAN_ASISTENCIAS) contra las registradas en el PAA y contra la meta 2027 | `Inscritos_DDMMAAAA.xlsx` o `.csv` (carpeta Reportes Real) |
| 2 y 3 · Programado contra real | Asistencias reales (TOTAL_ASISTENCIAS y NUM_TOTAL_ASISTENCIAS, incluyen ELSSA) contra las registradas en el PAA; cumplimiento = real ÷ programado | `Reporte_Activ_Complem_DDMMAAAA.xlsx` y `Reporte_Teatros_DDMMAAAA.xlsx` (carpeta Reportes Real) |

## Estructura del repositorio

```
index.html               Página del tablero (diseño y gráficas). Solo cambia cuando cambia el diseño.
assets/
  base.css               Variables de diseño: paleta institucional y tipografía Noto Sans.
  dash-runtime.js        Motor que carga los datos, aplica los filtros y dibuja las gráficas.
  d3.v7.9.0.min.js       Biblioteca de gráficas D3 (licencia ISC, en d3-LICENSE.txt).
datos/
  manifest.json          Lista de tablas, su archivo y su fecha de actualización.
  avance_*.json          Módulo 1 (7 archivos).
  ac_*.json              Módulo 2 (5 archivos).
  te_*.json              Módulo 3 (3 archivos).
  ri_*.json, rac_*.json, rte_*.json  Avance real de los Módulos 1, 2 y 3.
  unidades_operativas.json, instalaciones.json, layout_2027.json,
  metas_2027.json, metas_2027_uopsi.json        Catálogos y metas (cambian rara vez).
scripts/
  procesar_avance.py             Convierte el REPORTE PAA CURSOS en los archivos avance_*.json.
  procesar_complementarias.py    Convierte el REPORTE PAA ACTIVIDADES COMPLEMENTARIAS en ac_*.json.
  procesar_teatros.py            Convierte el Reporte PAA Teatros en te_*.json.
  procesar_real_complementarias.py  Convierte el Reporte_Activ_Complem (Reportes Real) en rac_*.json.
  procesar_real_teatros.py          Convierte el Reporte_Teatros (Reportes Real) en rte_*.json.
  procesar_real_cursos.py           Convierte el reporte de Inscritos (Reportes Real) en ri_*.json.
  actualizar_desde_drive.py         Descarga los reportes del día de Drive y los procesa (acción diaria de GitHub, 06:25 h).
.nojekyll                Indica a GitHub Pages que publique los archivos tal cual.
```

## Publicar en GitHub Pages

1. Crea un repositorio (por ejemplo `tablero-paa-2027`) y sube todo el contenido de esta carpeta a la rama `main`, conservando la estructura.
2. En el repositorio: **Settings › Pages › Build and deployment › Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`. Guarda.
3. En uno o dos minutos el tablero queda en `https://<usuario>.github.io/tablero-paa-2027/`.

Los filtros quedan en la dirección (por ejemplo `?ooad=9&uo=9-101`), así que se puede compartir la liga de una OOAD o de una Unidad Operativa ya filtrada. Para abrir directamente un módulo se agrega `#modulo-2` o `#modulo-3`.

## Probar en la computadora

El tablero lee sus datos con `fetch`, por lo que no funciona si se abre `index.html` con doble clic. Desde esta carpeta:

```
python -m http.server 8000
```

y abre `http://localhost:8000`.

## Actualización de los datos

Cada actualización cambia **solo los archivos de `datos/`**; `index.html` y `assets/` no se tocan.

1. En Google Drive, dentro de `PAA_2027/Reportes PAA`, se crea una carpeta por día de actualización con los tres reportes del registro (por ejemplo `PAA_2027/Reportes PAA/12112026/`); en `PAA_2027/Reportes Real` va otra carpeta por día con los reportes del avance real. No se cambia el nombre de los archivos: de ahí sale la fecha de corte.
2. Se procesa cada reporte con su script (Python 3 y `openpyxl`; `xlrd` solo si el de teatros es un .xls binario):

```
python3 -I scripts/procesar_avance.py REPORTE_PAA_CURSOS_….xlsx datos/unidades_operativas.json datos/instalaciones.json datos/layout_2027.json datos/avance_corte.json salida1
python3 -I scripts/procesar_complementarias.py REPORTE_PAA_ACOMPLEMENTARIA_….xlsx datos/unidades_operativas.json datos/instalaciones.json datos/ac_corte.json salida2
python3 -I scripts/procesar_teatros.py Reporte_PAA_Teatros_….xls datos/unidades_operativas.json datos/te_corte.json salida3
```

3. Se copian los JSON de `salida1`, `salida2` y `salida3` a `datos/` (reemplazan a los anteriores) y se actualiza en `datos/manifest.json` el campo `actualizado` y `fuente` de cada tabla.
4. Se hace *commit* con un mensaje como `Datos PAA 2027 · corte 12/11/2026`. GitHub Pages publica el cambio en uno o dos minutos.

Los archivos `*_corte.json` acumulan el historial de cortes: el script recibe el publicado y le agrega la fecha nueva, por eso se le pasa siempre el que está en `datos/`.

La leyenda **Fecha de actualización** del tablero toma la fecha de corte más reciente de `avance_corte.json`, `ac_corte.json` y `te_corte.json`.

## Datos personales

Los archivos de `datos/` no contienen nombres ni claves de instructores ni otros datos personales: los scripts solo conservan el tipo de docente y cifras agregadas por Unidad Operativa, instalación, actividad y mes.
