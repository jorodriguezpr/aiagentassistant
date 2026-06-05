/**
 * AI Agent Assistant (AiAgentAssistant)
 * Web Search Skills - Search and extract web content
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import axios from 'axios';
import logger from '../utils/logger';
import { getCredentialManager } from '../utils/CredentialManager';

/**
 * Web Search Result Interface
 */
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}

/**
 * Web Content Interface
 */
export interface WebContent {
  url: string;
  title: string;
  content: string;
  textLength: number;
  success: boolean;
  error?: string;
}

/**
 * Search Bing using Bing Search API v7
 * Requires BING_SEARCH_API_KEY in credentials
 */
async function searchBing(query: string, count: number = 10): Promise<WebSearchResult[]> {
  logger.info({ query, count }, 'Searching Bing');

  try {
    const credManager = await getCredentialManager();
    const apiKey = await credManager.getCredential('BING_SEARCH_API_KEY');

    if (!apiKey) {
      throw new Error('Bing Search API key not found. Use set_credential tool to store BING_SEARCH_API_KEY');
    }

    const response = await axios.get('https://api.bing.microsoft.com/v7.0/search', {
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
      },
      params: {
        q: query,
        count: count,
        mkt: 'en-US',
        safesearch: 'Moderate',
        textFormat: 'HTML',
      },
      timeout: 10000,
    });

    const results: WebSearchResult[] = [];

    if (response.data.webPages?.value) {
      for (const page of response.data.webPages.value) {
        results.push({
          title: page.name,
          url: page.url,
          snippet: stripHtml(page.snippet || ''),
          source: 'bing',
        });
      }
    }

    logger.info({ resultsCount: results.length }, 'Bing search completed');
    return results;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Bing search failed');
    throw error;
  }
}

/**
 * Search DuckDuckGo (no API key required, but limited functionality)
 * Uses DuckDuckGo Instant Answer API
 */
async function searchDuckDuckGo(query: string, count: number = 10): Promise<WebSearchResult[]> {
  logger.info({ query, count }, 'Searching DuckDuckGo');

  try {
    // DuckDuckGo Instant Answer API
    const response = await axios.get('https://api.duckduckgo.com/', {
      params: {
        q: query,
        format: 'json',
        no_html: 1,
        skip_disambig: 1,
      },
      timeout: 10000,
    });

    const results: WebSearchResult[] = [];

    // Add abstract if available
    if (response.data.Abstract) {
      results.push({
        title: response.data.Heading || query,
        url: response.data.AbstractURL || 'https://duckduckgo.com',
        snippet: response.data.Abstract,
        source: 'duckduckgo',
      });
    }

    // Add related topics
    if (response.data.RelatedTopics) {
      for (const topic of response.data.RelatedTopics.slice(0, count - 1)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text,
            url: topic.FirstURL,
            snippet: topic.Text,
            source: 'duckduckgo',
          });
        }
      }
    }

    // If no results, provide search URL
    if (results.length === 0) {
      results.push({
        title: `Search results for: ${query}`,
        url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        snippet: 'No instant answers available. Click to view full search results.',
        source: 'duckduckgo',
      });
    }

    logger.info({ resultsCount: results.length }, 'DuckDuckGo search completed');
    return results;
  } catch (error: any) {
    logger.error({ error: error.message }, 'DuckDuckGo search failed');
    throw error;
  }
}

/**
 * Search Google using Custom Search JSON API
 * Requires GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID in credentials
 */
async function searchGoogle(query: string, count: number = 10): Promise<WebSearchResult[]> {
  logger.info({ query, count }, 'Searching Google');

  try {
    const credManager = await getCredentialManager();
    const apiKey = await credManager.getCredential('GOOGLE_SEARCH_API_KEY');
    const engineId = await credManager.getCredential('GOOGLE_SEARCH_ENGINE_ID');

    if (!apiKey || !engineId) {
      throw new Error('Google Search API key or Engine ID not found. Use set_credential tool to store GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID');
    }

    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: apiKey,
        cx: engineId,
        q: query,
        num: Math.min(count, 10), // Google API max is 10 per request
      },
      timeout: 10000,
    });

    const results: WebSearchResult[] = [];

    if (response.data.items) {
      for (const item of response.data.items) {
        results.push({
          title: item.title,
          url: item.link,
          snippet: item.snippet || '',
          source: 'google',
        });
      }
    }

    logger.info({ resultsCount: results.length }, 'Google search completed');
    return results;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Google search failed');
    throw error;
  }
}

