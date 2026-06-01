// === プロット（物語のコンテナ） ===
export interface Plot {
  id: string;

  // --- 基本設定 ---
  title: string; // 題名
  description: string; // 説明・あらすじ

  // --- キャラクター（複数） ---
  characters: PlotCharacter[];

  // --- トークプロフィール（主人公設定） ---
  tokenProfile?: TokenProfile;

  // --- その他プロット項目（今後実装） ---
  // loreBook?: LoreBookEntry[];
  // style?: StyleSettings;
  // intro?: string;
  // introduction?: string;
  // settings?: PlotSettings;

  createdAt: string;
  updatedAt: string;
}

// === プロット内のキャラクター ===
export interface PlotCharacter {
  id: string;
  name: string; // 名前
  avatar: string; // 絵文字
  personality: string; // 性格
  speechStyle: string; // 口調・話し方
  background: string; // 背景・設定
  scenario: string; // シナリオ・現在の状況
  firstMessage: string; // 最初のセリフ
}

// === トークプロフィール（主人公） ===
export interface TokenProfile {
  name: string; // 主人公の名前
  personality: string; // 性格
  background: string; // 背景・設定
  speechStyle?: string; // （任意）話し方の特徴
}

// === メッセージ ===
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string; // 思考プロセス（Claude style）
  characterId?: string; // どのキャラクターが発話したか（複数キャラ対応用）
}
