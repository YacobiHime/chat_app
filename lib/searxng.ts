/**
 * SearXNG 検索ユーティリティ
 * lib/bing-search.ts と lib/web-search.ts の両方を置き換える。
 *
 * Playwright（ブラウザ起動）が不要になり、
 * シンプルな fetch 一発で検索結果を取得できる。
 */

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

/** 環境変数から SearXNG の URL を取得（未設定時はデフォルト） */
function getSearxngUrl(): string {
  return process.env.SEARXNG_URL ?? "http://localhost:8080";
}

/**
 * SearXNG で Web 検索を実行する。
 *
 * @param query   - 検索クエリ
 * @param maxResults - 最大件数（デフォルト 5）
 * @returns SearchResult の配列（失敗時は空配列）
 */
export async function searxngSearch(
  query: string,
  maxResults = 5
): Promise<SearchResult[]> {
  const base = getSearxngUrl();
  const params = new URLSearchParams({
    q: query,
    format: "json",
    language: "ja-JP",
    safesearch: "0",
  });

  const url = `${base}/search?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        // SearXNG はブラウザ以外からのリクエストも受け付けるが、
        // User-Agent を付けておくと一部エンジンで安定する
        "User-Agent": "chat_app/1.0 (internal lab use)",
      },
      // サーバーサイドなので適度なタイムアウトを設定
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(`SearXNG returned ${response.status} for query: "${query}"`);
      return [];
    }

    const data = await response.json();

    if (!Array.isArray(data.results)) {
      console.warn("SearXNG: unexpected response shape", data);
      return [];
    }

    return data.results
      .slice(0, maxResults)
      .map((r: { url?: string; title?: string; content?: string }) => ({
        url: r.url ?? "",
        title: r.title ?? r.url ?? "",
        snippet: r.content ?? "",
      }))
      .filter((r: SearchResult) => r.url !== "");
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      console.error(`SearXNG timed out for query: "${query}"`);
    } else {
      console.error("SearXNG search error:", error);
    }
    return [];
  }
}