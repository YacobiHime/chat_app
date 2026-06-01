"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PlotCharacter {
  id: string;
  name: string;
  avatar: string;
  personality: string;
  speechStyle: string;
  background: string;
  scenario: string;
  firstMessage: string;
}

interface Plot {
  id: string;
  title: string;
  description: string;
  characters: PlotCharacter[];
  tokenProfile?: {
    name: string;
    personality: string;
    background: string;
    speechStyle?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export default function Home() {
  const [plots, setPlots] = useState<Plot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPlots() {
      try {
        const res = await fetch("/api/plots");
        if (res.ok) {
          const data = await res.json();
          setPlots(data);
        }
      } catch (error) {
        console.error("Failed to fetch plots:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchPlots();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f0f]">
        <div className="text-gray-400">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] p-8">
      <div className="max-w-6xl mx-auto">
        {/* ヘッダー */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-[#7c3aed] to-[#a855f7] bg-clip-text text-transparent">
            zeta-clone
          </h1>
          <p className="text-gray-400 mt-2">プロットを作成して、AIキャラクターと物語を紡ぐ</p>
        </div>

        {/* 新規作成ボタン */}
        <Link
          href="/create"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-[#7c3aed] to-[#a855f7] text-white px-6 py-3 rounded-lg hover:opacity-90 transition-opacity mb-8"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新しいプロットを作る
        </Link>

        {/* プロットカードグリッド */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plots.map((plot) => {
            // 最初のキャラクターを代表として表示
            const firstChar = plot.characters[0];
            return (
              <Link
                key={plot.id}
                href={`/chat/${plot.id}`}
                className="bg-[#1a1a1a] rounded-xl p-6 hover:bg-[#222222] transition-all hover:transform hover:-translate-y-1 cursor-pointer group"
              >
                {/* タイトルと説明 */}
                <h2 className="text-xl font-semibold text-white group-hover:text-[#a855f7] transition-colors mb-2">
                  {plot.title}
                </h2>
                <p className="text-gray-400 text-sm line-clamp-2 mb-4">
                  {plot.description}
                </p>

                {/* キャラクター一覧 */}
                <div className="flex items-center gap-2 mb-4">
                  {plot.characters.slice(0, 3).map((char) => (
                    <div
                      key={char.id}
                      className="text-2xl"
                      title={char.name}
                    >
                      {char.avatar}
                    </div>
                  ))}
                  {plot.characters.length > 3 && (
                    <span className="text-gray-500 text-sm">+{plot.characters.length - 3}</span>
                  )}
                </div>

                {/* トークプロフィールがある場合 */}
                {plot.tokenProfile && (
                  <div className="text-xs text-gray-500">
                    <span className="bg-[#2a2a2a] px-2 py-1 rounded">
                      主人公: {plot.tokenProfile.name}
                    </span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>

        {/* プロットがいない場合 */}
        {plots.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-500 text-lg">プロットがありません</p>
            <p className="text-gray-600 text-sm mt-2">
              上のボタンから新しいプロットを作成しましょう
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
