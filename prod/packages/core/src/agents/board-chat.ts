import Anthropic from '@anthropic-ai/sdk';
import { costUsd } from './cost';
import type { MessagesClient } from './run';

export const BOARD_CHAT_MODEL = 'claude-sonnet-4-5';
export const BOARD_CHAT_MAX_TOKENS = 8000;

export interface BoardChatTurn { role: 'user' | 'assistant'; content: string }
export interface BoardChatResult { text: string; model: string; tokens_in: number; tokens_out: number; cost_usd: number; latency_ms: number }

/** ANTHROPIC_API_KEY varsa gerçek istemci; yoksa null (çağıran demo yanıtına düşer). */
export const boardChatClient = (): MessagesClient | null => (process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null);

/**
 * Kurul Sohbeti model çağrısı: sistem istemi + sohbet geçmişi → ham metin + kullanım/maliyet.
 * Art arda aynı rolden mesajlar birleştirilir (API dönüşümlü rol ister); ilk mesaj her zaman user olur.
 */
export async function askBoard(args: { client: MessagesClient; system: string; turns: BoardChatTurn[]; model?: string; maxTokens?: number }): Promise<BoardChatResult> {
  const model = args.model ?? BOARD_CHAT_MODEL;
  const merged: BoardChatTurn[] = [];
  for (const t of args.turns) {
    if (!t.content.trim()) continue;
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) last.content += `\n\n${t.content}`; else merged.push({ ...t });
  }
  if (!merged.length || merged[0].role !== 'user') merged.unshift({ role: 'user', content: '(Sohbet başlangıcı)' });
  const t0 = Date.now();
  const res = await args.client.messages.create({ model, max_tokens: args.maxTokens ?? BOARD_CHAT_MAX_TOKENS, system: args.system, messages: merged });
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return { text, model, tokens_in: res.usage.input_tokens, tokens_out: res.usage.output_tokens, cost_usd: costUsd(model, res.usage.input_tokens, res.usage.output_tokens), latency_ms: Date.now() - t0 };
}
