# chat_app (zeta-clone) — プロジェクト概要

> Claude Code が作業を始める前に読むドキュメントです。  
> リポジトリ: `https://github.com/YacobiHime/chat_app.git`

---

## 1. アプリ概要

AIキャラクターと自由にチャットできる Web アプリ（zeta 風のローカル動作クローン）。  
「プロット（物語）」という単位でキャラクターをまとめ、複数のキャラクターを一つのプロットに登録して会話できる。

### 主な機能

| 機能 | 概要 |
|---|---|
| プロット一覧 | 登録済みのプロットをカード形式で表示 |
| プロット作成 | タイトル・あらすじ・キャラクター設定・主人公（TokenProfile）を入力して保存 |
| チャット | プロットを選択し、キャラクターと SSE ストリーミングで会話 |
| Web 検索 | キャラクターが会話中に DuckDuckGo / Bluesky を自動検索（ツール呼び出し構文で制御） |
| 思考プロセス表示 | `<think>` タグ内の推論を折りたたみ UI で表示 |

---

## 2. 技術スタック

| レイヤー | 採用技術 |
|---|---|
| フレームワーク | **Next.js 16.2.6**（App Router） |
| UI | **React 19** + **Tailwind CSS v4** |
| 言語 | **TypeScript 5** |
| ORM / DB | **Prisma 6** + **SQLite** |
| AI バックエンド | **Ollama**（OpenAI 互換 API、`openai` npm パッケージ経由） |
| ストリーミング | Server-Sent Events (SSE) |
| 検索 | SearXNG（Web検索） / Bluesky API |

> ⚠️ `AGENTS.md` に明記されているように、このプロジェクトで使用している **Next.js はトレーニングデータと異なる Breaking Change を含む可能性がある**。コードを書く前に必ず `node_modules/next/dist/docs/` 配下のガイドを確認すること。

---

## 3. ディレクトリ構成

```
chat_app/
├── app/                          # Next.js App Router のルート
│   ├── page.tsx                  # / ── プロット一覧画面
│   ├── create/
│   │   └── page.tsx              # /create ── プロット作成画面
│   ├── chat/
│   │   └── [id]/
│   │       └── page.tsx          # /chat/[id] ── チャット画面
│   ├── api/
│   │   ├── plots/
│   │   │   └── route.ts          # プロット CRUD API
│   │   └── chat/
│   │       └── route.ts          # AI チャット（SSE ストリーミング）API
│   ├── layout.tsx                # ルートレイアウト
│   └── globals.css               # グローバルスタイル
│
├── components/
│   └── SearchingIndicator.tsx    # Web 検索中のアニメーション UI
│
├── lib/
│   ├── types.ts                  # 共通型定義（Plot / PlotCharacter / TokenProfile / Message）
│   ├── plots.ts                  # Prisma を使ったプロット CRUD ロジック
│   ├── prisma.ts                 # Prisma クライアント初期化
│   ├── ollama.ts                 # Ollama クライアント初期化
│   └── searxng.ts                # SearXNG 検索ユーティリティ
│
├── prisma/
│   ├── schema.prisma             # DB スキーマ定義
│   ├── seed.ts                   # 初期データ投入スクリプト
│   └── migrations/               # Prisma マイグレーションファイル
│
├── data/
│   └── plots.json                # （旧）JSON ファイル保存データ（現在は DB に移行済み）
│
├── public/                       # 静的アセット
├── .env.local                    # 環境変数（要作成）
├── CLAUDE.md                     # Claude Code 向けの注意書き
├── AGENTS.md                     # AI エージェント向けの注意書き
├── package.json
└── tsconfig.json
```

---

## 4. データモデル

### `Plot`（プロット）

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | String (cuid) | PK |
| `title` | String | プロットのタイトル |
| `description` | String | あらすじ |
| `characters` | Character[] | 所属キャラクター（1 対多） |
| `tokenProfile` | Json? | 主人公の設定（任意）|
| `createdAt` / `updatedAt` | DateTime | タイムスタンプ |

### `Character`（キャラクター）

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | String (cuid) | PK |
| `plotId` | String | 親プロットの FK（Cascade 削除） |
| `name` | String | キャラクター名 |
| `avatar` | String | 絵文字アバター |
| `personality` | String | 性格 |
| `speechStyle` | String | 口調・話し方 |
| `background` | String | 背景・設定 |
| `scenario` | String | 現在のシチュエーション |
| `firstMessage` | String | チャット開始時の最初のセリフ |

