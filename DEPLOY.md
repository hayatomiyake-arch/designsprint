# DesignSprint デプロイ手順

## アーキテクチャ

```
┌──────────────────────────────┐
│  Cloudflare Pages（無料）     │  ← 静的ファイル配信
│  HTML / CSS / JS             │
└──────────┬───────────────────┘
           │ ブラウザ
           ▼
┌──────────────────────────────┐
│  Cloudflare Worker（無料）    │  ← API プロキシ
│  - CORS 制御                 │
│  - レート制限（KV）          │
│  - APIキー秘匿              │
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  Groq API（無料）            │  ← AI生成エンジン
│  llama-3.3-70b-versatile     │
└──────────────────────────────┘
```

**コスト: $0/月**
- Cloudflare Pages: 無料（無制限帯域）
- Cloudflare Workers: 無料（10万リクエスト/日）
- Cloudflare KV: 無料（10万読取/日, 1,000書込/日）
- Groq API: 無料枠（30 RPM, 14,400 RPD）

---

## 前提条件

- [Cloudflare アカウント](https://dash.cloudflare.com/sign-up)（無料）
- [Groq アカウント](https://console.groq.com/)（無料）
- Node.js 18+ / npm（wrangler CLI 用）

---

## Step 1: Groq APIキーを取得

1. https://console.groq.com/keys にアクセス
2. 「Create API Key」をクリック
3. `gsk_...` で始まるキーをコピー（**安全な場所に保存**）

---

## Step 2: Cloudflare Worker をデプロイ

```bash
# worker ディレクトリに移動
cd worker

# wrangler CLIをインストール（グローバル or npx）
npm install -g wrangler
# もしくは npx wrangler ... で毎回実行

# Cloudflare にログイン
wrangler login

# KV Namespace を作成
wrangler kv:namespace create RATE_LIMIT
```

**↑ 返却される `id` をメモ！** 例:
```
🌀 Creating namespace "designsprint-proxy-RATE_LIMIT"
✨ id = "abc123def456..."
```

この `id` を `wrangler.toml` に書き込む:

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "ここに返却されたidを貼り付け"
```

次にシークレットを設定:

```bash
# Groq APIキーを登録（プロンプトでキーを入力）
wrangler secret put GROQ_API_KEY

# 許可オリジンを登録（Pages のURLをカンマ区切り）
wrangler secret put ALLOWED_ORIGINS
# 入力例: https://designsprint.pages.dev,https://your-custom-domain.com
```

デプロイ:

```bash
wrangler deploy
```

**成功すると Worker URL が表示される:**
```
Published designsprint-proxy (1.00 sec)
  https://designsprint-proxy.YOUR_SUBDOMAIN.workers.dev
```

---

## Step 3: Cloudflare Pages にデプロイ

> **注意**: Worker URL はコードに直書きせず、環境変数で注入します（`build.sh` が自動処理）

### 方法A: GitHub連携（推奨）

1. GitHubにリポジトリをpush
2. Cloudflare Dashboard → Pages → 「Create a project」
3. GitHubリポジトリを選択
4. ビルド設定:
   - **Framework**: None
   - **Build command**: `sh build.sh`
   - **Build output directory**: `/`（ルート）
5. **環境変数を設定**（Settings → Environment variables）:
   - `WORKER_URL` = `https://designsprint-proxy.YOUR_SUBDOMAIN.workers.dev`
6. 「Save and Deploy」

### 方法B: 直接アップロード

```bash
# 環境変数を設定してビルド → デプロイ
WORKER_URL='https://designsprint-proxy.YOUR_SUBDOMAIN.workers.dev' sh build.sh
wrangler pages deploy . --project-name designsprint
```

---

## Step 5: ALLOWED_ORIGINS を更新

Pages のURL が確定したら、Worker のオリジン許可リストを更新:

```bash
cd worker
wrangler secret put ALLOWED_ORIGINS
# 入力: https://designsprint.pages.dev
```

---

## Step 6: 動作確認

1. Pages URL にアクセス
2. Level 1 のチャレンジを選択
3. テキスト指示を入力して「生成」
4. AIがデザインを生成 → レビュー → 改善サイクルが動くことを確認

### トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| `Origin not allowed` | ALLOWED_ORIGINS にPages URLが未設定 | `wrangler secret put ALLOWED_ORIGINS` で設定 |
| `Server config error` | GROQ_API_KEY が未設定 | `wrangler secret put GROQ_API_KEY` で設定 |
| `本日のフリー枠を使い切りました` | 日35回のレート制限 | 翌日にリセット or BYOKモードに切替 |
| CORS エラー | Worker URL が config.js と不一致 | `WORKER_URL` を正しいURLに更新 |
| `AIに接続できません` | `WORKER_URL` が空 | config.js に Worker URL を設定 |

---

## セキュリティ

- ✅ Groq APIキー → Worker 環境変数（ブラウザに露出しない）
- ✅ CORS → 許可オリジンのみ応答
- ✅ IP → FNV-1a ハッシュ化（生IP非保存）
- ✅ レート制限 → KV で日次カウント
- ✅ プロンプト長制限 → 20,000文字
- ✅ AI生成HTML → `<iframe sandbox>` で隔離
- ✅ BYOKキー → localStorage（same-origin保護）

---

## カスタムドメイン（任意）

Cloudflare に自分のドメインを追加している場合:

1. Pages → Custom domains → ドメイン追加
2. Worker にもカスタムルートを設定可能:

```toml
# wrangler.toml に追加
[routes]
routes = [
  { pattern = "api.your-domain.com/*", zone_name = "your-domain.com" }
]
```
