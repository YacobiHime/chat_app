/**
 * DuckDuckGo Web Search Utility
 * Uses DuckDuckGo Instant Answer API (free, no API key required)
 */

export interface SearchResult {
  title: string;
  url: string;
  displayUrl: string; // 短縮表示用URL
  description: string;
  faviconUrl: string; // サイトのファビコン
  siteName: string; // サイト名
}

/**
 * URLからドメインを抽出
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return "";
  }
}

/**
 * ファビコンURLを生成（Googleのファビコンサービスを使用）
 */
function getFaviconUrl(url: string): string {
  const domain = extractDomain(url);
  if (!domain) return "";
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

/**
 * 表示用URLを生成（長すぎる場合は短縮）
 */
function getDisplayUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const domain = urlObj.hostname;

    if (path.length > 30) {
      return `${domain}${path.substring(0, 30)}...`;
    }
    return `${domain}${path}`;
  } catch {
    return url.length > 50 ? url.substring(0, 50) + "..." : url;
  }
}

/**
 * サイト名を取得（ドメインから簡易生成）
 */
function getSiteName(url: string): string {
  const domain = extractDomain(url);
  if (!domain) return "Web";

  // www.を除去
  const cleanDomain = domain.replace(/^www\./, "");

  // TLDを除去してメインドメインを取得
  const parts = cleanDomain.split(".");
  if (parts.length >= 2) {
    return parts[parts.length - 2]; // 例: google.com -> google
  }
  return cleanDomain;
}

/**
 * Search using DuckDuckGo
 */
export async function webSearch(query: string): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Search API failed: ${response.status}`);
    }

    const data = await response.json();

    // DuckDuckGo Instant Answer API returns related topics in RelatedTopics
    const results: SearchResult[] = [];

    // Add main abstract if available
    if (data.Abstract) {
      const url = data.AbstractURL || data.AbstractSource || "";
      results.push({
        title: data.Heading || "Result",
        url,
        displayUrl: getDisplayUrl(url),
        description: data.Abstract,
        faviconUrl: getFaviconUrl(url),
        siteName: getSiteName(url),
      });
    }

    // Add related topics
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.substring(0, 100),
            url: topic.FirstURL,
            displayUrl: getDisplayUrl(topic.FirstURL),
            description: topic.Text,
            faviconUrl: getFaviconUrl(topic.FirstURL),
            siteName: getSiteName(topic.FirstURL),
          });
        }
        // Handle nested topics
        if (topic.Topics && Array.isArray(topic.Topics)) {
          for (const subTopic of topic.Topics) {
            if (subTopic.Text && subTopic.FirstURL) {
              results.push({
                title: subTopic.Text.substring(0, 100),
                url: subTopic.FirstURL,
                displayUrl: getDisplayUrl(subTopic.FirstURL),
                description: subTopic.Text,
                faviconUrl: getFaviconUrl(subTopic.FirstURL),
                siteName: getSiteName(subTopic.FirstURL),
              });
            }
          }
        }
      }
    }

    // Limit results and return
    return results.slice(0, 5);
  } catch (error) {
    console.error("Web search error:", error);
    return [];
  }
}
