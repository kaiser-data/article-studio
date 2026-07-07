#!/bin/bash
# Doppelklick zum Starten von Article Studio.
# Startet den lokalen Article-Studio-Backendserver und öffnet die App in Chrome.
cd "$(dirname "$0")" || exit 1
PORT=${PORT:-8765}

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js ist nicht installiert. Bitte Node installieren und erneut starten."
  exit 1
fi

# Backend starten, falls noch nicht aktiv. Wenn 8765 von einem alten statischen
# Server belegt ist, automatisch auf den nächsten Port ausweichen.
STARTED=0
for CANDIDATE in "$PORT" 8766 8767 8768; do
  if curl -s -o /dev/null "http://127.0.0.1:$CANDIDATE/api/health"; then
    PORT="$CANDIDATE"
    STARTED=1
    break
  fi
  PORT="$CANDIDATE" node server.js >/tmp/article-studio-server-$CANDIDATE.log 2>&1 &
  sleep 1
  if curl -s -o /dev/null "http://127.0.0.1:$CANDIDATE/api/health"; then
    PORT="$CANDIDATE"
    STARTED=1
    break
  fi
done

if [ "$STARTED" != "1" ]; then
  echo "Konnte den Article-Studio-Backendserver nicht starten."
  echo "Prüfe die Logs: /tmp/article-studio-server-*.log"
  exit 1
fi

open -a "Google Chrome" "http://127.0.0.1:$PORT/index.html" 2>/dev/null \
  || open -a "Brave Browser" "http://127.0.0.1:$PORT/index.html"

echo "Article Studio läuft auf http://127.0.0.1:$PORT"
echo "Backend-Log: /tmp/article-studio-server-$PORT.log"
