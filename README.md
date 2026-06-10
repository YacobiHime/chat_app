# zeta-clone

AIキャラクターと自由にチャットできるWebアプリケーション。zeta風の体験をローカル環境で構築しました。

## 🎯 特徴

- **AIキャラクターとのチャット**: キャラクターごとの性格・口調・背景設定に沿った自然な会話
- **プロット管理**: キャラクターを「プロット」という単位でまとめて管理
- **主人公設定**: 各プロットに主人公（TokenProfile）を設定可能
- **ストリーミング応答**: AIの返答がリアルタイムで表示される
- **Web検索機能**: SearXNG / Bluesky を使用したツール呼び出し検索
- **思考プロセス表示**: `<thinking>` タグ内の推論を折りたたみ UI で表示
- **ローカルDB**: Prisma + SQLite によるデータ永続化

## 🛠️ 技術スタック

- **フレームワーク**: Next.js 16.2.6 (App Router)
- **UI**: React 19 + Tailwind CSS v4
- **バックエンド**: Next.js API Routes
- **AI**: Ollama（OpenAI互換API）
- **ORM / DB**: Prisma 6 + SQLite
- **検索**: SearXNG / Bluesky API
- **言語**: TypeScript 5

## 📋 前提条件

- Node.js 18+ がインストールされていること
- Ollamaサーバーが起動していること（デフォルト: `http://192.168.15.150:11434`）
- （任意）SearXNG サーバーが利用可能なこと

## 🚀 セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定（研究室内用）

`.env.local` ファイルを作成して以下の内容を記述：

```env
# Ollama サーバー設定
OLLAMA_BASE_URL=http://192.168.15.150:11434/v1
OLLAMA_MODEL=joe-speedboat/Gemma-4-Uncensored-HauhauCS-Aggressive
OLLAMA_API_KEY=ollama

# データベース（SQLite）
DATABASE_URL="file:./dev.db"

# SearXNG（任意、デフォルト: http://localhost:8080）
SEARXNG_URL=http://localhost:8080
```

### 3. DB マイグレーション実行

```bash
npx prisma migrate dev
```

### 4. （任意）シードデータ投入

```bash
npm run db:seed
```

### 5. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで `http://localhost:3000` にアクセスしてください。

## 📱 使い方

### プロット一覧

トップ画面に登録済みのプロットがカード形式で表示されます。カードをクリックするとチャット画面が開きます。

### 新しいプロットを作成

「新しいプロットを作る」ボタンからプロット作成画面へ遷移し、以下の項目を入力します：

**プロット設定:**
- **タイトル**: プロットのタイトル
- **あらすじ**: プロットの説明

**主人公設定（TokenProfile）:**
- **名前**: 主人公の名前
- **性格**: 主人公の性格
- **背景**: 主人公の背景
- **話し方**: 一人称や話し方の特徴（任意）

**キャラクター設定（複数登録可能）:**
- **キャラクター名**: キャラクターの名前
- **アバター絵文字**: 絵文字（1-2文字）
- **性格**: キャラクターの性格説明
- **口調・話し方**: 一人称、語尾、話し方の特徴
- **背景・設定**: キャラクターの背景や設定
- **シナリオ**: 現在の状況やシチュエーション
- **最初のセリフ**: チャット開始時の最初のメッセージ

### チャット

チャット画面でメッセージを入力して送信すると、AIキャラクターがストリーミングで応答を返します。

**ツール呼び出し検索:**
キャラクターが以下の構文を出力すると、自動的に検索が実行されます：

```
call:web_search{query:<|"|>検索したい言葉<|"|>}<tool_call|>
call:bluesky_search{query:<|"|>検索したい言葉<|"|>}<tool_call|>
```

## 🎨 デザイン

- **ダークテーマ**: 落ち着いた暗めの配色
- **アクセントカラー**: 紫グラデーション（#7c3aed → #a855f7）
- **チャットUI**: LINEライクなバブルデザイン
  - ユーザー: 右側・紫
  - キャラクター: 左側・ダークグレー

## 📁 プロジェクト構成

```
zeta-clone/
├── app/
│   ├── page.tsx              # プロット一覧画面
│   ├── create/
│   │   └── page.tsx          # プロット作成画面
│   ├── chat/
│   │   └── [id]/
│   │       └── page.tsx      # チャット画面
│   ├── api/
│   │   ├── plots/
│   │   │   └── route.ts      # プロット CRUD API
│   │   └── chat/
│   │       └── route.ts      # AI応答API（ストリーミング）
│   ├── layout.tsx            # ルートレイアウト
│   └── globals.css           # グローバルスタイル
├── lib/
│   ├── types.ts              # 共通型定義
│   ├── plots.ts              # Prisma を使ったプロット CRUD
│   ├── prisma.ts             # Prisma クライアント
│   ├── ollama.ts             # Ollama APIクライアント
│   └── searxng.ts            # SearXNG 検索ユーティリティ
├── prisma/
│   ├── schema.prisma         # DB スキーマ定義
│   ├── seed.ts               # シードデータ
│   └── migrations/           # マイグレーションファイル
├── components/
│   └── SearchingIndicator.tsx  # Web 検索中のアニメーション UI
├── .env.local                # 環境変数
├── CLAUDE.md                 # Claude Code 向け注意書き
├── AGENTS.md                 # AI エージェント向け注意書き
└── README.md
```

## 🔧 API エンドポイント

### `GET /api/plots`
プロット一覧を取得

### `GET /api/plots?id={id}`
指定したIDのプロットを取得

### `POST /api/plots`
新しいプロットを作成

### `PUT /api/plots`
プロットを更新

### `DELETE /api/plots?id={id}`
プロットを削除

### `POST /api/chat`
AIチャット応答を取得（ストリーミング）

## 🌐 Ollamaモデルについて

このアプリは以下のOllamaモデルで動作確認しています：

- `joe-speedboat/Gemma-4-Uncensored-HauhauCS-Aggressive`

他のモデルも使用可能ですが、日本語の会話品質やキャラクターとしての振る舞いはモデルによって異なります。

## 📝 ライセンス

MIT

## 🙏謝辞

- zetaアプリのインスピレーション
- Next.jsチーム
- Ollamaプロジェクト
- SearXNGプロジェクト
