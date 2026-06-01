"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Character {
  id: string;
  name: string;
  avatar: string;
  personality: string;
  speechStyle: string;
  background: string;
  scenario: string;
  firstMessage: string;
}

interface TokenProfile {
  name: string;
  personality: string;
  background: string;
  speechStyle: string;
}

export default function CreatePlot() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [characters, setCharacters] = useState<Character[]>([
    {
      id: "char-1",
      name: "",
      avatar: "",
      personality: "",
      speechStyle: "",
      background: "",
      scenario: "",
      firstMessage: "",
    },
  ]);
  const [tokenProfile, setTokenProfile] = useState<TokenProfile>({
    name: "",
    personality: "",
    background: "",
    speechStyle: "",
  });
  const [useTokenProfile, setUseTokenProfile] = useState(false);

  const addCharacter = () => {
    const newId = `char-${characters.length + 1}`;
    setCharacters([
      ...characters,
      {
        id: newId,
        name: "",
        avatar: "",
        personality: "",
        speechStyle: "",
        background: "",
        scenario: "",
        firstMessage: "",
      },
    ]);
  };

  const removeCharacter = (id: string) => {
    if (characters.length > 1) {
      setCharacters(characters.filter((c) => c.id !== id));
    }
  };

  const updateCharacter = (id: string, field: keyof Character, value: string) => {
    setCharacters(
      characters.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const plotData = {
        title,
        description,
        characters: characters,
        tokenProfile: useTokenProfile ? tokenProfile : undefined,
      };

      const res = await fetch("/api/plots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plotData),
      });

      if (res.ok) {
        router.push("/");
      } else {
        alert("プロットの作成に失敗しました");
      }
    } catch (error) {
      console.error("Failed to create plot:", error);
      alert("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] p-8">
      <div className="max-w-4xl mx-auto">
        {/* ヘッダー */}
        <div className="mb-8">
          <Link
            href="/"
            className="text-gray-400 hover:text-white transition-colors inline-flex items-center gap-2 mb-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            戻る
          </Link>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#7c3aed] to-[#a855f7] bg-clip-text text-transparent">
            新しいプロットを作成
          </h1>
          <p className="text-gray-400 mt-2">基本設定、キャラクター、主人公を設定します</p>
        </div>

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* === 基本設定 === */}
          <section className="bg-[#1a1a1a] rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4">基本設定</h2>

            {/* 題名 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                題名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="例: 放課後の教室で"
                className="w-full bg-[#2a2a2a] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed] transition-colors"
              />
            </div>

            {/* 説明 */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                説明・あらすじ <span className="text-red-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                placeholder="例: 幼なじみとの放課後の会話。何かが変わろうとしている。"
                rows={3}
                className="w-full bg-[#2a2a2a] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed] transition-colors resize-none"
              />
            </div>
          </section>

          {/* === キャラクター === */}
          <section className="bg-[#1a1a1a] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">キャラクター</h2>
              <button
                type="button"
                onClick={addCharacter}
                className="text-sm bg-[#2a2a2a] text-gray-300 px-3 py-1 rounded-lg hover:bg-[#333333] transition-colors"
              >
                + キャラクター追加
              </button>
            </div>

            {characters.map((char, index) => (
              <div
                key={char.id}
                className="bg-[#2a2a2a] rounded-lg p-4 mb-4 relative"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-white">キャラクター {index + 1}</h3>
                  {characters.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCharacter(char.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      削除
                    </button>
                  )}
                </div>

                {/* 名前と絵文字 */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      名前 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={char.name}
                      onChange={(e) => updateCharacter(char.id, "name", e.target.value)}
                      required
                      placeholder="例: 朔夜"
                      className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      絵文字 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={char.avatar}
                      onChange={(e) => updateCharacter(char.id, "avatar", e.target.value)}
                      required
                      placeholder="例: 🌙"
                      maxLength={2}
                      className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed] transition-colors text-2xl"
                    />
                  </div>
                </div>

                {/* 性格 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    性格 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={char.personality}
                    onChange={(e) => updateCharacter(char.id, "personality", e.target.value)}
                    required
                    placeholder="例: ヤンデレな幼なじみ男子。主人公に対して独占欲が強く、少し執着している。"
                    rows={2}
                    className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed] transition-colors resize-none"
                  />
                </div>

                {/* 口調・話し方 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    口調・話し方 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={char.speechStyle}
                    onChange={(e) => updateCharacter(char.id, "speechStyle", e.target.value)}
                    required
                    placeholder="例: 一人称は「仆（ぼく）」。主人公のことは「お前」と呼ぶ。"
                    rows={2}
                    className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed] transition-colors resize-none"
                  />
                </div>

                {/* 背景・設定 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    背景・設定 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={char.background}
                    onChange={(e) => updateCharacter(char.id, "background", e.target.value)}
                    required
                    placeholder="例: 主人公とは幼稚園からの幼なじみ。"
                    rows={2}
                    className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed] transition-colors resize-none"
                  />
                </div>

                {/* シナリオ */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    シナリオ <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={char.scenario}
                    onChange={(e) => updateCharacter(char.id, "scenario", e.target.value)}
                    required
                    placeholder="例: 放課後の教室。二人きりで話している。"
                    rows={2}
                    className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed] transition-colors resize-none"
                  />
                </div>

                {/* 最初のセリフ */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    最初のセリフ <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={char.firstMessage}
                    onChange={(e) => updateCharacter(char.id, "firstMessage", e.target.value)}
                    required
                    placeholder="例: お前、遅かったね…待ち合わせの時間、覚えてた？"
                    rows={2}
                    className="w-full bg-[#1a1a1a] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed] transition-colors resize-none"
                  />
                </div>
              </div>
            ))}
          </section>

          {/* === トークプロフィール（主人公設定） === */}
          <section className="bg-[#1a1a1a] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">トークプロフィール（主人公設定）</h2>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useTokenProfile}
                  onChange={(e) => setUseTokenProfile(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-gray-300">設定する</span>
              </label>
            </div>

            {useTokenProfile && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    主人公の名前 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={tokenProfile.name}
                    onChange={(e) => setTokenProfile({ ...tokenProfile, name: e.target.value })}
                    required={useTokenProfile}
                    placeholder="例: 雄二"
                    className="w-full bg-[#2a2a2a] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    性格 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={tokenProfile.personality}
                    onChange={(e) => setTokenProfile({ ...tokenProfile, personality: e.target.value })}
                    required={useTokenProfile}
                    placeholder="例: 普通の高校生。少し鈍感なところがある。"
                    rows={2}
                    className="w-full bg-[#2a2a2a] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed] transition-colors resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    背景・設定 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={tokenProfile.background}
                    onChange={(e) => setTokenProfile({ ...tokenProfile, background: e.target.value })}
                    required={useTokenProfile}
                    placeholder="例: 地元の公立高校に通う2年生。"
                    rows={2}
                    className="w-full bg-[#2a2a2a] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed] transition-colors resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    話し方 <span className="text-gray-500">(任意)</span>
                  </label>
                  <textarea
                    value={tokenProfile.speechStyle}
                    onChange={(e) => setTokenProfile({ ...tokenProfile, speechStyle: e.target.value })}
                    placeholder="例: 一人称は「俺」。フランクに話す。"
                    rows={2}
                    className="w-full bg-[#2a2a2a] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed] transition-colors resize-none"
                  />
                </div>
              </div>
            )}
          </section>

          {/* ボタン */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-[#7c3aed] to-[#a855f7] text-white px-8 py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "作成中..." : "プロットを作成"}
            </button>
            <Link
              href="/"
              className="bg-[#1a1a1a] text-gray-300 px-8 py-3 rounded-lg hover:bg-[#222222] transition-colors"
            >
              キャンセル
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
