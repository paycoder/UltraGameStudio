export type PluginStoreKind = 'skill' | 'plugin' | 'mcp' | 'index';
export type PluginStoreTrust = 'official' | 'curated' | 'community' | 'registry';
export type PluginStoreInstallKind =
  | 'skill'
  | 'pluginManifest'
  | 'external'
  | 'none';

export interface PluginStoreItem {
  id: string;
  name: string;
  title: string;
  description: string;
  kind: PluginStoreKind;
  sourceId: string;
  sourceName: string;
  sourceUrl?: string;
  installUrl?: string;
  installKind: PluginStoreInstallKind;
  category?: string;
  author?: string;
  version?: string;
  updatedAt?: string;
  tags: string[];
  trust: PluginStoreTrust;
}

export interface PluginStoreLoadError {
  sourceId: string;
  sourceName: string;
  message: string;
}

export interface PluginStoreLoadResult {
  loadedAtMs: number;
  items: PluginStoreItem[];
  errors: PluginStoreLoadError[];
}

interface GitHubContentEntry {
  name: string;
  path: string;
  type: 'file' | 'dir' | string;
  html_url?: string | null;
}

interface ClaudeMarketplacePlugin {
  name?: string;
  description?: string;
  source?: string;
  category?: string;
  version?: string;
  author?: string | { name?: string };
}

interface ClaudeMarketplace {
  plugins?: ClaudeMarketplacePlugin[];
}

interface AwesomeCodexPlugin {
  name?: string;
  url?: string;
  owner?: string;
  repo?: string;
  description?: string;
  category?: string;
  source?: string;
  install_url?: string;
}

interface AwesomeCodexPluginCatalog {
  last_updated?: string;
  plugins?: AwesomeCodexPlugin[];
}

interface McpRegistryRemote {
  type?: string;
  url?: string;
}

interface McpRegistryRepository {
  url?: string;
  source?: string;
  subfolder?: string;
}

interface McpRegistryServer {
  name?: string;
  title?: string;
  description?: string;
  version?: string;
  websiteUrl?: string;
  repository?: McpRegistryRepository;
  remotes?: McpRegistryRemote[];
}

interface McpRegistryEntry {
  server?: McpRegistryServer;
  _meta?: Record<string, { isLatest?: boolean; updatedAt?: string; publishedAt?: string }>;
}

interface McpRegistryResponse {
  servers?: McpRegistryEntry[];
}

const OPENAI_SKILL_ROOTS = ['skills/.curated', 'skills/.system'];
const OPENAI_REPO_RAW = 'https://raw.githubusercontent.com/openai/skills/main';
const OPENAI_REPO_API = 'https://api.github.com/repos/openai/skills/contents';

const BUILT_IN_PLUGIN_STORE_ITEMS: PluginStoreItem[] = [
  {
    id: 'index:voltagent-awesome-agent-skills',
    name: 'awesome-agent-skills',
    title: 'Awesome Agent Skills',
    description:
      '社区维护的 Agent Skills 索引，覆盖 Claude Code、Codex、Gemini CLI、Cursor、OpenCode 等工具。',
    kind: 'index',
    sourceId: 'built-in',
    sourceName: '内置精选',
    sourceUrl: 'https://github.com/VoltAgent/awesome-agent-skills',
    installKind: 'none',
    category: '索引',
    author: 'VoltAgent',
    tags: ['skills', 'codex', 'claude', 'gemini', 'cursor'],
    trust: 'curated',
  },
  {
    id: 'index:hashgraph-awesome-codex-plugins',
    name: 'awesome-codex-plugins',
    title: 'Awesome Codex Plugins',
    description:
      'Codex 插件与技能聚合索引，提供插件仓库、plugin.json 地址和社区插件入口。',
    kind: 'index',
    sourceId: 'built-in',
    sourceName: '内置精选',
    sourceUrl: 'https://github.com/hashgraph-online/awesome-codex-plugins',
    installKind: 'none',
    category: '索引',
    author: 'Hashgraph Online',
    tags: ['codex', 'plugins', 'skills'],
    trust: 'community',
  },
  {
    id: 'index:officialskills',
    name: 'officialskills.sh',
    title: 'Official Skills',
    description:
      '面向 Agent Skills 的在线检索站点，适合发现官方团队和社区维护的技能。',
    kind: 'index',
    sourceId: 'built-in',
    sourceName: '内置精选',
    sourceUrl: 'https://officialskills.sh',
    installKind: 'none',
    category: '索引',
    tags: ['skills', 'official', 'catalog'],
    trust: 'curated',
  },
];

