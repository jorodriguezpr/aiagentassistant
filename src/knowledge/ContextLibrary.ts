import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';

/**
 * Context entry types
 */
export enum ContextType {
  CONVERSATION = 'conversation',
  DECISION = 'decision',
  OUTCOME = 'outcome',
  ERROR = 'error',
  SUCCESS = 'success',
  PATTERN = 'pattern',
  SOLUTION = 'solution',
}

/**
 * Stored context entry
 */
export interface ContextEntry {
  id: string;
  type: ContextType;
  timestamp: string;
  userId?: string;
  chatId?: number;
  summary: string; // Brief description for quick reference
  content: string; // Full context details
  tags: string[]; // Keywords for search
  metadata?: {
    toolsUsed?: string[];
    errorType?: string;
    resolution?: string;
    confidence?: number;
    relatedContextIds?: string[];
    [key: string]: any;
  };
}

/**
 * Search result with relevance score
 */
export interface SearchResult {
  entry: ContextEntry;
  relevanceScore: number; // 0-1, higher is more relevant
  matchedTags: string[];
}

/**
 * Context Knowledge Library
 * 
 * Stores conversation contexts, decisions, and outcomes for AI to query and learn from.
 * 
 * Features:
 * - Persistent storage of conversation contexts
 * - Tag-based and keyword search
 * - Similar context retrieval
 * - Pattern recognition from past interactions
 * - Success/failure tracking for improvement
 */
export class ContextLibrary {
  private libraryPath: string;
  private contexts: Map<string, ContextEntry>;
  private tagIndex: Map<string, Set<string>>; // tag -> Set of context IDs

  constructor(libraryPath?: string) {
    this.libraryPath = libraryPath || path.join(
      process.env.HOME || process.env.USERPROFILE || '/root',
      '.aiagent',
      'context-library.json'
    );

    this.contexts = new Map();
    this.tagIndex = new Map();
    
    this.loadLibrary();

    logger.info({ 
      libraryPath: this.libraryPath, 
      contextCount: this.contexts.size 
    }, '📚 Context library initialized');
  }

