# UI/UX Design Training Service

## プロジェクト概要
生成AI時代のUI/UXデザイントレーニングサービス。Daily UI的な100本ノック形式で、画面設計力を実践的に鍛える。

## 開発フェーズ
- **Phase 1（現在）**: mdパッケージ + Claude Codeでローカル実行するプロトタイプ
- **Phase 2（予定）**: Next.js + TypeScript によるブラウザWebアプリ

## 技術スタック
- Phase 1: Markdown + Claude Code
- Phase 2: Next.js / TypeScript / Tailwind CSS / Claude API

## プロジェクト構造
```
challenges/       # トレーニングお題（mdファイル）
  level-1/        # デザイン4原則・視認性（Daily UI的）
  level-2/        # LP設計（コミュニケーションシナリオ）
  level-3/        # サイト/アプリ設計（5画面程度）
docs/             # 設計ドキュメント・コンセプト
prototypes/       # UIプロトタイプ（HTML/CSS）
src/              # Phase 2: Webアプリ本体
```

## コマンド
- Phase 1では該当なし（Claude Codeで直接実行）
- Phase 2で追加予定: `npm run dev`, `npm run build`, `npm test`

## コーディング規約
- 変数名・関数名・コメント・ドキュメント: すべて日本語OK
- UI上のラベル・テキスト: 日本語
- コード構造: シンプル第一。過剰な抽象化をしない
- コミットメッセージ: 日本語

## 設計方針
- アジャイル: コンセプト → 要求 → 要件 → プロトタイプ → 磨き込み → 本開発
- まずは動くプロトタイプで3パターンのUI/UXを試す
- A/Bテスト的にユーザーと磨き込みを繰り返す
- 本開発は要求が固まってから着手

## トレーニングレベル定義
1. **Level 1**: デザイン4原則（近接・整列・反復・コントラスト）を満たす画面設計
2. **Level 2**: LP設計 = コミュニケーションシナリオを1枚に落とし込む
3. **Level 3**: サイト/アプリ設計 = 5画面程度でインタラクション含む体験設計

## レビュー基準
- UIデザイナー視点: 視覚的階層、一貫性、アクセシビリティ
- UXデザイナー視点: ユーザーフロー、情報設計、認知負荷
- 評価: Good point(最大3つ) / Development point(0〜3つ、無理に出さない)