function compactText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function slugFromName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'skill';
}

function humanizeSlug(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) =>
      part.length <= 2
        ? part.toUpperCase()
        : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`,
    )
    .join(' ');
}

function firstMarkdownSummary(text: string): string {
  let inFrontmatter = false;
  let first = true;
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (first && trimmed === '---') {
      inFrontmatter = true;
      first = false;
      continue;
    }
    first = false;
    if (inFrontmatter) {
      if (trimmed === '---') inFrontmatter = false;
      continue;
    }
    if (!trimmed || trimmed.startsWith('<!--')) continue;
    return normalizeWhitespace(
      trimmed.replace(/^#+\s*/, '').replace(/^>\s*/, '').replace(/`/g, ''),
    ).slice(0, 240);
  }
  return '';
}

export function parseSkillFrontmatter(
  text: string,
  fallbackName: string,
): { name: string; description: string } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  let name = '';
  let description = '';
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed === '---') break;
      if (trimmed.startsWith('name:')) {
        name = trimmed.slice('name:'.length).trim().replace(/^['"]|['"]$/g, '');
      }
      if (trimmed.startsWith('description:')) {
        const rest = trimmed
          .slice('description:'.length)
          .trim()
          .replace(/^['"]|['"]$/g, '');
        if (rest === '>' || rest === '|' || rest === '>-' || rest === '|-') {
          const parts: string[] = [];
          for (let j = i + 1; j < lines.length; j += 1) {
            const next = lines[j];
            if (next.trim() === '---') break;
            if (next && !/^\s/.test(next)) break;
            const part = next.trim();
            if (part) parts.push(part);
          }
          description = normalizeWhitespace(parts.join(' '));
        } else {
          description = rest;
        }
      }
    }
  }

  return {
    name: normalizeWhitespace(name) || fallbackName,
    description: normalizeWhitespace(description) || firstMarkdownSummary(text),
  };
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R | null>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  const workerCount = Math.min(Math.max(limit, 1), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        const mapped = await mapper(items[index]);
        if (mapped) results.push(mapped);
      }
    }),
  );

  return results;
}

async function fetchOpenAiSkills(signal?: AbortSignal): Promise<PluginStoreItem[]> {
  const rootEntries = (
    await Promise.all(
      OPENAI_SKILL_ROOTS.map((root) =>
        fetchJson<GitHubContentEntry[]>(
          `${OPENAI_REPO_API}/${encodeURIComponent(root).replace(/%2F/g, '/')}?ref=main`,
          signal,
        ),
      ),
    )
  ).flat();
  const dirs = rootEntries.filter((entry) => entry.type === 'dir');

  return mapWithConcurrency(dirs, 8, async (entry) => {
    const rawUrl = `${OPENAI_REPO_RAW}/${entry.path}/SKILL.md`;
    try {
      const text = await fetchText(rawUrl, signal);
      const meta = parseSkillFrontmatter(text, humanizeSlug(entry.name));
      const root = entry.path.includes('/.system/') ? 'system' : 'curated';
      return {
        id: `skill:openai:${entry.path}`,
        name: slugFromName(meta.name || entry.name),
        title: meta.name || humanizeSlug(entry.name),
        description:
          meta.description ||
          `OpenAI ${root === 'system' ? 'system' : 'curated'} skill.`,
        kind: 'skill',
        sourceId: 'openai-skills',
        sourceName: 'OpenAI Skills',
        sourceUrl: entry.html_url ?? `https://github.com/openai/skills/tree/main/${entry.path}`,
        installUrl: rawUrl,
        installKind: 'skill',
        category: root === 'system' ? 'System' : 'Curated',
        author: 'OpenAI',
        tags: ['openai', 'codex', 'skill', root],
        trust: 'official',
      } satisfies PluginStoreItem;
    } catch {
      return null;
    }
  });
}

