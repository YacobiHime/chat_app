"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { SearchingIndicator, type SearchUrlEntry } from "@/components/SearchingIndicator";

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

// ----------------------------------------------------------------
// ThinkingBlock — 完了済みメッセージの思考プロセス表示
// ----------------------------------------------------------------
function ThinkingBlock({
  reasoning,
  expanded,
  onToggle,
}: {
  reasoning: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mb-1.5 rounded-xl overflow-hidden border border-[#7c3aed]/25 bg-[#18182a]">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-purple-400/80 hover:text-purple-300 transition-colors"
      >
        {/* 脳アイコン */}
        <svg
          className="w-3.5 h-3.5 shrink-0 text-purple-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
        <span>思考が完了しました</span>
        <svg
          className={`w-3 h-3 ml-auto shrink-0 transition-transform duration-200 ${
            expanded ? "rotate-90" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ${
          expanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 pb-3 pt-2 border-t border-[#7c3aed]/15">
          <p className="text-xs text-gray-400/80 whitespace-pre-wrap leading-relaxed font-mono">
            {reasoning}
          </p>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// StreamingThinkingBlock — ストリーミング中の思考プロセス表示
// ----------------------------------------------------------------
function StreamingThinkingBlock({
  reasoning,
  phase,
  expanded,
  onToggle,
}: {
  reasoning: string;
  phase: "thinking" | "responding";
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mb-1.5 rounded-xl overflow-hidden border border-[#7c3aed]/35 bg-[#18182a]">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors text-purple-400 hover:text-purple-300"
      >
        {phase === "thinking" ? (
          /* 思考中スピナー */
          <svg
            className="w-3.5 h-3.5 shrink-0 animate-spin text-purple-400"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <svg
            className="w-3.5 h-3.5 shrink-0 text-purple-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        )}

        <span>
          {phase === "thinking" ? "思考中..." : "思考が完了しました"}
        </span>

        <svg
          className={`w-3 h-3 ml-auto shrink-0 transition-transform duration-200 ${
            expanded ? "rotate-90" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ${
          expanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 pb-3 pt-2 border-t border-[#7c3aed]/15">
          <p className="text-xs text-gray-400/80 whitespace-pre-wrap leading-relaxed font-mono">
            {reasoning}
            {phase === "thinking" && (
              <span className="animate-pulse text-purple-400">▍</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// Main ChatPage
// ================================================================
export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [plot, setPlot] = useState<Plot | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // Web検索中のURLエントリ
  const [searchEntries, setSearchEntries] = useState<SearchUrlEntry[]>([]);
  const [isWebSearching, setIsWebSearching] = useState(false);

  // ストリーミング中のテキスト / 思考
  const [streamingText, setStreamingText] = useState("");
  const [streamingReasoning, setStreamingReasoning] = useState("");

  // "thinking" → 思考中, "responding" → 返答テキスト出力中
  const [streamingPhase, setStreamingPhase] = useState<"thinking" | "responding">("thinking");

  // ストリーミング中の思考ブロックの開閉
  const [streamThinkExpanded, setStreamThinkExpanded] = useState(true);

  // 完了済みメッセージの思考ブロック開閉状態 (index → expanded)
  const [expandedReasoning, setExpandedReasoning] = useState<Set<number>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // プロット情報取得
  useEffect(() => {
    async function fetchPlot() {
      try {
        const res = await fetch(`/api/plots?id=${id}`);
        if (res.ok) {
          const data = await res.json();
          setPlot(data);
          if (data.characters && data.characters.length > 0) {
            const firstChar = data.characters[0];
            setSelectedCharacterId(firstChar.id);
            setMessages([{ role: "assistant", content: firstChar.firstMessage }]);
          }
        } else {
          alert("プロットが見つかりませんでした");
          router.push("/");
        }
      } catch {
        router.push("/");
      }
    }
    fetchPlot();
  }, [id, router]);

  // スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, streamingReasoning]);

  const handleCharacterChange = (characterId: string) => {
    if (isStreaming) return;
    const character = plot?.characters.find((c) => c.id === characterId);
    if (character) {
      setSelectedCharacterId(characterId);
      setMessages([{ role: "assistant", content: character.firstMessage }]);
    }
  };

  const toggleReasoning = useCallback((index: number) => {
    setExpandedReasoning((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isStreaming || !selectedCharacterId) return;

    const userMessage = input.trim();
    setInput("");

    const newMessages = [...messages, { role: "user" as const, content: userMessage }];
    setMessages(newMessages);

    setIsStreaming(true);
    setSearchEntries([]);
    setIsWebSearching(false);
    setStreamingText("");
    setStreamingReasoning("");
    setStreamingPhase("thinking");
    setStreamThinkExpanded(true); // 思考開始時は開く

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

      if (!res.ok) throw new Error("Failed to get response");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      let assistantReasoning = "";
      let hasSeenText = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);

            // search_urlイベントの処理
            if (parsed.search_url) {
              const url: string = parsed.search_url;
              const status: "fetching" | "done" = parsed.url_status ?? "fetching";
              const title: string | undefined = parsed.url_title;

              if (status === "fetching") {
                setIsWebSearching(true);
                setSearchEntries((prev) => [
                  ...prev.filter((e) => e.url !== url), // 重複除去
                  { url, status: "fetching", title, fetchedAt: Date.now() },
                ]);
              } else {
                setIsWebSearching(false);
                setSearchEntries((prev) =>
                  prev.map((e) =>
                    e.url === url ? { ...e, status: "done", title: title ?? e.title } : e
                  )
                );
              }
            }

            if (parsed.text) {
              if (!hasSeenText) {
                // テキスト受信開始 → 思考フェーズ終了、折りたたむ
                hasSeenText = true;
                setStreamingPhase("responding");
                setStreamThinkExpanded(false);
              }
              assistantText += parsed.text;
              setStreamingText(assistantText);
            }

            if (parsed.reasoning) {
              assistantReasoning += parsed.reasoning;
              setStreamingReasoning(assistantReasoning);
            }
          } catch {
            // JSON parse error - skip
          }
        }
      }

      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: assistantText,
          reasoning: assistantReasoning || undefined,
        },
      ]);
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
        <Link href="/" className="text-gray-400 hover:text-white transition-colors">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>

        <div className="flex-1">
          <h1 className="text-lg font-semibold text-white">{plot.title}</h1>
          <p className="text-xs text-gray-400 line-clamp-1">{plot.description}</p>
        </div>

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

          {/* 完了済みメッセージ */}
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.role === "assistant" ? (
                /* アシスタントメッセージ（思考ブロック付き） */
                <div className="max-w-[80%] flex flex-col">
                  {message.reasoning && (
                    <ThinkingBlock
                      reasoning={message.reasoning}
                      expanded={expandedReasoning.has(index)}
                      onToggle={() => toggleReasoning(index)}
                    />
                  )}
                  <div className="bg-[#2a2a2a] text-gray-100 rounded-2xl px-4 py-3">
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ) : (
                /* ユーザーメッセージ */
                <div className="max-w-[80%] rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#a855f7] text-white px-4 py-3">
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              )}
            </div>
          ))}

          {/* ストリーミング中のメッセージ */}
          {isStreaming && (
            <>
              {/* Web検索インジケーター */}
              {(searchEntries.length > 0 || isWebSearching) && (
                <div className="flex justify-start px-1">
                  <div className="max-w-[80%]">
                    <SearchingIndicator
                      entries={searchEntries}
                      isSearching={isWebSearching}
                    />
                  </div>
                </div>
              )}

              {/* メッセージ本体 */}
              <div className="flex justify-start">
                <div className="max-w-[80%] flex flex-col">

                  {/* 思考ブロック（reasoning がある場合） */}
                  {streamingReasoning && (
                    <StreamingThinkingBlock
                      reasoning={streamingReasoning}
                      phase={streamingPhase}
                      expanded={streamThinkExpanded}
                      onToggle={() => setStreamThinkExpanded((v) => !v)}
                    />
                  )}

                {/* 返答テキスト */}
                {streamingText ? (
                  <div className="bg-[#2a2a2a] text-gray-100 rounded-2xl px-4 py-3">
                    <p className="whitespace-pre-wrap">
                      {streamingText}
                      <span className="animate-pulse">▍</span>
                    </p>
                  </div>
                ) : !streamingReasoning ? (
                  /* 何もまだ届いていない場合のプレースホルダー */
                  <div className="bg-[#2a2a2a] rounded-2xl px-4 py-3">
                    <span className="animate-pulse text-gray-100">▍</span>
                  </div>
                ) : null}

                </div>
              </div>
            </>
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