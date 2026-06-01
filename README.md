# zeta-clone

AIキャラクターと自由にチャットできるWebアプリケーション。zeta風の体験をローカル環境で構築しました。

## 🎯 特徴

- **AIキャラクターとのチャット**: キャラクターごとの性格・口調・背景設定に沿った自然な会話
- **キャラクター作成**: オリジナルのAIキャラクターを作成可能
- **ストリーミング応答**: AIの返答がリアルタイムで表示される
- **ローカル完結**: JSONファイルによるデータ永続化、外部DB不要

## 🛠️ 技術スタック

- **フロントエンド**: Next.js (App Router) + Tailwind CSS
- **バックエンド**: Next.js API Routes
- **AI**: Ollama（OpenAI互換API）
- **言語**: TypeScript
- **HTTPクライアント**: openai npm パッケージ

## 📋 前提条件

- Node.js 18+ がインストールされていること
- Ollamaサーバーが起動していること（デフォルト: `http://192.168.15.150:11434`）

## 🚀 セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local` ファイルを作成して以下の内容を記述：

```env
OLLAMA_BASE_URL=http://192.168.15.150:11434/v1
OLLAMA_MODEL=joe-speedboat/Gemma-4-Uncensored-HauhauCS-Aggressive
OLLAMA_API_KEY=ollama
```

※ Ollamaサーバーのアドレスやモデル名は環境に合わせて変更してください。

### 3. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで `http://localhost:3000` にアクセスしてください。

## 📱 使い方

### キャラクターを選択

トップ画面に表示されるキャラクターカードをクリックすると、チャット画面が開きます。

### 新しいキャラクターを作成

「新しいキャラを作る」ボタンからキャラクター作成画面へ遷移し、以下の項目を入力します：

- **キャラクター名**: キャラクターの名前
- **アバター絵文字**: 絵文字（1-2文字）
- **性格**: キャラクターの性格説明
- **口調・話し方**: 一人称、語尾、話し方の特徴
- **背景・設定**: キャラクターの背景や設定
- **シナリオ**: 現在の状況やシチュエーション
- **最初のセリフ**: チャット開始時の最初のメッセージ

### チャット

チャット画面でメッセージを入力して送信すると、AIキャラクターがストリーミングで応答を返します。

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
│   ├── page.tsx              # キャラクター一覧画面
│   ├── create/
│   │   └── page.tsx          # キャラクター作成画面
│   ├── chat/
│   │   └── [id]/
│   │       └── page.tsx      # チャット画面
│   ├── api/
│   │   ├── characters/
│   │   │   └── route.ts      # キャラクターCRUD API
│   │   └── chat/
│   │       └── route.ts      # AI応答API（ストリーミング）
│   ├── layout.tsx            # ルートレイアウト
│   └── globals.css           # グローバルスタイル
├── lib/
│   ├── characters.ts         # キャラクターデータ管理
│   └── ollama.ts             # Ollama APIクライアント
├── data/
│   └── characters.json       # キャラクター保存先
├── .env.local                # 環境変数
└── README.md
```

## 🔧 API エンドポイント

### `GET /api/characters`
キャラクター一覧を取得

### `GET /api/characters?id={id}`
指定したIDのキャラクターを取得

### `POST /api/characters`
新しいキャラクターを作成

### `PUT /api/characters`
キャラクターを更新

### `DELETE /api/characters?id={id}`
キャラクターを削除

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
