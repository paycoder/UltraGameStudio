import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  filterPluginStoreItems,
  parseSkillFrontmatter,
  slugFromName,
  type PluginStoreItem,
} from './pluginStore';
import {
  __resetPluginStoreTranslationCacheForTests,
  shouldTranslatePluginDescription,
  translatePluginDescriptionCached,
} from './pluginStoreTranslation';

const item = (patch: Partial<PluginStoreItem>): PluginStoreItem => ({
  id: 'skill:test',
  name: 'playwright',
  title: 'Playwright',
  description: 'Browser testing skill',
  kind: 'skill',
  sourceId: 'openai-skills',
  sourceName: 'OpenAI Skills',
  installKind: 'skill',
  tags: ['browser', 'testing'],
  trust: 'official',
  ...patch,
});

describe('pluginStore', () => {
  afterEach(() => {
    __resetPluginStoreTranslationCacheForTests();
    vi.unstubAllGlobals();
  });

  it('parses skill frontmatter with folded descriptions', () => {
    expect(
      parseSkillFrontmatter(
        [
          '---',
          'name: playwright',
          'description: >',
          '  Browser automation',
          '  and test debugging',
          '---',
          '# Playwright',
        ].join('\n'),
        'fallback',
      ),
    ).toEqual({
      name: 'playwright',
      description: 'Browser automation and test debugging',
    });
  });

  it('falls back to first markdown heading when description is missing', () => {
    expect(
      parseSkillFrontmatter(['---', 'name: docs', '---', '# Documentation helper'].join('\n'), 'fallback'),
    ).toEqual({
      name: 'docs',
      description: 'Documentation helper',
    });
  });

  it('normalizes names into safe slugs', () => {
    expect(slugFromName('OpenAI Docs / API')).toBe('openai-docs-api');
    expect(slugFromName('  中文 Skill  ')).toBe('中文-skill');
  });

  it('filters by kind, source, and query terms', () => {
    const items = [
      item({ id: 'skill:playwright', title: 'Playwright' }),
      item({
        id: 'plugin:review',
        name: 'code-review',
        title: 'Code Review',
        kind: 'plugin',
        sourceId: 'claude-code-marketplace',
        sourceName: 'Claude Code Marketplace',
        description: 'PR review toolkit',
        installKind: 'pluginManifest',
        trust: 'official',
      }),
    ];

    expect(filterPluginStoreItems(items, 'review toolkit', 'plugin', 'claude-code-marketplace')).toHaveLength(1);
    expect(filterPluginStoreItems(items, 'browser', 'skill', 'all')).toHaveLength(1);
    expect(filterPluginStoreItems(items, 'missing', 'all', 'all')).toHaveLength(0);
  });

  it('decides whether plugin descriptions need locale translation', () => {
    expect(shouldTranslatePluginDescription('Build browser testing skill', 'zh-CN')).toBe(true);
    expect(shouldTranslatePluginDescription('构建浏览器测试技能', 'zh-CN')).toBe(false);
    expect(shouldTranslatePluginDescription('Build browser testing skill', 'en-US')).toBe(false);
    expect(shouldTranslatePluginDescription('构建浏览器测试技能', 'en-US')).toBe(true);
    expect(shouldTranslatePluginDescription('Build browser testing skill', 'fr-FR')).toBe(true);
  });

  it('caches translated plugin descriptions by item and locale', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify([[['构建浏览器测试技能', 'Build browser testing skill']]]), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      translatePluginDescriptionCached(
        'skill:playwright',
        'Build browser testing skill',
        'zh-CN',
      ),
    ).resolves.toBe('构建浏览器测试技能');
    await expect(
      translatePluginDescriptionCached(
        'skill:playwright',
        'Build browser testing skill',
        'zh-CN',
      ),
    ).resolves.toBe('构建浏览器测试技能');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
