#!/bin/sh
# build.sh — デプロイ時に環境変数を config.js に注入
#
# Cloudflare Pages の設定:
#   Build command:          sh build.sh
#   Build output directory: /
#   環境変数:               WORKER_URL = https://designsprint-proxy.YOUR_SUBDOMAIN.workers.dev

if [ -n "$WORKER_URL" ]; then
  # macOS: sed -i ''、Linux: sed -i（Cloudflare Pages は Linux）
  if [ "$(uname)" = "Darwin" ]; then
    sed -i '' "s|WORKER_URL: ''|WORKER_URL: '$WORKER_URL'|" js/config.js
  else
    sed -i "s|WORKER_URL: ''|WORKER_URL: '$WORKER_URL'|" js/config.js
  fi
  echo "✅ WORKER_URL を注入しました: $WORKER_URL"
else
  echo "⚠️  WORKER_URL が未設定です（BYOK モードのみ動作）"
fi