async function fetchClaudeCodeMarketplace(
  signal?: AbortSignal,
): Promise<PluginStoreItem[]> {
  const url =
    'https://raw.githubusercontent.com/anthropics/claude-code/main/.claude-plugin/marketplace.json';
  const catalog = await fetchJson<ClaudeMarketplace>(url, signal);
  return (catalog.plugins ?? [])
    .map((plugin): PluginStoreItem | null => {
      const name = compactText(plugin.name);
      if (!name) return null;
      const sourcePath = compactText(plugin.source).replace(/^\.\//, '');
      const htmlSource = sourcePath
        ? `https://github.com/anthropics/claude-code/tree/main/.claude-plugin/${sourcePath}`
        : 'https://github.com/anthropics/claude-code/tree/main/.claude-plugin';
      const manifestUrl = sourcePath
        ? `https://raw.githubusercontent.com/anthropics/claude-code/main/.claude-plugin/${sourcePath}/plugin.json`
        : undefined;
      const author =
        typeof plugin.author === 'string'
          ? compactText(plugin.author)
          : compactText(plugin.author?.name);
      return {
        id: `plugin:anthropic:${name}`,
        name: slugFromName(name),
        title: name,
        description: compactText(plugin.description) || 'Claude Code plugin.',
        kind: 'plugin',
        sourceId: 'claude-code-marketplace',
        sourceName: 'Claude Code Marketplace',
        sourceUrl: htmlSource,
        installUrl: manifestUrl,
        installKind: manifestUrl ? 'pluginManifest' : 'external',
        category: compactText(plugin.category) || 'plugin',
        author: author || 'Anthropic',
        version: compactText(plugin.version),
        tags: ['claude', 'plugin', compactText(plugin.category)].filter(Boolean),
        trust: 'official',
      };
    })
    .filter((item): item is PluginStoreItem => Boolean(item));
}

async function fetchAwesomeCodexPlugins(
  signal?: AbortSignal,
): Promise<PluginStoreItem[]> {
  const catalog = await fetchJson<AwesomeCodexPluginCatalog>(
    'https://raw.githubusercontent.com/hashgraph-online/awesome-codex-plugins/main/plugins.json',
    signal,
  );
  return (catalog.plugins ?? [])
    .map((plugin): PluginStoreItem | null => {
      const name = compactText(plugin.name);
      const sourceUrl = compactText(plugin.url);
      if (!name || !sourceUrl) return null;
      const installUrl = compactText(plugin.install_url);
      return {
        id: `plugin:awesome-codex:${sourceUrl}`,
        name: slugFromName(name),
        title: name,
        description:
          compactText(plugin.description) || 'Community Codex plugin entry.',
        kind: 'plugin',
        sourceId: 'awesome-codex-plugins',
        sourceName: 'Awesome Codex Plugins',
        sourceUrl,
        installUrl: installUrl || undefined,
        installKind: installUrl ? 'pluginManifest' : 'external',
        category: compactText(plugin.category) || 'Codex plugin',
        author: compactText(plugin.owner) || compactText(plugin.repo),
        updatedAt: compactText(catalog.last_updated),
        tags: ['codex', 'plugin', compactText(plugin.category)]
          .filter(Boolean)
          .map((tag) => tag.toLowerCase()),
        trust: 'community',
      };
    })
    .filter((item): item is PluginStoreItem => Boolean(item));
}

function mcpMeta(entry: McpRegistryEntry): {
  isLatest: boolean;
  updatedAt?: string;
} {
  const official = entry._meta?.['io.modelcontextprotocol.registry/official'];
  return {
    isLatest: official?.isLatest === true,
    updatedAt: official?.updatedAt || official?.publishedAt,
  };
}

async function fetchMcpRegistry(signal?: AbortSignal): Promise<PluginStoreItem[]> {
  const catalog = await fetchJson<McpRegistryResponse>(
    'https://registry.modelcontextprotocol.io/v0/servers?limit=80',
    signal,
  );
  const byName = new Map<string, McpRegistryEntry>();
  for (const entry of catalog.servers ?? []) {
    const name = compactText(entry.server?.name);
    if (!name) continue;
    const existing = byName.get(name);
    if (!existing || mcpMeta(entry).isLatest) {
      byName.set(name, entry);
    }
  }

  return Array.from(byName.values()).map((entry) => {
    const server = entry.server ?? {};
    const name = compactText(server.name);
    const remoteUrl = compactText(server.remotes?.find((remote) => remote.url)?.url);
    const sourceUrl =
      compactText(server.websiteUrl) ||
      compactText(server.repository?.url) ||
      remoteUrl ||
      'https://registry.modelcontextprotocol.io';
    const meta = mcpMeta(entry);
    return {
      id: `mcp:${name}:${compactText(server.version)}`,
      name: slugFromName(name),
      title: compactText(server.title) || name,
      description: compactText(server.description) || 'MCP server.',
      kind: 'mcp',
      sourceId: 'mcp-registry',
      sourceName: 'MCP Registry',
      sourceUrl,
      installUrl: remoteUrl || sourceUrl,
      installKind: 'external',
      category: 'MCP',
      author: compactText(server.repository?.source),
      version: compactText(server.version),
      updatedAt: meta.updatedAt,
      tags: [
        'mcp',
        compactText(server.repository?.source),
        compactText(server.remotes?.[0]?.type),
      ].filter(Boolean),
      trust: 'registry',
    };
  });
}

function dedupePluginStoreItems(items: PluginStoreItem[]): PluginStoreItem[] {
  const seen = new Set<string>();
  const out: PluginStoreItem[] = [];
  for (const item of items) {
    const key = `${item.kind}:${item.sourceUrl || item.installUrl || item.id}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function sortPluginStoreItems(items: PluginStoreItem[]): PluginStoreItem[] {
  const trustRank: Record<PluginStoreTrust, number> = {
    official: 0,
    curated: 1,
    registry: 2,
    community: 3,
  };
  const kindRank: Record<PluginStoreKind, number> = {
    skill: 0,
    plugin: 1,
    mcp: 2,
    index: 3,
  };
  return [...items].sort(
    (a, b) =>
      trustRank[a.trust] - trustRank[b.trust] ||
      kindRank[a.kind] - kindRank[b.kind] ||
      a.title.localeCompare(b.title),
  );
}

export async function loadPluginStoreCatalog(
  signal?: AbortSignal,
): Promise<PluginStoreLoadResult> {
  const loaders = [
    {
      sourceId: 'openai-skills',
      sourceName: 'OpenAI Skills',
      load: fetchOpenAiSkills,
    },
    {
      sourceId: 'claude-code-marketplace',
      sourceName: 'Claude Code Marketplace',
      load: fetchClaudeCodeMarketplace,
    },
    {
      sourceId: 'awesome-codex-plugins',
      sourceName: 'Awesome Codex Plugins',
      load: fetchAwesomeCodexPlugins,
    },
    {
      sourceId: 'mcp-registry',
      sourceName: 'MCP Registry',
      load: fetchMcpRegistry,
    },
  ];

  const settled = await Promise.allSettled(
    loaders.map((loader) => loader.load(signal)),
  );
  const items = [...BUILT_IN_PLUGIN_STORE_ITEMS];
  const errors: PluginStoreLoadError[] = [];

  settled.forEach((result, index) => {
    const loader = loaders[index];
    if (result.status === 'fulfilled') {
      items.push(...result.value);
      return;
    }
    if (signal?.aborted) return;
    errors.push({
      sourceId: loader.sourceId,
      sourceName: loader.sourceName,
      message: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  });

  return {
    loadedAtMs: Date.now(),
    items: sortPluginStoreItems(dedupePluginStoreItems(items)),
    errors,
  };
}

function searchablePluginStoreText(item: PluginStoreItem): string {
  return [
    item.name,
    item.title,
    item.description,
    item.kind,
    item.sourceName,
    item.category,
    item.author,
    item.tags.join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function filterPluginStoreItems(
  items: PluginStoreItem[],
  query: string,
  kind: PluginStoreKind | 'all',
  sourceId: string,
): PluginStoreItem[] {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return items.filter((item) => {
    if (kind !== 'all' && item.kind !== kind) return false;
    if (sourceId !== 'all' && item.sourceId !== sourceId) return false;
    if (terms.length === 0) return true;
    const haystack = searchablePluginStoreText(item);
    return terms.every((term) => haystack.includes(term));
  });
}

export function pluginStoreSources(
  items: PluginStoreItem[],
): Array<{ id: string; name: string; count: number }> {
  const counts = new Map<string, { id: string; name: string; count: number }>();
  for (const item of items) {
    const current = counts.get(item.sourceId);
    if (current) {
      current.count += 1;
    } else {
      counts.set(item.sourceId, {
        id: item.sourceId,
        name: item.sourceName,
        count: 1,
      });
    }
  }
  return Array.from(counts.values()).sort((a, b) => a.name.localeCompare(b.name));
}
