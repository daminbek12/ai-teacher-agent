#!/bin/bash
cd /workspace/server/data/textbooks-history
mkdir -p /workspace/server/data/textbook-ocr
for f in tarix_*.pdf; do
  base="${f%.pdf}"
  out="/workspace/server/data/textbook-ocr/$base.txt"
  [ -f "$out" ] && { echo "skip $base"; continue; }
  chars=$(pdftotext "$f" - 2>/dev/null | wc -c)
  if [ "$chars" -gt 20000 ]; then
    echo "TEXTLAYER $base ($chars chars) - skipping OCR"
    continue
  fi
  pages=$(pdfinfo "$f" 2>/dev/null | awk '/Pages/{print $2}')
  echo "OCR START $base ($pages pages) at $(date +%T)"
  : > "$out"
  for pg in $(seq 1 "$pages"); do
    pdftoppm -png -r 170 -f "$pg" -l "$pg" "$f" "/workspace/server/data/textbook-ocr/tmp_$base" >/dev/null 2>&1
    img=$(ls /workspace/server/data/textbook-ocr/tmp_$base-*.png 2>/dev/null | head -1)
    if [ -n "$img" ]; then
      tesseract "$img" /workspace/server/data/textbook-ocr/tmp_tess -l kaz --psm 4 >/dev/null 2>&1
      echo "-- SAHIFA $pg --" >> "$out"
      cat /workspace/server/data/textbook-ocr/tmp_tess.txt >> "$out" 2>/dev/null
      rm -f /workspace/server/data/textbook-ocr/tmp_$base-*.png /workspace/server/data/textbook-ocr/tmp_tess.txt
    fi
    [ $((pg % 25)) -eq 0 ] && echo "  $base: $pg/$pages at $(date +%T)"
  done
  echo "OCR DONE $base at $(date +%T) ($(wc -c < "$out") chars)"
done
echo "ALL DONE"
