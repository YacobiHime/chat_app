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

  const requestUrl = `${base}/search?${params.toString()}`;

  console.log(`[SearXNG] 検索開始 query="${query}" url="${requestUrl}"`);

  try {
    const response = await fetch(requestUrl, {
      headers: {
        // SearXNG はブラウザ以外からのリクエストも受け付けるが、
        // User-Agent を付けておくと一部エンジンで安定する
        "User-Agent": "chat_app/1.0 (internal lab use)",
      },
      // サーバーサイドなので適度なタイムアウトを設定
      signal: AbortSignal.timeout(10_000),
    });

    console.log(`[SearXNG] レスポンス status=${response.status} query="${query}"`);

    if (!response.ok) {
      let body = "";
      try { body = await response.text(); } catch { /* ignore */ }
      console.error(
        `[SearXNG] HTTPエラー status=${response.status} query="${query}"\n` +
        `  リクエストURL: ${requestUrl}\n` +
        `  レスポンスボディ(先頭500字): ${body.slice(0, 500)}`
      );
      return [];
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (jsonErr) {
      const rawText = await response.text().catch(() => "(読み取り失敗)");
      console.error(
        `[SearXNG] JSONパース失敗 query="${query}"\n` +
        `  エラー: ${jsonErr}\n` +
        `  ボディ(先頭500字): ${rawText.slice(0, 500)}`
      );
      return [];
    }

    if (typeof data !== "object" || data === null) {
      console.warn(`[SearXNG] 予期しない型のレスポンス query="${query}"`, typeof data);
      return [];
    }

    const dataObj = data as Record<string, unknown>;

    if (!Array.isArray(dataObj.results)) {
      console.warn(
        `[SearXNG] results フィールドが配列ではありません query="${query}"\n` +
        `  受け取ったキー: ${Object.keys(dataObj).join(", ")}\n` +
        `  data.results の型: ${typeof dataObj.results}`
      );
      return [];
    }

    const mapped = (dataObj.results as Array<{ url?: string; title?: string; content?: string }>)
      .slice(0, maxResults)
      .map((r) => ({
        url: r.url ?? "",
        title: r.title ?? r.url ?? "",
        snippet: r.content ?? "",
      }))
      .filter((r): r is SearchResult => r.url !== "");

    console.log(`[SearXNG] 検索完了 query="${query}" 件数=${mapped.length}/${dataObj.results.length}`);

    if (mapped.length === 0 && (dataObj.results as unknown[]).length > 0) {
      console.warn(
        `[SearXNG] results があるのに url 抽出後が 0 件 query="${query}"\n` +
        `  先頭の result: ${JSON.stringify((dataObj.results as unknown[])[0])}`
      );
    }

    return mapped;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "TimeoutError") {
        console.error(`[SearXNG] タイムアウト(10秒) query="${query}" url="${requestUrl}"`);
      } else if (error.message.includes("ECONNREFUSED") || error.message.includes("fetch failed")) {
        console.error(
          `[SearXNG] 接続失敗 — SearXNG が起動していないか URL が間違っている可能性があります\n` +
          `  SEARXNG_URL 環境変数: ${process.env.SEARXNG_URL ?? "(未設定 → デフォルト http://localhost:8080)"}\n` +
          `  リクエスト先: ${requestUrl}\n` +
          `  エラー詳細: ${error.message}`
        );
      } else {
        console.error(`[SearXNG] 予期しないエラー query="${query}": ${error.name}: ${error.message}`, error);
      }
    } else {
      console.error(`[SearXNG] 非Errorオブジェクトがスローされました query="${query}"`, error);
    }
    return [];
  }
}