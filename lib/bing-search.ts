/**
 * Playwright + Bing 検索ユーティリティ
 * 配置場所: lib/bing-search.ts
 *
 * DuckDuckGo Instant Answer API の代替。
 * ヘッドレス Chromium で Bing の検索結果ページを開き、
 * タイトル・URL・スニペットを抽出して返す。
 */

import { chromium } from "playwright";

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

/** Bing 検索を実行し、上位の結果を返す */
export async function bingSearch(
  query: string,
  maxResults = 5
): Promise<SearchResult[]> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", // Docker / Linux 環境向け
    ],
  });

  const context = await browser.newContext({
    // 一般的なブラウザに見せる User-Agent
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    // JavaScript を有効にしたまま余計なリソースをブロックして高速化
    extraHTTPHeaders: { "Accept-Language": "ja,en;q=0.9" },
  });

  const page = await context.newPage();

  // 画像・フォント・メディアのリクエストをブロック（速度向上）
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (["image", "media", "font", "stylesheet"].includes(type)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  const results: SearchResult[] = [];

  try {
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=ja`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });

    // Bing の検索結果ブロック: .b_algo
    const items = await page.$$(".b_algo");

    for (const item of items.slice(0, maxResults)) {
      // タイトルと URL
      const anchor = await item.$("h2 a");
      if (!anchor) continue;

      const title = (await anchor.textContent())?.trim() ?? "";
      const href = (await anchor.getAttribute("href")) ?? "";
      if (!href.startsWith("http")) continue;

      // スニペット（複数セレクターを試みる）
      const snippetEl =
        (await item.$(".b_caption p")) ??
        (await item.$(".b_algoSlug")) ??
        (await item.$("p"));
      const snippet = (await snippetEl?.textContent())?.trim() ?? "";

      results.push({ url: href, title, snippet });
    }
  } finally {
    await browser.close();
  }

  return results;
}