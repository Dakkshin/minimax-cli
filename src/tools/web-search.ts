/**
 * Web Search Tool for MiniMax CLI
 * Uses DuckDuckGo HTML search scraping (free, no API keys required)
 */

import * as cheerio from 'cheerio';

export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
}

export interface WebSearchOptions {
  query: string;
  top_k?: number;
  fetch_pages?: boolean; // Fetch top result pages for better quality
}

/**
 * Free web search using DuckDuckGo HTML scraping
 * @param options - Search options
 * @returns Promise<WebSearchResult[]>
 */
export async function web_search({
  query,
  top_k = 5,
  fetch_pages = false
}: WebSearchOptions): Promise<WebSearchResult[]> {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  try {
    // Add safety throttle to prevent IP blocking
    await new Promise(resolve => setTimeout(resolve, 800));

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo search failed: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const results: WebSearchResult[] = [];

    $('.result').each((i, el) => {
      if (i >= top_k) return;

      const title = $(el).find('.result__title a').text().trim();
      const link = $(el).find('.result__url').attr('href') || $(el).find('.result__title a').attr('href');
      const snippet = $(el).find('.result__snippet').text().trim();

      if (title && link && snippet) {
        results.push({
          title,
          link: normalizeUrl(link),
          snippet,
        });
      }
    });

    // Optional: Fetch top result pages for better quality
    if (fetch_pages && results.length > 0) {
      const topResults = results.slice(0, 2); // Fetch top 1-2 results
      for (const result of topResults) {
        try {
          await new Promise(resolve => setTimeout(resolve, 500)); // Additional throttle
          const pageResponse = await fetch(result.link, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
          });

          if (pageResponse.ok) {
            const pageHtml = await pageResponse.text();
            const page$ = cheerio.load(pageHtml);

            // Extract text from <p> tags (simple content extraction)
            const paragraphs = page$('p').map((_, el) => page$(el).text().trim()).get();
            const pageContent = paragraphs.slice(0, 5).join(' ').substring(0, 1000); // ~1k tokens

            if (pageContent) {
              result.snippet = pageContent;
            }
          }
        } catch (error) {
          console.log(`Failed to fetch page content for ${result.link}: ${error}`);
          // Keep original snippet if page fetch fails
        }
      }
    }

    return results;
  } catch (error) {
    console.error(`Web search error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return [];
  }
}

/**
 * Normalize URLs from DuckDuckGo results
 */
function normalizeUrl(url: string): string {
  if (!url) return '';

  // Handle DuckDuckGo redirect URLs
  if (url.startsWith('/l/?uddg=')) {
    try {
      return decodeURIComponent(url.substring(8));
    } catch {
      return url;
    }
  }

  // Handle relative URLs
  if (url.startsWith('//')) {
    return 'https:' + url;
  }

  // Return as-is if it's already a full URL
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  return url;
}

/**
 * Legacy interface for backward compatibility
 */
export interface WebSearchResponse {
  success: boolean;
  query: string;
  results: WebSearchResult[];
  error?: string;
}

/**
 * Convenience function for quick web searches (legacy interface)
 * @param query - Search query
 * @param maxResults - Number of results to return (default: 5)
 */
export async function webSearch(
  query: string,
  maxResults: number = 5
): Promise<WebSearchResponse> {
  const results = await web_search({ query, top_k: maxResults });

  return {
    success: results.length > 0,
    query,
    results,
  };
}

/**
 * Factory function to create a configured search tool
 */
export function createWebSearchTool() {
  return {
    web_search,
    webSearch,
  };
}

export default web_search;
