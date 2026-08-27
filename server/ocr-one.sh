#!/bin/bash
f="$1"
base=$(basename "$f" .pdf)
outdir="/workspace/server/data/textbook-ocr"
out="$outdir/$base.txt"
dir=$(mktemp -d /tmp/ocrw_XXXX)
pages=$(pdfinfo "$f" | awk '/Pages/{print $2}')
marker="$outdir/$base.pagemax"
start=1
[ -f "$marker" ] && start=$(cat "$marker")
[ -f "$out" ] || : > "$out"
echo "OCR $base: sahifalar $start..$pages / $pages $(date +%T)"
pg=$start
while [ $pg -le $pages ]; do
  pdftoppm -png -r 150 -f "$pg" -l "$pg" "$f" "$dir/p" >/dev/null 2>&1
  img=$(ls "$dir"/p-*.png 2>/dev/null | head -1)
  if [ -n "$img" ]; then
    OMP_THREAD_LIMIT=1 tesseract "$img" "$dir/o" -l kaz --psm 4 >/dev/null 2>&1
    printf '\n-- SAHIFA %s --\n' "$pg" >> "$out"
    cat "$dir/o.txt" >> "$out" 2>/dev/null
    rm -f "$img" "$dir/o.txt"
  fi
  pg=$((pg+1))
  [ $((pg % 25)) -eq 0 ] && { echo $pg > "$marker"; echo "  $base: $pg/$pages $(date +%T)"; }
done
rm -rf "$dir" "$marker"
touch "$outdir/$base.done"
echo "DONE $base ($pages sahifa) $(wc -c < "$out") belgi $(date +%T)"