/**
 * Generic web search that tries multiple sources
 * Priority: Bing -> Google -> DuckDuckGo (fallback)
 */
export async function webSearchSkill(query: string, count: number = 10): Promise<WebSearchResult[]> {
  logger.info({ query, count }, 'Starting web search');

  // Try Bing first
  try {
    const results = await searchBing(query, count);
    if (results.length > 0) {
      return results;
    }
  } catch (error: any) {
    logger.debug({ error: error.message }, 'Bing search not available, trying next option');
  }

  // Try Google
  try {
    const results = await searchGoogle(query, count);
    if (results.length > 0) {
      return results;
    }
  } catch (error: any) {
    logger.debug({ error: error.message }, 'Google search not available, trying next option');
  }

  // Fallback to DuckDuckGo (no API key required)
  try {
    const results = await searchDuckDuckGo(query, count);
    return results;
  } catch (error: any) {
    logger.error({ error: error.message }, 'All search providers failed');
    throw new Error(`Web search failed: ${error.message}`);
  }
}

/**
 * User-Agent rotation for better compatibility
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

/**
 * Get random User-Agent for request
 */
function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Fetch and extract text content from a web page with retry logic
 */
export async function fetchWebContentSkill(url: string, retryCount: number = 0): Promise<WebContent> {
  logger.info({ url, attempt: retryCount + 1 }, 'Fetching web content');

  try {
    // Validate URL
    try {
      new URL(url);
    } catch {
      return {
        url,
        title: 'Error',
        content: '',
        textLength: 0,
        success: false,
        error: 'Invalid URL format',
      };
    }

    const response = await axios.get(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
      },
      timeout: 15000,
      maxContentLength: 5 * 1024 * 1024, // 5MB max
      maxBodyLength: 5 * 1024 * 1024,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 400;
      },
    });

    const html = response.data;
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

    // Extract text content (remove scripts, styles, and HTML tags)
    let content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();

    // Handle empty content
    if (!content || content.length < 50) {
      logger.warn({ url, contentLength: content.length }, 'Content extraction resulted in very small text');
      
      // If we get minimal content, it might be JavaScript-rendered - provide helpful message
      if (content.length === 0 || /^\s*$/.test(content)) {
        return {
          url,
          title,
          content: `Note: This webpage appears to use JavaScript rendering which cannot be fetched directly. The page title is: "${title}". For real-time data, please visit the website directly.`,
          textLength: title.length,
          success: true,
          error: 'JavaScript-rendered content',
        };
      }
    }

    // Limit content to reasonable size (first 50,000 characters)
    if (content.length > 50000) {
      content = content.substring(0, 50000) + '\n\n... [content truncated for length]';
    }

    logger.info({ url, textLength: content.length }, 'Web content fetched successfully');

    return {
      url,
      title,
      content,
      textLength: content.length,
      success: true,
    };
  } catch (error: any) {
    logger.error({ url, error: error.message, attempt: retryCount + 1 }, 'Failed to fetch web content');
    
    // Determine if we should retry
    const shouldRetry = retryCount < 2 && (
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      error.message.includes('Parse Error') ||
      error.message.includes('Header overflow')
    );

    if (shouldRetry) {
      logger.info({ url, retryCount: retryCount + 1 }, 'Retrying fetch with different User-Agent');
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
      return fetchWebContentSkill(url, retryCount + 1);
    }

    // Provide helpful error messages for common issues
    let userFriendlyError = error.message;
    if (error.message.includes('ENOTFOUND')) {
      userFriendlyError = 'Domain not found - check the URL is correct';
    } else if (error.message.includes('ETIMEDOUT')) {
      userFriendlyError = 'Website took too long to respond - may be down';
    } else if (error.message.includes('Parse Error') || error.message.includes('Header overflow')) {
      userFriendlyError = 'Website blocked the request or returned invalid response - may be protected';
    } else if (error.response?.status === 403) {
      userFriendlyError = 'Access denied - website is blocking automated access';
    } else if (error.response?.status === 404) {
      userFriendlyError = 'Page not found (404 error)';
    }
    
    return {
      url,
      title: 'Error',
      content: '',
      textLength: 0,
      success: false,
      error: userFriendlyError,
    };
  }
}

