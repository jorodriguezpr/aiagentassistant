/**
 * AI Agent Assistant (AiAgentAssistant)
 * SysAdminHCP product documentation — bundled FAQ / Wiki / manuals / editions / API reference,
 * so the agent can answer "how does SysAdminHCP work" questions from real docs instead of
 * guessing or looping through live tool calls trying to reverse-engineer the answer.
 *
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger.js';

interface KbEntry {
  source: string;
  category: string;
  title: string;
  text: string;
  anchor?: string;
}

let KB_ENTRIES: KbEntry[] = [];

function loadKb(): void {
  try {
    const kbPath = path.join(__dirname, '../../src/knowledge/sysadminhcpKb.json');
    const data = fs.readFileSync(kbPath, 'utf-8');
    const kb = JSON.parse(data);
    KB_ENTRIES = kb.entries || [];
    logger.info(`Loaded ${KB_ENTRIES.length} SysAdminHCP documentation entries`);
  } catch (error: any) {
    logger.error('Failed to load SysAdminHCP documentation KB:', error);
    KB_ENTRIES = [];
  }
}

loadKb();

/** Simple keyword-overlap scoring — no embeddings needed for a ~140-entry bundled KB. Title matches count double. */
export function searchSysAdminHcpDocs(query: string, limit = 5): KbEntry[] {
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  if (!words.length) return [];

  const scored = KB_ENTRIES.map((e) => {
    const title = e.title.toLowerCase();
    const text = e.text.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (title.includes(w)) score += 2;
      if (text.includes(w)) score += 1;
    }
    return { entry: e, score };
  }).filter((s) => s.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry);
}
