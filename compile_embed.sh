#!/bin/bash

# Este script compila index.html, styles.css, palettes.js y app.js
# junto con todas las imágenes JPG codificadas en Base64 en un único
# archivo auto-contenido llamado "google-sites-embed.html".

OUTPUT="google-sites-embed.html"
echo "Iniciando compilación de $OUTPUT..."

# 1. Codificar imágenes a Base64 y generar el script de datos
echo "Codificando imágenes JPG a Base64..."

MANDALAS_DATA_JS="window.MANDALAS_DATA = ["

# Array de mandalas para iterar en el orden correcto
declare -a FILES=(
  "MANDALAS_Mesa de trabajo 1.jpg"
  "MANDALAS_Mesa de trabajo 1 copia.jpg"
  "MANDALAS_Mesa de trabajo 1 copia 2.jpg"
  "MANDALAS_Mesa de trabajo 1 copia 3.jpg"
  "MANDALAS_Mesa de trabajo 1 copia 4.jpg"
  "MANDALAS_Mesa de trabajo 1 copia 6.jpg"
  "MANDALAS_Mesa de trabajo 1 copia 7.jpg"
  "MANDALAS_Mesa de trabajo 1 copia 8.jpg"
)

declare -a NAMES=(
  "Mandala 1"
  "Mandala 2"
  "Mandala 3"
  "Mandala 4"
  "Mandala 5"
  "Mandala 6"
  "Mandala 7"
  "Mandala 8"
)

for i in "${!FILES[@]}"; do
  FILE="${FILES[$i]}"
  NAME="${NAMES[$i]}"
  ID="mandala$((i+1))"
  
  if [ -f "$FILE" ]; then
    echo "  - Procesando: $FILE"
    # Codificar a base64 (sin saltos de línea en macOS)
    B64_DATA=$(base64 -i "$FILE")
    MANDALAS_DATA_JS="$MANDALAS_DATA_JS
  { id: '$ID', name: '$NAME', file: 'data:image/jpeg;base64,$B64_DATA' },"
  else
    echo "  - ¡Error! No se encontró el archivo: $FILE"
  fi
done

# Quitar la última coma y cerrar array
MANDALAS_DATA_JS="${MANDALAS_DATA_JS%,}
];"

# 2. Generar el archivo combinando todo
echo "Generando archivo final de distribución..."

# Limpiamos el archivo de salida
> "$OUTPUT"

while IFS= read -r line || [ -n "$line" ]; do
  if [[ "$line" == *'<link rel="stylesheet" href="styles.css">'* ]]; then
    echo "<style>" >> "$OUTPUT"
    cat styles.css >> "$OUTPUT"
    echo "</style>" >> "$OUTPUT"
  elif [[ "$line" == *'<script src="palettes.js"></script>'* ]]; then
    echo "<script>" >> "$OUTPUT"
    cat palettes.js >> "$OUTPUT"
    echo "</script>" >> "$OUTPUT"
  elif [[ "$line" == *'<script src="app.js"></script>'* ]]; then
    echo "<script>" >> "$OUTPUT"
    echo "$MANDALAS_DATA_JS" >> "$OUTPUT"
    echo "" >> "$OUTPUT"
    cat app.js >> "$OUTPUT"
    echo "</script>" >> "$OUTPUT"
  else
    echo "$line" >> "$OUTPUT"
  fi
done < index.html

echo "¡Listo! El archivo '$OUTPUT' se ha generado con éxito y contiene todo el código y las imágenes integradas."