/**
 * Search for specific information and fetch content from top results
 * This is a high-level skill that combines search + content extraction
 */
export async function searchAndExtractSkill(
  query: string,
  maxResults: number = 3,
  maxPages: number = 2
): Promise<{
  query: string;
  searchResults: WebSearchResult[];
  extractedContent: WebContent[];
  summary: string;
}> {
  logger.info({ query, maxResults, maxPages }, 'Starting search and extract operation');

  // First, search for the query
  const searchResults = await webSearchSkill(query, maxResults);

  // Extract content from top results
  const extractedContent: WebContent[] = [];
  const pagesToFetch = searchResults.slice(0, maxPages);

  for (const result of pagesToFetch) {
    try {
      const content = await fetchWebContentSkill(result.url);
      extractedContent.push(content);
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error: any) {
      logger.warn({ url: result.url, error: error.message }, 'Failed to extract content from URL');
    }
  }

  // Create summary
  const summary = `Found ${searchResults.length} results for "${query}". Successfully extracted content from ${extractedContent.filter(c => c.success).length} pages.`;

  logger.info({ 
    searchResultsCount: searchResults.length, 
    extractedContentCount: extractedContent.length 
  }, 'Search and extract completed');

  return {
    query,
    searchResults,
    extractedContent,
    summary,
  };
}

/**
 * Find reliable sources for financial/stock information
 */
export async function findFinancialSourcesSkill(topic: string): Promise<WebSearchResult[]> {
  logger.info({ topic }, 'Finding financial sources');

  // Add financial keywords to improve search quality
  const financialQuery = `${topic} site:bloomberg.com OR site:reuters.com OR site:cnbc.com OR site:marketwatch.com OR site:investing.com OR site:finance.yahoo.com`;

  try {
    const results = await webSearchSkill(financialQuery, 10);
    
    // Filter to only include trusted financial domains
    const trustedDomains = [
      'bloomberg.com',
      'reuters.com',
      'cnbc.com',
      'marketwatch.com',
      'investing.com',
      'finance.yahoo.com',
      'wsj.com',
      'ft.com',
      'nasdaq.com',
    ];

    const filteredResults = results.filter(result => 
      trustedDomains.some(domain => result.url.includes(domain))
    );

    logger.info({ resultsCount: filteredResults.length }, 'Financial sources found');
    return filteredResults.length > 0 ? filteredResults : results;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to find financial sources');
    throw error;
  }
}

/**
 * Helper function to strip HTML tags from text
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Skill exports for agent registration
 */
export const webSearchSkillExport = {
  name: 'web_search',
  description: 'Search the web for information using Bing, Google, or DuckDuckGo',
  execute: async (params: { query: string; count?: number }) => {
    return await webSearchSkill(params.query, params.count);
  },
};

export const fetchWebContentSkillExport = {
  name: 'fetch_web_content',
  description: 'Fetch and extract text content from a web page',
  execute: async (params: { url: string }) => {
    return await fetchWebContentSkill(params.url);
  },
};

export const searchAndExtractSkillExport = {
  name: 'search_and_extract',
  description: 'Search for information and automatically extract content from top results',
  execute: async (params: { query: string; maxResults?: number; maxPages?: number }) => {
    return await searchAndExtractSkill(params.query, params.maxResults, params.maxPages);
  },
};

export const findFinancialSourcesSkillExport = {
  name: 'find_financial_sources',
  description: 'Find reliable financial information sources for stocks, markets, and economic data',
  execute: async (params: { topic: string }) => {
    return await findFinancialSourcesSkill(params.topic);
  },
};
