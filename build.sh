#!/bin/sh
# Regenera descargas/ a partir de plantilla-libro-latex/
# Uso: ./build.sh   (necesita zip; tectonic o pdflatex opcional para el PDF de ejemplo)
set -e
cd "$(dirname "$0")"
rm -f descargas/plantilla-libro-latex.zip
(cd plantilla-libro-latex && zip -qr ../descargas/plantilla-libro-latex.zip . -x '*.DS_Store' '*.aux' '*.log' '*.toc' '*.out' '*.pdf')
if command -v tectonic >/dev/null 2>&1; then
  tmp=$(mktemp -d); cp -R plantilla-libro-latex/. "$tmp"
  (cd "$tmp" && tectonic -X compile libro.tex >/dev/null)
  cp "$tmp/libro.pdf" descargas/ejemplo-libro-plantilla.pdf; rm -rf "$tmp"
fi
ls -la descargas
