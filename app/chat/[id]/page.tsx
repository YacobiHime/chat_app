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

interface SearchResultItem {
  url: string;
  title: string;
  snippet: string;
}

interface SearchUrlItem {
  url: string;
  status: "fetching" | "done";
  title?: string;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  searchResults?: SearchResultItem[];
  searchQuery?: string;
  searchTool?: string;
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

  // 検索関連のストリーミング状態
  const [streamingSearchStatus, setStreamingSearchStatus] = useState<{
    stage: string; query?: string; tool?: string;
  } | null>(null);
  const [streamingSearchUrls, setStreamingSearchUrls] = useState<SearchUrlItem[]>([]);
  const [streamingSearchResults, setStreamingSearchResults] = useState<SearchResultItem[]>([]);

  const [expandedReasoning, setExpandedReasoning] = useState<Set<number>>(new Set());
  const [expandedSearch, setExpandedSearch] = useState<Set<number>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamingReasoningRef = useRef<HTMLParagraphElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // 停止時に途中テキストを参照するためのref
  const streamingTextRef = useRef<string>("");
  const streamingReasoningTextRef = useRef<string>("");

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
      } catch (error) {
        console.error("Failed to fetch plot:", error);
        router.push("/");
      }
    }
    fetchPlot();
  }, [id, router]);

  // メッセージが更新されたらスクロール（thinkingの更新ではページをスクロールしない）
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // 思考プロセスが更新されたら、思考エリアの一番下までスクロール
  useEffect(() => {
    if (streamingReasoningRef.current) {
      streamingReasoningRef.current.scrollTop = streamingReasoningRef.current.scrollHeight;
    }
  }, [streamingReasoning]);

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
    setStreamingSearchStatus(null);
    setStreamingSearchUrls([]);
    setStreamingSearchResults([]);
    streamingTextRef.current = "";
    streamingReasoningTextRef.current = "";

    inputRef.current?.focus();

    try {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plotId: id,
          characterId: selectedCharacterId,
          messages: newMessages,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) throw new Error("Failed to get response");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      let assistantReasoning = "";
      let finalSearchResults: SearchResultItem[] = [];
      let finalSearchQuery = "";
      let finalSearchTool = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);

            // テキスト
            if (parsed.text) {
              assistantText += parsed.text;
              streamingTextRef.current = assistantText;
              setStreamingText(assistantText);
            }

            // 思考プロセス
            if (parsed.reasoning) {
              assistantReasoning += parsed.reasoning;
              streamingReasoningTextRef.current = assistantReasoning;
              setStreamingReasoning(assistantReasoning);
            }

            // 検索ステータス
            if (parsed.searchStatus) {
              const s = parsed.searchStatus;
              setStreamingSearchStatus(s);
              if (s.query) finalSearchQuery = s.query;
              if (s.tool) finalSearchTool = s.tool;
            }

            // 個別 URL の取得状況
            if (parsed.search_url) {
              const urlItem: SearchUrlItem = {
                url: parsed.search_url,
                status: parsed.url_status,
                title: parsed.url_title,
              };
              setStreamingSearchUrls(prev => {
                const idx = prev.findIndex(u => u.url === parsed.search_url);
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = urlItem;
                  return next;
                }
                return [...prev, urlItem];
              });
            }

            // 検索結果（確定）
            if (parsed.searchResults) {
              finalSearchResults = parsed.searchResults;
              setStreamingSearchResults(parsed.searchResults);
            }
          } catch {
            // JSON parse error - skip
          }
        }
      }

      setMessages(
        ([...newMessages, {
          role: "assistant" as const,
          content: assistantText,
          ...(assistantReasoning ? { reasoning: assistantReasoning } : {}),
          ...(finalSearchResults.length > 0 ? {
            searchResults: finalSearchResults,
            searchQuery: finalSearchQuery,
            searchTool: finalSearchTool,
          } : {}),
        }] as (Message | undefined)[]).filter((m): m is Message => m != null)
      );

      setStreamingText("");
      setStreamingReasoning("");
      setStreamingSearchStatus(null);
      setStreamingSearchUrls([]);
      setStreamingSearchResults([]);
      setIsStreaming(false);
      abortControllerRef.current = null;
      inputRef.current?.focus();
    } catch (error) {
      // 停止ボタンによる中断 → 途中までのテキストをメッセージとして保存
      if (error instanceof Error && error.name === "AbortError") {
        const partialText = streamingTextRef.current;
        const partialReasoning = streamingReasoningTextRef.current;
        if (partialText) {
          setMessages(prev => [
            ...prev,
            {
              role: "assistant" as const,
              content: partialText,
              ...(partialReasoning ? { reasoning: partialReasoning } : {}),
            },
          ]);
        }
      } else {
        console.error("Chat error:", error);
        alert("エラーが発生しました");
      }
      setStreamingText("");
      setStreamingReasoning("");
      setStreamingSearchStatus(null);
      setStreamingSearchUrls([]);
      setStreamingSearchResults([]);
      setIsStreaming(false);
      abortControllerRef.current = null;
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

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const toggleReasoning = (index: number) => {
    setExpandedReasoning(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  const toggleSearch = (index: number) => {
    setExpandedSearch(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
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
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl overflow-hidden ${
                  message.role === "user"
                    ? "bg-gradient-to-r from-[#7c3aed] to-[#a855f7] text-white"
                    : "bg-[#2a2a2a] text-gray-100"
                }`}
              >
                {/* 思考プロセス */}
                {message.role === "assistant" && message.reasoning && (
                  <div className="border-b border-gray-700">
                    <button
                      onClick={() => toggleReasoning(index)}
                      className="w-full px-3 py-2 flex items-center gap-2 text-left text-[#a855f7] hover:text-[#9333ea] transition-colors"
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${expandedReasoning.has(index) ? "rotate-90" : ""}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
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

                {/* 検索結果（確定済み） */}
                {message.role === "assistant" && message.searchResults && message.searchResults.length > 0 && (
                  <div className="border-b border-gray-700">
                    <button
                      onClick={() => toggleSearch(index)}
                      className="w-full px-3 py-2 flex items-center gap-2 text-left text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${expandedSearch.has(index) ? "rotate-90" : ""}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <span className="text-sm">
                        {message.searchTool ?? "Web検索"} · {message.searchResults.length}件
                        {message.searchQuery && (
                          <span className="text-gray-500 ml-1">「{message.searchQuery}」</span>
                        )}
                      </span>
                    </button>
                    {expandedSearch.has(index) && (
                      <div className="border-t border-gray-700 divide-y divide-gray-700/50">
                        {message.searchResults.map((r, i) => (
                          <div key={i} className="px-4 py-2.5">
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium text-blue-400 hover:text-blue-300 hover:underline block truncate"
                            >
                              {r.title || r.url}
                            </a>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{r.snippet}</p>
                            <p className="text-[10px] text-gray-600 mt-0.5 truncate">{r.url}</p>
                          </div>
                        ))}
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
          {isStreaming && (streamingText || streamingReasoning || streamingSearchStatus || streamingSearchUrls.length > 0) && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl overflow-hidden bg-[#2a2a2a] text-gray-100">

                {/* 思考中 */}
                {streamingReasoning && (
                  <div className="border-b border-gray-700 px-4 py-2">
                    <div className="flex items-center gap-2 text-sm text-[#a855f7] mb-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>思考中...</span>
                    </div>
                    <p ref={streamingReasoningRef} className="whitespace-pre-wrap text-sm text-gray-400 max-h-48 overflow-y-auto">
                      {streamingReasoning}
                      <span className="animate-pulse">▍</span>
                    </p>
                  </div>
                )}

                {/* 検索中ステータス＋URL一覧 */}
                {(streamingSearchStatus || streamingSearchUrls.length > 0) && (
                  <div className="border-b border-gray-700 px-4 py-2.5">
                    {/* ステータスヘッダー */}
                    <div className="flex items-center gap-2 text-sm text-emerald-400 mb-2">
                      {streamingSearchStatus?.stage === "done" ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      )}
                      <span>
                        {streamingSearchStatus?.tool ?? "Web検索"}
                        {streamingSearchStatus?.query && (
                          <span className="text-gray-500 ml-1">「{streamingSearchStatus.query}」</span>
                        )}
                      </span>
                    </div>

                    {/* 訪問した URL 一覧 */}
                    {streamingSearchUrls.length > 0 && (
                      <div className="space-y-1">
                        {streamingSearchUrls.map((u, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            {u.status === "fetching" ? (
                              <span className="w-3 h-3 rounded-full border border-emerald-500 border-t-transparent animate-spin flex-shrink-0" />
                            ) : (
                              <svg className="w-3 h-3 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                            <span className="text-gray-400 truncate">
                              {u.title || u.url}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 本文ストリーミング */}
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

          {/* 待機中（何も表示されていない間） */}
          {isStreaming && !streamingText && !streamingReasoning && !streamingSearchStatus && streamingSearchUrls.length === 0 && (
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
            onClick={isStreaming ? handleStop : handleSend}
            disabled={isStreaming ? false : !input.trim()}
            className={
              isStreaming
                ? "relative bg-[#0f0f0f] border border-[#7c3aed]/60 hover:border-[#a855f7] text-[#a855f7] hover:text-white px-6 py-3 rounded-full transition-all duration-200 shadow-[0_0_12px_rgba(124,58,237,0.25)] hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] group"
                : "bg-gradient-to-r from-[#7c3aed] to-[#a855f7] text-white px-6 py-3 rounded-full hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            }
            title={isStreaming ? "生成を停止" : "送信"}
          >
            {isStreaming ? (
              <>
                {/* パルスリング */}
                <span className="absolute inset-0 rounded-full border border-[#7c3aed]/30 animate-ping opacity-60" />
                <svg className="w-5 h-5 relative" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="7" y="7" width="10" height="10" rx="1.5" />
                </svg>
              </>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}