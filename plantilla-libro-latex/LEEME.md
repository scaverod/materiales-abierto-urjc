# Plantilla LaTeX: «el libro» de la convocatoria 2026-2027

Convocatoria URJC de materiales docentes en acceso abierto 2026-2027.
Todo lo bibliográfico (categorías 0-3 y 6-8) va en **un solo depósito** de BURJC Digital, y su elemento principal es **un único PDF organizado como un libro** (Anexo III).

## Uso rápido en Overleaf

1. Overleaf → *New project* → *Upload project* → sube este ZIP.
2. Edita `datos.tex`: nombre temático, autores, grados, año, licencia (`by` o `by-sa`).
   También puedes generarlo desde la web, en la sección «Textos listos».
3. Sube tus PDF a `materiales/<categoría>/`. Usa nombres **sin espacios ni tildes**
   (en local puedes lanzar `python3 tools/quitar_tildes.py` dentro de la carpeta).
4. En cada `capitulos/*.tex`, pon una línea `\material{Título}{ruta.pdf}{Descripción}` por fichero.
   Si falta un PDF, el libro compila igualmente y muestra un aviso en rojo.
5. En `libro.tex`, comenta con `%` los capítulos de las categorías que no presentes.
6. Compila con **pdfLaTeX** y descarga el PDF.
7. Renómbralo como `<Nombre_tematico>.pdf`: el nombre temático con guiones bajos
   en lugar de espacios. Ejemplo: `Estructuras_de_Datos.pdf`.

## Qué comprobar antes de depositar

- La portada incluye título, autores, fecha, «Material docente en abierto de la Universidad Rey Juan Carlos», asignatura(s) y grado(s), lugar de depósito y logo de la licencia.
- La 2.ª página lleva la nota de copyright completa y la licencia detallada.
- La declaración de IA solo es obligatoria si has incluido contenido generado por IA. Si no es tu caso, bórrala.
- El índice deja claro qué temas cubre cada categoría.
- Los materiales de terceros están citados o tienen permiso.

## Qué más subir al mismo depósito (adjuntos)

- Un ZIP con los **fuentes editables**: este proyecto LaTeX, `.pptx`/`.odp`, `.docx`/`.odt`… Si has usado IA, incluye también los prompts y el proceso.
- El **código fuente** en ZIP/tar.gz (cat. 6), también depositado en Software Heritage (SWHID).
- Ficheros **importables en Moodle** (`.mbz`, `.h5p`, XML…) para la cat. 7.
- Opcionalmente, PDF sueltos (por ejemplo, cada presentación) descritos como tales.

Plantilla derivada del libro de *Estructuras de Datos* (S. Cavero Díaz y S. Sánchez Alonso). Licencia: CC BY-SA 4.0.
