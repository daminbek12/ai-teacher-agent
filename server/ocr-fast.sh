#!/bin/bash
f="$1"
base=$(basename "$f" .pdf)
outdir="/workspace/server/data/textbook-ocr"
out="$outdir/$base.txt"
[ -f "$outdir/$base.done" ] && { echo "SKIP $base (done)"; exit 0; }
pages=$(pdfinfo "$f" | awk '/Pages/{print $2}')
start=1
if [ -f "$out" ]; then
  last=$(grep -oE 'SAHIFA [0-9]+' "$out" | grep -oE '[0-9]+' | sort -n | tail -1)
  [ -n "$last" ] && start=$((last + 1))
fi
echo "OCR $base: sahifalar $start..$pages / $pages $(date +%T)"
dir=$(mktemp -d /tmp/ocrw_XXXX)
pg=$start
while [ $pg -le $pages ]; do
  pdfimages -p -j -f "$pg" -l "$pg" "$f" "$dir/i" >/dev/null 2>&1
  for img in "$dir"/i-*; do
    [ -f "$img" ] || continue
    OMP_THREAD_LIMIT=1 tesseract "$img" "$dir/o" -l kaz --psm 4 >/dev/null 2>&1
    printf '\n-- SAHIFA %s --\n' "$pg" >> "$out"
    cat "$dir/o.txt" >> "$out" 2>/dev/null
    rm -f "$img" "$dir/o.txt"
  done
  rm -f "$dir"/i-*
  pg=$((pg + 1))
  [ $((pg % 30)) -eq 0 ] && echo "  $base: $pg/$pages $(date +%T)"
done
rm -rf "$dir"
touch "$outdir/$base.done"
echo "DONE $base ($pages sahifa) $(wc -c < "$out") belgi $(date +%T)"