  /**
   * Store a new context entry
   */
  async storeContext(
    type: ContextType,
    summary: string,
    content: string,
    tags: string[],
    metadata?: ContextEntry['metadata'],
    userId?: string,
    chatId?: number
  ): Promise<string> {
    const id = `ctx_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const entry: ContextEntry = {
      id,
      type,
      timestamp: new Date().toISOString(),
      userId,
      chatId,
      summary,
      content,
      tags: tags.map(t => t.toLowerCase()),
      metadata,
    };

    this.contexts.set(id, entry);

    // Update tag index
    for (const tag of entry.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(id);
    }

    await this.saveLibrary();

    logger.info({ 
      id, 
      type, 
      tags: entry.tags.length,
      summary: summary.substring(0, 50) 
    }, '✅ Context stored in library');

    return id;
  }

  /**
   * Query contexts by keywords or tags
   */
  query(keywords: string[], options?: {
    type?: ContextType;
    userId?: string;
    chatId?: number;
    limit?: number;
    minRelevance?: number;
  }): SearchResult[] {
    const results: SearchResult[] = [];
    const normalizedKeywords = keywords.map(k => k.toLowerCase());

    for (const entry of this.contexts.values()) {
      // Filter by type if specified
      if (options?.type && entry.type !== options.type) {
        continue;
      }

      // Filter by userId if specified
      if (options?.userId && entry.userId !== options.userId) {
        continue;
      }

      // Filter by chatId if specified
      if (options?.chatId && entry.chatId !== options.chatId) {
        continue;
      }

      // Calculate relevance score
      let score = 0;
      const matchedTags: string[] = [];

      // Check tags
      for (const tag of entry.tags) {
        for (const keyword of normalizedKeywords) {
          if (tag.includes(keyword) || keyword.includes(tag)) {
            score += 1.0;
            matchedTags.push(tag);
          }
        }
      }

      // Check summary
      const lowerSummary = entry.summary.toLowerCase();
      for (const keyword of normalizedKeywords) {
        if (lowerSummary.includes(keyword)) {
          score += 0.5;
        }
      }

      // Check content
      const lowerContent = entry.content.toLowerCase();
      for (const keyword of normalizedKeywords) {
        if (lowerContent.includes(keyword)) {
          score += 0.3;
        }
      }

      // Normalize score (max possible: keywords.length * 1.8)
      const maxScore = normalizedKeywords.length * 1.8;
      const normalizedScore = Math.min(score / maxScore, 1.0);

      // Add to results if meets minimum relevance
      if (normalizedScore >= (options?.minRelevance || 0.1)) {
        results.push({
          entry,
          relevanceScore: normalizedScore,
          matchedTags,
        });
      }
    }

    // Sort by relevance (highest first)
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Limit results if specified
    if (options?.limit) {
      return results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Find similar contexts to a given context ID
   */
  findSimilar(contextId: string, limit: number = 5): SearchResult[] {
    const context = this.contexts.get(contextId);
    if (!context) {
      logger.warn({ contextId }, '❌ Context not found for similarity search');
      return [];
    }

    // Use the context's tags as keywords for search
    return this.query(context.tags, {
      type: context.type,
      limit: limit + 1, // +1 because we'll exclude the original
    }).filter(result => result.entry.id !== contextId);
  }

  /**
   * Get contexts by type
   */
  getByType(type: ContextType, limit?: number): ContextEntry[] {
    const entries: ContextEntry[] = [];

    for (const entry of this.contexts.values()) {
      if (entry.type === type) {
        entries.push(entry);
      }

      if (limit && entries.length >= limit) {
        break;
      }
    }

    // Sort by timestamp (newest first)
    entries.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return entries;
  }

  /**
   * Get recent contexts
   */
  getRecent(limit: number = 10, type?: ContextType): ContextEntry[] {
    let entries: ContextEntry[] = Array.from(this.contexts.values());

    // Filter by type if specified
    if (type) {
      entries = entries.filter(e => e.type === type);
    }

    // Sort by timestamp (newest first)
    entries.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return entries.slice(0, limit);
  }

  /**
   * Get context by ID
   */
  getContext(contextId: string): ContextEntry | null {
    return this.contexts.get(contextId) || null;
  }

  /**
   * Update context metadata
   */
  async updateContext(
    contextId: string,
    updates: {
      tags?: string[];
      metadata?: Partial<ContextEntry['metadata']>;
    }
  ): Promise<boolean> {
    const context = this.contexts.get(contextId);
    if (!context) {
      logger.warn({ contextId }, '❌ Context not found for update');
      return false;
    }

    // Update tags if provided
    if (updates.tags) {
      // Remove old tags from index
      for (const tag of context.tags) {
        this.tagIndex.get(tag)?.delete(contextId);
      }

      // Update tags
      context.tags = updates.tags.map(t => t.toLowerCase());

      // Add new tags to index
      for (const tag of context.tags) {
        if (!this.tagIndex.has(tag)) {
          this.tagIndex.set(tag, new Set());
        }
        this.tagIndex.get(tag)!.add(contextId);
      }
    }

    // Update metadata if provided
    if (updates.metadata) {
      context.metadata = {
        ...context.metadata,
        ...updates.metadata,
      };
    }

    await this.saveLibrary();

    logger.debug({ contextId }, '✅ Context updated');
    return true;
  }

  /**
   * Delete a context
   */
  async deleteContext(contextId: string): Promise<boolean> {
    const context = this.contexts.get(contextId);
    if (!context) {
      return false;
    }

    // Remove from tag index
    for (const tag of context.tags) {
      this.tagIndex.get(tag)?.delete(contextId);
    }

    this.contexts.delete(contextId);
    await this.saveLibrary();

    logger.info({ contextId }, '🗑️ Context deleted');
    return true;
  }

  /**
   * Get statistics about the library
   */
  getStats(): {
    totalContexts: number;
    byType: Record<string, number>;
    totalTags: number;
    mostCommonTags: Array<{ tag: string; count: number }>;
  } {
    const byType: Record<string, number> = {};

    for (const entry of this.contexts.values()) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
    }

    // Count tag usage
    const tagCounts: Map<string, number> = new Map();
    for (const [tag, contextIds] of this.tagIndex.entries()) {
      tagCounts.set(tag, contextIds.size);
    }

    // Get most common tags
    const mostCommonTags = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalContexts: this.contexts.size,
      byType,
      totalTags: this.tagIndex.size,
      mostCommonTags,
    };
  }

  /**
   * Load library from disk
   */
  private loadLibrary(): void {
    try {
      // Ensure library directory exists
      const libraryDir = path.dirname(this.libraryPath);
      if (!fs.existsSync(libraryDir)) {
        fs.mkdirSync(libraryDir, { recursive: true });
      }

      // Load library file if it exists
      if (fs.existsSync(this.libraryPath)) {
        const libraryData = fs.readFileSync(this.libraryPath, 'utf8');
        const parsed = JSON.parse(libraryData);

        for (const entry of parsed.contexts || []) {
          this.contexts.set(entry.id, entry);

          // Rebuild tag index
          for (const tag of entry.tags) {
            if (!this.tagIndex.has(tag)) {
              this.tagIndex.set(tag, new Set());
            }
            this.tagIndex.get(tag)!.add(entry.id);
          }
        }

        logger.info({ 
          contexts: this.contexts.size,
          tags: this.tagIndex.size 
        }, '📂 Loaded context library');
      } else {
        logger.info('📂 No existing library found, creating new library');
      }
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Failed to load context library');
    }
  }

  /**
   * Save library to disk
   */
  private async saveLibrary(): Promise<void> {
    try {
      const libraryData = {
        version: '1.0',
        lastModified: new Date().toISOString(),
        contexts: Array.from(this.contexts.values()),
      };

      // Write to temp file first, then rename (atomic operation)
      const tempPath = this.libraryPath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(libraryData, null, 2), 'utf8');
      fs.renameSync(tempPath, this.libraryPath);

      logger.debug({ 
        contexts: this.contexts.size 
      }, '💾 Context library saved');
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Failed to save context library');
      throw error;
    }
  }

  /**
   * Export library (for backup)
   */
  exportLibrary(): string {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      contexts: Array.from(this.contexts.values()),
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Import library (for restore)
   */
  async importLibrary(libraryJson: string): Promise<number> {
    try {
      const parsed = JSON.parse(libraryJson);
      let importedCount = 0;

      for (const entry of parsed.contexts || []) {
        this.contexts.set(entry.id, entry);

        // Rebuild tag index
        for (const tag of entry.tags) {
          if (!this.tagIndex.has(tag)) {
            this.tagIndex.set(tag, new Set());
          }
          this.tagIndex.get(tag)!.add(entry.id);
        }

        importedCount++;
      }

      await this.saveLibrary();
      logger.info({ importedCount }, '📥 Context library imported');

      return importedCount;
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Failed to import library');
      throw error;
    }
  }
}

// Export singleton instance
let _libraryInstance: ContextLibrary | null = null;

export function getContextLibrary(): ContextLibrary {
  if (!_libraryInstance) {
    _libraryInstance = new ContextLibrary();
  }
  return _libraryInstance;
}
