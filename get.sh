#!/usr/bin/env bash
# One-line installer: downloads the latest R.O.U.G.E release and runs its installer.
#   curl -fsSL https://raw.githubusercontent.com/RRougeX/rouge/main/get.sh | bash
set -euo pipefail
REPO="${ROUGE_REPO:-RRougeX/rouge}"
DIR="${ROUGE_SRC:-$HOME/rouge-install}"
echo "==> Downloading R.O.U.G.E from github.com/$REPO"
rm -rf "$DIR" && mkdir -p "$DIR"
curl -fL --progress-bar "https://github.com/$REPO/releases/latest/download/rouge.tar.gz" | tar -xz -C "$DIR" --strip-components=1
cd "$DIR"
# the installer asks questions, so connect it to the terminal even when piped from curl
exec ./install.sh "$@" < /dev/tty