### `TokenProfile`（主人公設定、Plotの `tokenProfile` JSON フィールドに格納）

| フィールド | 型 | 説明 |
|---|---|---|
| `name` | String | 主人公の名前 |
| `personality` | String | 性格 |
| `background` | String | 背景 |
| `speechStyle` | String? | 話し方（任意） |

---

## 5. API エンドポイント

### `/api/plots`

| メソッド | パラメータ | 説明 |
|---|---|---|
| GET | `?id={id}` なし → 全件、あり → 単件 | プロット取得 |
| POST | body: `{ title, description, characters[], tokenProfile? }` | プロット作成 |
| PUT | body: `{ id, ...updates }` | プロット更新 |
| DELETE | `?id={id}` | プロット削除 |

### `/api/chat`

| メソッド | 説明 |
|---|---|
| POST | SSE ストリーミングで AI 応答を返す。body: `{ plotId, characterId, messages[] }` |

**SSE イベントの種類（`/api/chat`）:**

```
{ text: string }              // 通常テキスト（チャンク）
{ reasoning: string }         // 思考プロセス（<think> タグ内）
{ searchStatus: { stage, query?, tool? } }  // 検索ステータス
{ searchResults: [...] }      // 検索結果
{ search_url, url_status, url_title? }      // 個別 URL 取得状況
[DONE]                        // ストリーム終了
```

---

## 6. 重要なロジック

### ツール呼び出し（AI 検索）

チャット API は、Ollama モデルが以下の構文を出力したときに Web 検索をトリガーする：

```
call:web_search{query:<|"|>検索クエリ<|"|>}<tool_call|>
call:bluesky_search{query:<|"|>検索クエリ<|"|>}<tool_call|>
```

検出後、**SearXNG** または Bluesky API で検索し、結果をシステムメッセージとして追加したうえで再度 Ollama にリクエストを送る。**ツール呼び出しは 1 回のみ**（二重呼び出しは無視）。

**SearXNG について:**
- ブラウザレスな検索エンジン（Playwright は不要）
- `.env.local` で `SEARXNG_URL` を設定可能（デフォルト: `http://localhost:8080`）

### 思考プロセスの分離（`parseThinkingStream`）

ストリームを逐次パースし、`<think>...</think>` 内のテキストを `reasoning` イベントとして分離、それ以外を `text` イベントとして流す。

### キャラクター切り替え

チャット画面でキャラクターを切り替えると会話履歴がリセットされ、新しいキャラクターの `firstMessage` が初期メッセージとして設定される。

---

## 7. 環境変数

`.env.local` ファイルを作成し、以下を設定する：

```env
# Ollama サーバーの URL（OpenAI 互換エンドポイント）
OLLAMA_BASE_URL=http://192.168.15.150:11434/v1

# 使用するモデル名
OLLAMA_MODEL=joe-speedboat/Gemma-4-Uncensored-HauhauCS-Aggressive

# Ollama の API キー（固定値）
OLLAMA_API_KEY=ollama

# Prisma が使う SQLite ファイルのパス
DATABASE_URL="file:./dev.db"

# SearXNG の URL（任意、デフォルト: http://localhost:8080）
SEARXNG_URL=http://localhost:8080
```

---

## 8. セットアップ手順

```bash
# 1. 依存関係インストール
npm install

# 2. .env.local を作成（上記を参考に）

# 3. DB マイグレーション実行
npx prisma migrate dev

# 4. （任意）シードデータ投入
npm run db:seed

# 5. 開発サーバー起動
npm run dev
# → http://localhost:3000
```

---

## 9. 既知の問題・メモ

- `data/plots.json` は旧バージョンの遺物。現在のデータは SQLite DB（Prisma）で管理されており、このファイルは使用されていない。

---

## 10. デザイン指針

- **カラースキーム**: ダークテーマ（背景 `#0f0f0f` / カード `#1a1a1a`）
- **アクセントカラー**: 紫グラデーション（`#7c3aed` → `#a855f7`）
- **チャットバブル**: ユーザー → 右・紫、キャラクター → 左・ダークグレー（LINE ライク）
- **フォント/スタイル**: Tailwind CSS v4 のユーティリティクラスのみ使用