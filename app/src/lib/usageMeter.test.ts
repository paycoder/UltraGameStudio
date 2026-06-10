import { beforeEach, describe, expect, it } from 'vitest';
import {
  readUsageMeterSnapshot,
  recordModelUsageForRoute,
  recordEstimatedModelUsageForSelection,
  usageReportFromCliUsage,
  usageReportFromCodex,
  usageReportFromOpenAI,
} from './usageMeter';

const selection = {
  adapter: 'claude-code',
  modelClass: 'sonnet',
} as const;

describe('usage meter', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persists token totals per session context', () => {
    recordEstimatedModelUsageForSelection(
      selection,
      'hello from session one',
      'reply one',
      { providerName: 'DeepSeek', model: 'deepseek-chat' },
      { context: { workspaceId: 'w1', sessionId: 's1' } },
    );
    recordEstimatedModelUsageForSelection(
      selection,
      'hello from session two '.repeat(20),
      'reply two '.repeat(20),
      { providerName: 'DeepSeek', model: 'deepseek-chat' },
      { context: { workspaceId: 'w1', sessionId: 's2' } },
    );

    const s1 = readUsageMeterSnapshot({ workspaceId: 'w1', sessionId: 's1' });
    const s2 = readUsageMeterSnapshot({ workspaceId: 'w1', sessionId: 's2' });

    expect(s1.totals.calls).toBe(1);
    expect(s2.totals.calls).toBe(1);
    expect(s1.totals.totalTokens).toBeGreaterThan(0);
    expect(s2.totals.totalTokens).toBeGreaterThan(s1.totals.totalTokens);
  });

  it('keeps sessions separate from the global fallback bucket', () => {
    recordEstimatedModelUsageForSelection(selection, 'global', 'reply');
    recordEstimatedModelUsageForSelection(
      selection,
      'session',
      'reply',
      { providerName: 'DeepSeek', model: 'deepseek-chat' },
      { context: { workspaceId: 'w1', sessionId: 's1' } },
    );

    expect(readUsageMeterSnapshot().totals.calls).toBe(1);
    expect(readUsageMeterSnapshot({ workspaceId: 'w1', sessionId: 's1' }).totals.calls)
      .toBe(1);
    expect(readUsageMeterSnapshot({ workspaceId: 'w1', sessionId: 's2' }).totals.calls)
      .toBe(0);
  });

  it('records OpenAI-compatible cached token usage as real data', () => {
    const report = usageReportFromOpenAI({
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      prompt_tokens_details: { cached_tokens: 64 },
    });

    recordModelUsageForRoute(
      { providerName: 'OpenAI', model: 'gpt-5.1' },
      report!,
      { estimated: false, context: { workspaceId: 'w1', sessionId: 's1' } },
    );

    const snapshot = readUsageMeterSnapshot({ workspaceId: 'w1', sessionId: 's1' });
    expect(snapshot.lastCall.estimated).toBe(false);
    expect(snapshot.lastCall.cachedInputTokens).toBe(64);
    expect(snapshot.lastCall.cachePercent).toBe(64);
  });

  it('records Codex CLI cached token usage as real data', () => {
    const report = usageReportFromCodex({
      input_tokens: 22451,
      cached_input_tokens: 11648,
      output_tokens: 28,
      reasoning_output_tokens: 21,
    });

    recordModelUsageForRoute(
      { providerName: 'KuroAI', model: 'gpt-5.5' },
      report!,
      { estimated: false, context: { workspaceId: 'w1', sessionId: 's1' } },
    );

    const snapshot = readUsageMeterSnapshot({ workspaceId: 'w1', sessionId: 's1' });
    expect(snapshot.lastCall.estimated).toBe(false);
    expect(snapshot.lastCall.inputTokens).toBe(22451);
    expect(snapshot.lastCall.cachedInputTokens).toBe(11648);
    expect(snapshot.lastCall.cachePercent).toBeCloseTo(51.88, 2);
  });

  it('folds Anthropic CLI cache hits back into the input total', () => {
    // claude stream-json reports input_tokens as the *uncached* prefix only;
    // the cached prefix lives in cache_read/cache_creation.
    const report = usageReportFromCliUsage({
      input_tokens: 120,
      output_tokens: 40,
      cache_read_input_tokens: 800,
      cache_creation_input_tokens: 80,
    });

    expect(report).not.toBeNull();
    // 120 + 800 + 80 folded into a single input total.
    expect(report!.inputTokens).toBe(1000);

    recordModelUsageForRoute(
      { providerName: 'Anthropic', model: 'claude-sonnet-4' },
      report!,
      { estimated: false, context: { workspaceId: 'w1', sessionId: 's1' } },
    );

    const snapshot = readUsageMeterSnapshot({ workspaceId: 'w1', sessionId: 's1' });
    expect(snapshot.lastCall.estimated).toBe(false);
    expect(snapshot.lastCall.inputTokens).toBe(1000);
    expect(snapshot.lastCall.cachedInputTokens).toBe(880);
    expect(snapshot.lastCall.cachePercent).toBeCloseTo(88, 2);
  });

  it('treats Codex CLI input_tokens as already inclusive of the cached portion', () => {
    const report = usageReportFromCliUsage({
      input_tokens: 22451,
      cached_input_tokens: 11648,
      output_tokens: 28,
    });

    expect(report).not.toBeNull();
    // No cache_read/creation keys -> Codex style, input stays as reported.
    expect(report!.inputTokens).toBe(22451);
    expect(report!.cacheReadInputTokens).toBe(11648);
  });

  it('returns null for usage payloads without recognizable token counts', () => {
    expect(usageReportFromCliUsage(null)).toBeNull();
    expect(usageReportFromCliUsage({})).toBeNull();
    expect(usageReportFromCliUsage({ some: 'thing' })).toBeNull();
  });
});
