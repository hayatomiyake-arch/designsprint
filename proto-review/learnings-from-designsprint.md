# DesignSprintプロジェクトからの学び

> 参照元: `/Users/miyakehayato/Desktop/ui-ux-training/`
> GitHub: https://github.com/hayatomiyake-arch/designsprint
> 本番: https://designsprint.pages.dev

---

## 1. アーキテクチャ: ゼロコストでAPIプロキシ付きサービスを公開する方法

**構成**: Cloudflare Pages (静的) + Cloudflare Workers (APIプロキシ)

```
ブラウザ → Cloudflare Pages (静的HTML/JS/CSS)
         → Cloudflare Worker → 外部AI API (Groq/Anthropic等)
```

**なぜこの構成か:**
- Pages: 静的ファイルの配信は完全無料、グローバルCDN
- Workers: APIキーをブラウザに露出させずにプロキシできる（無料枠: 10万リクエスト/日）
- KV: 簡易DBとしてレート制限のカウンタ保存（無料枠: 10万読み取り/日）

**学び:**
- `wrangler secret put KEY_NAME` でAPIキーを安全に管理。コードに含めない
- `wrangler.toml` に KV namespace をバインドし、Worker内で `env.KV.get/put` で操作
- CORS は `ALLOWED_ORIGINS` 環境変数でホワイトリスト管理が柔軟
- `_headers` ファイルでセキュリティヘッダー（CSP, X-Frame-Options等）を一括設定

**落とし穴:**
- `wrangler pages deploy` する前に `wrangler pages project create` が必要（初回のみ）
- Groq等の無料APIキーは有効期限がある。定期的に確認が必要
- Workers の `fetch()` で外部APIを呼ぶ際、レスポンスの `body` は一度しか読めない（clone必要な場合あり）


## 2. AI連携: モデル品質とコストの現実

### モデル品質の差（HTML/CSS生成 + デザインレビュー）

| 観点 | Llama 3.3 (Groq) | Claude Haiku | Claude Sonnet |
|---|---|---|---|
| HTML/CSS正確性 | ○ | ◎ | ◎ |
| デザインの美しさ | △ テンプレ的 | ○ | ◎ 洗練 |
| 指示の忠実度 | △ 無視しがち | ○ | ◎ 細部まで |
| 改善の差分精度 | △ 作り直す | ○ | ◎ 的確に差分 |
| レビューの深さ | △ 表面的 | ○ | ◎ 本質的 |

### コスト実績値（1チャレンジ = 生成×3 + レビュー×3 + 別解生成）

- 1回あたり: Input ~32K tokens, Output ~23K tokens
- Groq無料枠: $0
- Claude Haiku: ~$0.12/回 (~$18/月 @5回/日)
- Claude Sonnet: ~$0.44/回 (~$66/月 @5回/日)

### 重要な学び
- **Claude CodeのサブスクとAnthropic APIは完全に別課金**。APIは従量制でconsole.anthropic.comからクレジット購入
- レビュー（テキスト出力）よりHTML生成（大量出力）の方がトークンコストが高い
- 無料枠で始めて品質を確認→必要に応じてアップグレードする段階的アプローチが有効
- BYOK (Bring Your Own Key) パターンを用意すると、ユーザーが自分のAPIキーで上位モデルを使える


## 3. プロンプト設計: UI/UXレビューの構造化

### レビュー出力の型（実績あり・そのまま流用可能）

```json
{
  "score": 72,
  "verdict": "Improve",
  "good": ["具体的な良い点1", "具体的な良い点2"],
  "dev": ["具体的な改善点1", "具体的な改善点2"],
  "hint": "次に何を改善すべきかの1文アドバイス",
  "takeaways": ["汎用的な学び1", "汎用的な学び2"]
}
```

### プロンプト設計のコツ
- **採点ガイドライン**を明示しないとスコアが甘くなる（LLMは褒めたがる）
- 「JSONのみ出力」と明示しても ```json ``` で囲んでくることがある → パース時にコードブロックを剥がす処理が必要
- Good/Dev は数で稼がせず「クリティカルなもののみ」と指示すると質が上がる
- レビュー観点を「UIデザイナー視点」「UXデザイナー視点」に分けると網羅的になる
- 改善ラウンドでは「前回HTML + フィードバック」を渡し「大幅な作り直しではなく的確に改善」と指示

### 新サービスへの応用ポイント
- プロトタイプレビューでは、ユーザーが「想定ペルソナ」「ゴール」「制約」をどれだけ入力するかで精度が変わる
- 最低限「何のためのUI？」「誰が使う？」の2つがあればレビューは成立する
- 入力が少ない場合はAIに推測させるより「レビューの前提条件」として表示する方が誠実


## 4. フロントエンド: ビルドツール不要の軽量SPA

### 採用した構成
- **Vanilla JS + ES Modules** (import/export) — ビルドなし
- **CSS Variables** でテーマ管理
- **iframe** でプロトタイプをサンドボックス表示（phone frame内）
- **localStorage** で状態管理（チャレンジ結果、BYOK設定、ストリーク等）
- **SPA的画面遷移**: URLパラメータ + 画面divのshow/hide

### 学び
- ビルドツール不要だとデプロイが `wrangler pages deploy .` だけで済む
- iframeでのHTML表示は `srcdoc` 属性が最も手軽。ただしCSSの干渉がないのが利点
- `<meta name="viewport">` を入れ忘れるとモバイル表示が崩れる（基本だが見落としがち）
- ES Modules の `import` はファイルパスの `.js` 拡張子が必須（省略するとブラウザエラー）


## 5. デプロイ手順チートシート

### Cloudflare Pages (静的サイト)
```bash
# 初回
wrangler pages project create <project-name> --production-branch main
wrangler pages deploy . --project-name <project-name> --commit-dirty=true

# 更新
wrangler pages deploy . --project-name <project-name> --commit-dirty=true
```

### Cloudflare Workers (APIプロキシ)
```bash
cd worker/
wrangler deploy                           # コードデプロイ
wrangler secret put GROQ_API_KEY          # シークレット設定（対話入力）
wrangler secret put ALLOWED_ORIGINS       # CORS許可オリジン
```

### GitHub
```bash
gh repo create <name> --public --source . --push
```


## 6. 新サービス（proto-review）への直接的な示唆

1. **プロトタイプ表示**: DesignSprintのiframe + phone frameパターンはそのまま使える
2. **レビューJSON構造**: score / good / dev 形式は実証済み。verdict を省いて good/dev に集中するのもあり
3. **マルチバージョン比較**: DesignSprintの「3列比較 + 比較テーブル」UIは参考になる
4. **API構成**: Worker プロキシパターンは同じ構成で流用可能
5. **コスト管理**: 最初はGroq無料枠でMVP → 品質確認後にClaude Haikuへアップグレードが安全
6. **入力設計の課題**: DesignSprintでは「お題」としてペルソナ/ゴール/制約を事前定義していた。新サービスではユーザーが自由にプロトタイプを持ち込むため、レビューに必要なコンテキスト（誰向け？何のため？）をどう収集するかが最大の設計課題
