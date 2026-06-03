"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
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

interface TokenProfile {
  name: string;
  personality: string;
  background: string;
  speechStyle?: string;
}

interface Plot {
  id: string;
  title: string;
  description: string;
  characters: PlotCharacter[];
  tokenProfile?: TokenProfile;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [plot, setPlot] = useState<Plot | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingReasoning, setStreamingReasoning] = useState("");
  const [expandedReasoning, setExpandedReasoning] = useState<Set<number>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // プロット情報を取得
  useEffect(() => {
    async function fetchPlot() {
      try {
        const res = await fetch(`/api/plots?id=${id}`);
        if (res.ok) {
          const data = await res.json();
          setPlot(data);

          // 最初のキャラクターを選択
          if (data.characters && data.characters.length > 0) {
            const firstChar = data.characters[0];
            setSelectedCharacterId(firstChar.id);

            // 最初のメッセージを追加
            setMessages([{ role: "assistant", content: firstChar.firstMessage }]);
          }
        } else {
          alert("プロットが見つかりませんでした");
          router.push("/");
        }
      } catch (error) {
        console.error("Failed to fetch plot:", error);
        router.push("/");
      }
    }

    fetchPlot();
  }, [id, router]);

  // メッセージが更新されたらスクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, streamingReasoning]);

  // キャラクター切り替え時の処理
  const handleCharacterChange = (characterId: string) => {
    if (isStreaming) return;

    const character = plot?.characters.find((c) => c.id === characterId);
    if (character) {
      setSelectedCharacterId(characterId);
      setMessages([{ role: "assistant", content: character.firstMessage }]);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming || !selectedCharacterId) return;

    const userMessage = input.trim();
    setInput("");

    const newMessages = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(newMessages);

    setIsStreaming(true);
    setStreamingText("");
    setStreamingReasoning("");

    // フォーカスを維持
    inputRef.current?.focus();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plotId: id,
          characterId: selectedCharacterId,
          messages: newMessages,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to get response");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      let assistantReasoning = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                assistantText += parsed.text;
                setStreamingText(assistantText);
              }
              if (parsed.reasoning) {
                assistantReasoning += parsed.reasoning;
                setStreamingReasoning(assistantReasoning);
              }
            } catch (e) {
              // JSON parse error - skip
            }
          }
        }
      }

      setMessages([...newMessages, {
        role: "assistant",
        content: assistantText,
        reasoning: assistantReasoning || undefined,
      }]);
      setStreamingText("");
      setStreamingReasoning("");
      setIsStreaming(false);
      inputRef.current?.focus();
    } catch (error) {
      console.error("Chat error:", error);
      setIsStreaming(false);
      alert("エラーが発生しました");
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      handleSend();
    }
  };

  const toggleReasoning = (index: number) => {
    setExpandedReasoning(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (!plot) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0f0f0f]">
        <div className="text-gray-400">読み込み中...</div>
      </div>
    );
  }

  const selectedCharacter = plot.characters.find((c) => c.id === selectedCharacterId);

  return (
    <div className="h-screen flex flex-col bg-[#0f0f0f]">
      {/* ヘッダー */}
      <div className="bg-[#1a1a1a] border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <Link
          href="/"
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>

        {/* プロット情報 */}
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-white">{plot.title}</h1>
          <p className="text-xs text-gray-400 line-clamp-1">{plot.description}</p>
        </div>

        {/* キャラクター選択 */}
        {plot.characters.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">会話相手:</span>
            <select
              value={selectedCharacterId || ""}
              onChange={(e) => handleCharacterChange(e.target.value)}
              disabled={isStreaming}
              className="bg-[#2a2a2a] border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#7c3aed] disabled:opacity-50"
            >
              {plot.characters.map((char) => (
                <option key={char.id} value={char.id}>
                  {char.avatar} {char.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* キャラクター情報バー */}
      {selectedCharacter && (
        <div className="bg-[#1f1f1f] border-b border-gray-800 px-6 py-2 flex items-center gap-3">
          <span className="text-2xl">{selectedCharacter.avatar}</span>
          <div>
            <span className="text-sm font-medium text-white">{selectedCharacter.name}</span>
            <span className="text-xs text-gray-400 ml-2">と会話中</span>
          </div>
        </div>
      )}

      {/* チャットエリア */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl ${
                  message.role === "user"
                    ? "bg-gradient-to-r from-[#7c3aed] to-[#a855f7] text-white"
                    : "bg-[#2a2a2a] text-gray-100"
                }`}
              >
                {/* 思考プロセスがあるアシスタントメッセージ */}
                {message.role === "assistant" && message.reasoning && (
                  <div className="border-b border-gray-700">
                    <button
                      onClick={() => toggleReasoning(index)}
                      className="w-full px-3 py-2 flex items-center gap-2 text-left text-gray-400 hover:text-gray-300 transition-colors"
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${expandedReasoning.has(index) ? "rotate-90" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="text-sm">思考プロセス</span>
                    </button>
                    {expandedReasoning.has(index) && (
                      <div className="px-4 pb-3 text-sm text-gray-400 whitespace-pre-wrap border-t border-gray-700 max-h-48 overflow-y-auto">
                        {message.reasoning}
                      </div>
                    )}
                  </div>
                )}
                {/* メインメッセージ */}
                <div className="px-4 py-3">
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            </div>
          ))}

          {/* ストリーミング中の表示 */}
          {isStreaming && (streamingText || streamingReasoning) && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl bg-[#2a2a2a] text-gray-100">
                {/* 思考プロセス中 */}
                {streamingReasoning && (
                  <div className="border-b border-gray-700 px-4 py-2">
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>思考中...</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-gray-400 max-h-48 overflow-y-auto">
                      {streamingReasoning}
                      <span className="animate-pulse">▍</span>
                    </p>
                  </div>
                )}
                {/* メインメッセージ */}
                {streamingText && (
                  <div className="px-4 py-3">
                    <p className="whitespace-pre-wrap">
                      {streamingText}
                      <span className="animate-pulse">▍</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {isStreaming && !streamingText && !streamingReasoning && (
            <div className="flex justify-start">
              <div className="bg-[#2a2a2a] rounded-2xl px-4 py-3">
                <span className="animate-pulse text-gray-100">▍</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 入力エリア */}
      <div className="bg-[#1a1a1a] border-t border-gray-800 px-4 py-4">
        <div className="max-w-3xl mx-auto flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力..."
            className="flex-1 bg-[#2a2a2a] border border-gray-700 rounded-full px-5 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed] transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="bg-gradient-to-r from-[#7c3aed] to-[#a855f7] text-white px-6 py-3 rounded-full hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}