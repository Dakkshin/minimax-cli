/**
 * Web Search Tool for MiniMax CLI
 * Uses public SearxNG instances for real-time web search capabilities
 */

import axios, { AxiosInstance } from 'axios';

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  engine?: string;
  category?: string;
}

export interface WebSearchOptions {
  maxResults?: number;
  language?: string;
  timeRange?: 'day' | 'week' | 'month' | 'year';
  safeSearch?: boolean;
}

export interface WebSearchResponse {
  success: boolean;
  query: string;
  results: WebSearchResult[];
  error?: string;
}

// Public SearxNG instances (free, no API key required)
const SEARXNG_INSTANCES = [
  'https://searx.be',
  'https://searx.org',
  'https://searxng.site',
  'https://search.bus.gy',
];

export class WebSearchTool {
  private client: AxiosInstance;
  private instance: string;
  private maxRetries: number = 2;

  constructor(instance?: string) {
    this.instance = instance || SEARXNG_INSTANCES[0];
    this.client = axios.create({
      baseURL: `${this.instance}`,
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MiniMax-CLI/1.0 (Research tool)',
      },
    });
  }

  /**
   * Search the web using SearxNG
   * @param query - Search query string
   * @param options - Optional search parameters
   * @returns Promise<WebSearchResponse>
   */
  async search(query: string, options: WebSearchOptions = {}): Promise<WebSearchResponse> {
    const {
      maxResults = 5,
      language = 'en',
      timeRange,
      safeSearch = true,
    } = options;

    try {
      // Build search parameters for SearxNG
      const params: Record<string, string | number | boolean> = {
        q: query,
        format: 'json',
        language: language,
        safe_search: safeSearch ? 1 : 0,
        categories: 'general',
        pageno: 1,
      };

      if (timeRange) {
        params.time_range = timeRange;
      }

      // Make the request
      const response = await this.client.get('/', { params });
      
      if (response.status !== 200) {
        throw new Error(`Search failed with status: ${response.status}`);
      }

      const data = response.data;
      
      // Parse and format results
      const results = this.parseResults(data, maxResults);
      
      return {
        success: true,
        query,
        results,
      };
    } catch (error) {
      // Try fallback instances if primary fails
      if (this.maxRetries > 0) {
        this.maxRetries--;
        return this.tryFallbackInstance(query, options);
      }

      return {
        success: false,
        query,
        results: [],
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Parse SearxNG JSON response into structured results
   */
  private parseResults(data: any, maxResults: number): WebSearchResult[] {
    const results: WebSearchResult[] = [];
    
    if (!data.results || !Array.isArray(data.results)) {
      return results;
    }

    for (const item of data.results.slice(0, maxResults)) {
      results.push({
        title: item.title || 'No title',
        url: item.url || item.link || '#',
        content: item.content || item.description || '',
        engine: item.engine || 'searxng',
        category: item.category || 'general',
      });
    }

    return results;
  }

  /**
   * Try fallback SearxNG instances
   */
  private async tryFallbackInstance(
    query: string,
    options: WebSearchOptions
  ): Promise<WebSearchResponse> {
    const remainingInstances = SEARXNG_INSTANCES.filter(
      (inst) => inst !== this.instance
    );

    for (const instance of remainingInstances) {
      try {
        const fallbackTool = new WebSearchTool(instance);
        const result = await fallbackTool.search(query, options);
        
        if (result.success) {
          return result;
        }
      } catch {
        // Continue to next fallback
        continue;
      }
    }

    return {
      success: false,
      query,
      results: [],
      error: 'All search instances failed',
    };
  }

  /**
   * Check if search service is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/', { 
        params: { q: 'test', format: 'json' },
        timeout: 5000 
      });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Convenience function for quick web searches
 * @param query - Search query
 * @param maxResults - Number of results to return (default: 5)
 */
export async function webSearch(
  query: string,
  maxResults: number = 5
): Promise<WebSearchResponse> {
  const tool = new WebSearchTool();
  return tool.search(query, { maxResults });
}

/**
 * Factory function to create a configured search tool
 */
export function createWebSearchTool(
  instance?: string,
  defaultOptions?: WebSearchOptions
): WebSearchTool {
  return new WebSearchTool(instance);
}

export default WebSearchTool;
