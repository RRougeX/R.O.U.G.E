#!/usr/bin/env bash
# Checks that every book R.O.U.G.E offers still exists on the Kiwix server.
# Run it now and then (needs internet): ./scripts/check-books.sh
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0
while read -r folder prefix; do
  f=$(curl -fsSL "https://download.kiwix.org/zim/$folder/" | grep -oE "${prefix}_[0-9]{4}-[0-9]{2}\.zim" | sort -u | tail -1)
  if [ -n "$f" ]; then echo "ok       $f"; else echo "MISSING  $folder/$prefix"; fail=1; fi
done < <(grep -oE '"[a-z]+", "[a-z0-9_-]+"\},$' server/content.go | tr -d '",}' | awk '{print $1, $2}')
exit $fail
