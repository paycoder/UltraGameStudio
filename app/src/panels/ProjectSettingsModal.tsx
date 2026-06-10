import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import {
  Bone,
  Box,
  Check,
  Copy,
  Download,
  FileText,
  Gamepad2,
  Info,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Settings as SettingsIcon,
  SlashSquare,
  SlidersHorizontal,
  Terminal,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  mergeRecommendedMcpServers,
  projectEngineLabel,
  projectHealth,
  projectSettingsFromMetadata,
  projectSettingsPatch,
  isGameProjectEngine,
  settingsWithDetectedGameFeatures,
  type ProjectMcpServerConfig,
  type ProjectSettings,
} from '@/lib/projectSettings';
import {
  GAME_PROJECT_COMMAND_NAMES,
  buildSlashSuggestions,
  isGameProjectCommandName,
  type SlashSuggestion,
} from '@/lib/slashCommands';
import {
  loadThreeDGenerationSettings,
  saveThreeDGenerationSettings,
} from '@/lib/threeDGeneration';
import {
  openLocalPath,
  probeProjectMcpServer,
  scanProjectEnvironment,
  ueMcpEnsureBinary,
  ueMcpSetupProject,
  tauriAvailable,
  UE_MCP_SERVER_ID,
  type ProjectEnvironmentScan,
  type ProjectMcpProbeResult,
  type UeMcpSetupResult,
} from '@/lib/tauri';
import { historyStore } from '@/store/history/store';
import type { WorkspaceRecord, WorkspaceSummary } from '@/store/history/types';
import { useStore } from '@/store/useStore';
import {
  ThreeDGenerationSettingsPanel,
  RiggingSettingsPanel,
  GameExpertSettingsPanel,
} from '@/panels/SettingsModal';

type ProjectSettingsTab =
  | 'overview'
  | 'mesh'
  | 'rigging'
  | 'gameExperts'
  | 'commands'
  | 'mcp'
  | 'skills'
  | 'automation';

const tabs: { id: ProjectSettingsTab; label: string; Icon: LucideIcon }[] = [
  { id: 'overview', label: '概览', Icon: Info },
  { id: 'mesh', label: 'Mesh 渠道', Icon: Box },
  { id: 'rigging', label: '绑定渠道', Icon: Bone },
  { id: 'gameExperts', label: '游戏专家', Icon: Gamepad2 },
  { id: 'commands', label: '命令', Icon: SlashSquare },
  { id: 'mcp', label: 'MCP配置', Icon: Terminal },
  { id: 'skills', label: 'Skill', Icon: Box },
  { id: 'automation', label: '权限/自动化', Icon: SlidersHorizontal },
];

interface ProjectSettingsModalProps {
  workspace: WorkspaceSummary;
  onClose: () => void;
  onWorkspaceUpdated?: (workspace: WorkspaceSummary) => void;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function workspaceSummaryFromRecord(record: WorkspaceRecord): WorkspaceSummary {
  return {
    id: record.id,
    path: record.path,
    name: record.name,
    updatedAt: record.updatedAt,
    sessionCount: record.sessionCount,
    lastActiveSessionId: record.lastActiveSessionId,
    metadata: record.metadata,
  };
}

function formatTime(ms?: number | null): string {
  if (!ms) return '未探测';
  return new Date(ms).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function syncProjectGameFeaturesToRuntime(settings: ProjectSettings): void {
  const currentThreeD = loadThreeDGenerationSettings();
  saveThreeDGenerationSettings({
    ...currentThreeD,
    enabled: settings.gameFeatures.meshGeneration,
    rigging: {
      ...currentThreeD.rigging,
      enabled: settings.gameFeatures.rigging,
    },
  });

  useStore.getState().setGameExpertSettings({
    enabled: settings.gameFeatures.gameExperts,
    engine: settings.gameFeatures.gameExpertEngine,
  });
}

// Game-only tabs (Mesh / Rigging / Game Experts / Commands) only make sense for
// recognized game engines (Unity / Unreal / Godot). For non-game projects they
// stay hidden unless a feature was explicitly turned on for this project.
function shouldShowGameFeatures(
  settings: ProjectSettings,
  scan: ProjectEnvironmentScan | null,
): boolean {
  const detectedEngine = scan?.engine.engine ?? settings.engine;
  return (
    isGameProjectEngine(detectedEngine) ||
    settings.gameFeatures.meshGeneration ||
    settings.gameFeatures.rigging ||
    settings.gameFeatures.gameExperts
  );
}

const GAME_FEATURE_TABS: ReadonlySet<ProjectSettingsTab> = new Set([
  'mesh',
  'rigging',
  'gameExperts',
  'commands',
]);

function fieldId(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold text-fg">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-fg-faint">{hint}</span> : null}
    </label>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-md border border-border-soft bg-bg-alt px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-fg">{label}</span>
        {hint ? <span className="mt-1 block text-[11px] text-fg-faint">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
      />
    </label>
  );
}

function ProjectCommandsSettings() {
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const commands = useMemo(() => {
    const order = new Map(
      GAME_PROJECT_COMMAND_NAMES.map((name, index) => [name.toLowerCase(), index]),
    );
    return buildSlashSuggestions([], 'zh-CN')
      .filter((item) => isGameProjectCommandName(item.name))
      .sort(
        (a, b) =>
          (order.get(a.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER),
      );
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((item) => item.searchText.includes(q));
  }, [commands, query]);

  const copyName = (item: SlashSuggestion) => {
    void navigator.clipboard?.writeText(item.name).then(
      () => {
        setCopiedId(item.id);
        window.setTimeout(() => {
          setCopiedId((current) => (current === item.id ? null : current));
        }, 1500);
      },
      () => {},
    );
  };

  return (
    <div className="grid gap-4">
      <section className="rounded-md border border-border bg-panel-2 p-4">
        <div className="text-sm font-semibold text-fg">游戏命令</div>
        <div className="mt-1 text-xs leading-relaxed text-fg-faint">
          当前项目可用的游戏 slash command。非游戏项目不会显示此 tab。
        </div>
      </section>

      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint"
        />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="搜索命令或用途..."
          className="w-full rounded-lg border border-border bg-bg-alt py-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-border bg-bg-alt px-4 py-6 text-center text-xs text-fg-faint">
          没有匹配的命令。
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <ProjectCommandRow
              key={item.id}
              item={item}
              copied={copiedId === item.id}
              onCopy={() => copyName(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCommandRow({
  item,
  copied,
  onCopy,
}: {
  item: SlashSuggestion;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="group grid gap-2 rounded-lg border border-border bg-bg-alt px-4 py-3 md:grid-cols-[minmax(10rem,16rem)_minmax(0,1fr)] md:items-start">
      <div className="flex min-w-0 items-center gap-2">
        <code className="truncate font-mono text-sm font-medium text-accent">
          {item.name}
        </code>
        <button
          type="button"
          onClick={onCopy}
          aria-label="复制命令名"
          title="复制命令名"
          className="ml-auto shrink-0 rounded p-1 text-fg-faint opacity-0 transition-opacity hover:text-fg focus:opacity-100 group-hover:opacity-100"
        >
          {copied ? (
            <Check size={13} className="text-accent-2" />
          ) : (
            <Copy size={13} />
          )}
        </button>
      </div>
      <div className="min-w-0">
        {item.label && item.label !== item.name && (
          <div className="text-sm font-medium text-fg">{item.label}</div>
        )}
        {item.detail && (
          <p className="mt-0.5 text-xs leading-relaxed text-fg-faint">
            {item.detail}
          </p>
        )}
      </div>
    </div>
  );
}

function ProbeBadge({ result }: { result?: ProjectMcpProbeResult }) {
  if (!result) {
    return (
      <span className="rounded border border-border-soft bg-bg-alt px-2 py-0.5 text-[11px] text-fg-faint">
        未探测
      </span>
    );
  }
  return (
    <span
      className={cn(
        'rounded border px-2 py-0.5 text-[11px]',
        result.ok
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
          : 'border-red-500/40 bg-red-500/10 text-red-300',
      )}
      title={result.message}
    >
      {result.ok ? '已连接' : '失败'}
    </span>
  );
}

function UnrealMcpQuickSetup({
  busy,
  step,
  result,
  error,
  onRun,
  onOpenFile,
}: {
  busy: boolean;
  step: string | null;
  result: UeMcpSetupResult | null;
  error: string | null;
  onRun: () => void;
  onOpenFile: (path: string) => void;
}) {
  const desktop = tauriAvailable();
  const restartNeeded =
    !!result?.ok &&
    (result.changed ||
      result.configuredPlugins.length > 0 ||
      result.changedFiles.some((file) =>
        /defaultengine\.ini|remotecontrol\.ini|\.uproject$/i.test(file),
      ));
  return (
    <section className="grid gap-3 rounded-md border border-accent/40 bg-accent/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Rocket size={16} className="text-accent" />
            一键配置 Unreal MCP
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fg-faint">
            自动下载并校验版本无关的 Unreal MCP 服务（支持 UE 4.25–5.8），在 .uproject
            中启用 RemoteControl / EditorScripting / Python 插件，写入 RemoteControl
            随编辑器自启动的配置，并合并项目 .mcp.json、登记到本项目的 MCP
            列表。全程无需手动操作。
          </p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={busy || !desktop}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-accent bg-accent/20 px-3 py-2 text-xs font-semibold text-fg hover:bg-accent/30 disabled:opacity-50"
        >
          {busy ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          {busy ? '配置中...' : '一键安装并配置'}
        </button>
      </div>

      {!desktop ? (
        <div className="rounded border border-border-soft bg-bg-alt px-3 py-2 text-[11px] text-fg-faint">
          一键安装需要在桌面应用中运行（浏览器环境无法下载二进制或写入工程配置）。
        </div>
      ) : null}

      {busy && step ? (
        <div className="flex items-center gap-2 rounded border border-border-soft bg-bg-alt px-3 py-2 text-[11px] text-fg-dim">
          <RefreshCw size={12} className="animate-spin text-accent" />
          {step}
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      ) : null}

      {result?.ok ? (
        <div className="grid gap-2 rounded border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-[11px] text-fg-dim">
          <div className="flex items-center gap-1.5 text-emerald-300">
            <Check size={13} />
            配置完成
            {result.engineAssociation ? `（引擎 ${result.engineAssociation}）` : ''}
          </div>
          {result.configuredPlugins.length > 0 ? (
            <div>
              已启用插件：
              <span className="text-fg">{result.configuredPlugins.join('、')}</span>
            </div>
          ) : null}
          {result.changedFiles.length > 0 ? (
            <div className="grid gap-1">
              <span>已写入/更新：</span>
              <ul className="grid gap-0.5">
                {result.changedFiles.map((file) => (
                  <li key={file} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenFile(file)}
                      title="在文件管理器中显示"
                      className="truncate text-left font-mono text-accent hover:underline"
                    >
                      {file}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {restartNeeded ? (
            <div className="mt-1 flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-amber-300">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" />
              <span>
                插件或 RemoteControl 设置已变更，请重启 Unreal Editor 使其生效。MCP
                服务支持懒连接，可先于编辑器启动，无需手动重启 CLI。
              </span>
            </div>
          ) : null}
          {result.notes.length > 0 ? (
            <div className="text-fg-faint">
              说明：{result.notes.join('；')}
            </div>
          ) : null}
          {result.warnings.length > 0 ? (
            <div className="text-amber-300/90">
              提示：{result.warnings.join('；')}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default function ProjectSettingsModal({
  workspace,
  onClose,
  onWorkspaceUpdated,
}: ProjectSettingsModalProps) {
  const [tab, setTab] = useState<ProjectSettingsTab>('overview');
  const locale = useStore((s) => s.locale);
  const gameExpertSettings = useStore((s) => s.gameExpertSettings);
  const setGameExpertSettings = useStore((s) => s.setGameExpertSettings);
  const [record, setRecord] = useState<WorkspaceRecord | null>(null);
  const [scan, setScan] = useState<ProjectEnvironmentScan | null>(null);
  const [settings, setSettings] = useState<ProjectSettings>(() =>
    projectSettingsFromMetadata(workspace.metadata),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [ueSetupBusy, setUeSetupBusy] = useState(false);
  const [ueSetupStep, setUeSetupStep] = useState<string | null>(null);
  const [ueSetupResult, setUeSetupResult] = useState<UeMcpSetupResult | null>(null);
  const [ueSetupError, setUeSetupError] = useState<string | null>(null);

  const workspacePath = record?.path || workspace.path || '';
  const health = useMemo(
    () =>
      projectHealth(
        {
          ...workspace,
          metadata: record?.metadata ?? workspace.metadata,
        },
        scan,
      ),
    [record?.metadata, scan, workspace],
  );
  const showGameFeatures = shouldShowGameFeatures(settings, scan);
  const visibleTabs = useMemo(
    () =>
      tabs.filter((item) => !GAME_FEATURE_TABS.has(item.id) || showGameFeatures),
    [showGameFeatures],
  );

  const updateMcp = useCallback(
    (patch: Partial<ProjectSettings['mcp']>) => {
      setSettings((current) => ({
        ...current,
        mcp: { ...current.mcp, ...patch },
      }));
      setDirty(true);
    },
    [],
  );

  const updateAutomation = useCallback(
    (patch: Partial<ProjectSettings['automation']>) => {
      setSettings((current) => {
        const next = {
          ...current,
          automation: { ...current.automation, ...patch },
        };
        return patch.autoDetect === true && scan
          ? settingsWithDetectedGameFeatures(next, scan)
          : next;
      });
      setDirty(true);
    },
    [scan],
  );

  const updateGameFeatures = useCallback(
    (patch: Partial<ProjectSettings['gameFeatures']>) => {
      setSettings((current) => ({
        ...current,
        gameFeatures: { ...current.gameFeatures, ...patch },
      }));
      setDirty(true);
    },
    [],
  );

  const updateSkills = useCallback(
    (patch: Partial<ProjectSettings['skills']>) => {
      setSettings((current) => ({
        ...current,
        skills: { ...current.skills, ...patch },
      }));
      setDirty(true);
    },
    [],
  );

  const updateServer = useCallback(
    (serverId: string, patch: Partial<ProjectMcpServerConfig>) => {
      setSettings((current) => ({
        ...current,
        mcp: {
          ...current.mcp,
          servers: current.mcp.servers.map((server) =>
            server.id === serverId ? { ...server, ...patch } : server,
          ),
        },
      }));
      setDirty(true);
    },
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      const latestRecord = await historyStore.getWorkspace(workspace.id);
      setRecord(latestRecord);
      const baseSettings = projectSettingsFromMetadata(
        latestRecord?.metadata ?? workspace.metadata,
      );
      let nextScan: ProjectEnvironmentScan | null = null;
      if ((latestRecord?.path || workspace.path || '').trim()) {
        nextScan = await scanProjectEnvironment(latestRecord?.path || workspace.path);
        setScan(nextScan);
      } else {
        setScan(null);
      }
      const nextSettings = nextScan
        ? settingsWithDetectedGameFeatures(baseSettings, nextScan)
        : baseSettings;
      setSettings(nextSettings);
      syncProjectGameFeaturesToRuntime(nextSettings);
      setDirty(false);
    } catch (err) {
      setStatus(`检测失败：${describeError(err)}`);
    } finally {
      setLoading(false);
    }
  }, [workspace.id, workspace.metadata, workspace.path]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (GAME_FEATURE_TABS.has(tab) && !showGameFeatures) {
      setTab('overview');
    }
  }, [showGameFeatures, tab]);

  const persistSettings = useCallback(
    async (next: ProjectSettings) => {
      setSaving(true);
      try {
        const nextRecord = await historyStore.patchWorkspaceMetadata(
          workspace.id,
          projectSettingsPatch(next),
        );
        const summary = workspaceSummaryFromRecord(nextRecord);
        setRecord(nextRecord);
        const savedSettings = projectSettingsFromMetadata(nextRecord.metadata);
        setSettings(savedSettings);
        syncProjectGameFeaturesToRuntime(savedSettings);
        useStore.setState((state) => ({
          workspaces: state.workspaces.map((item) =>
            item.id === summary.id ? summary : item,
          ),
        }));
        onWorkspaceUpdated?.(summary);
        setDirty(false);
        setStatus('已保存');
      } catch (err) {
        setStatus(`保存失败：${describeError(err)}`);
      } finally {
        setSaving(false);
      }
    },
    [onWorkspaceUpdated, workspace.id],
  );

  const applyRecommended = useCallback(async () => {
    if (!scan) return;
    const next = mergeRecommendedMcpServers(settings, scan);
    setSettings(next);
    await persistSettings(next);
    setStatus('推荐 MCP 配置已应用');
  }, [persistSettings, scan, settings]);

  const addCustomServer = useCallback(() => {
    const id = `custom-${Date.now().toString(36)}`;
    updateMcp({
      servers: [
        ...settings.mcp.servers,
        {
          id,
          label: '自定义 MCP',
          source: 'custom',
          enabled: true,
          transport: 'stdio',
          command: '',
          args: [],
          env: {},
        },
      ],
    });
  }, [settings.mcp.servers, updateMcp]);

  const removeServer = useCallback(
    (serverId: string) => {
      updateMcp({
        servers: settings.mcp.servers.filter((server) => server.id !== serverId),
      });
    },
    [settings.mcp.servers, updateMcp],
  );

  const probeEnabledServers = useCallback(async () => {
    const enabledServers = settings.mcp.enabled
      ? settings.mcp.servers.filter((server) => server.enabled)
      : [];
    if (!workspacePath.trim() || enabledServers.length === 0) {
      setStatus('没有可探测的 MCP server');
      return;
    }
    setProbing(true);
    setStatus('探测中...');
    const results: ProjectMcpProbeResult[] = [];
    for (const server of enabledServers) {
      const result = await probeProjectMcpServer(workspacePath, {
        id: server.id,
        transport: server.transport,
        command: server.command,
        args: server.args,
        env: server.env,
        url: server.url,
      }).catch((err): ProjectMcpProbeResult => ({
        serverId: server.id,
        ok: false,
        status: 'probe-error',
        message: describeError(err),
        toolsCount: null,
        checkedAtMs: Date.now(),
      }));
      results.push(result);
    }
    const resultById = new Map(results.map((result) => [result.serverId, result]));
    const next: ProjectSettings = {
      ...settings,
      mcp: {
        ...settings.mcp,
        servers: settings.mcp.servers.map((server) => {
          const result = resultById.get(server.id);
          return result ? { ...server, lastProbe: result } : server;
        }),
      },
    };
    setSettings(next);
    await persistSettings(next);
    const okCount = results.filter((result) => result.ok).length;
    setStatus(`探测完成：${okCount}/${results.length} 已连接`);
    setProbing(false);
  }, [persistSettings, settings, workspacePath]);

  const isUnrealProject =
    (scan?.engine.engine ?? settings.engine) === 'unreal';

  // True one-click flow: download+verify binary → run --setup-project →
  // register/update the project MCP server → probe → surface a restart hint.
  const setupUnrealMcp = useCallback(async () => {
    if (!tauriAvailable()) {
      setUeSetupError('一键安装需要在桌面应用中运行。');
      return;
    }
    if (!workspacePath.trim()) {
      setUeSetupError('未指定工作区路径。');
      return;
    }
    setUeSetupBusy(true);
    setUeSetupError(null);
    setUeSetupResult(null);
    setStatus(null);
    try {
      setUeSetupStep('正在下载并校验 UE MCP 二进制...');
      const binary = await ueMcpEnsureBinary();

      setUeSetupStep('正在配置工程（启用插件 / 写入 RemoteControl 与 .mcp.json）...');
      const result = await ueMcpSetupProject({
        rootPath: workspacePath,
        serverCommand: binary.path,
      });
      setUeSetupResult(result);
      if (!result.ok) {
        setUeSetupError(result.error || 'UE MCP 配置失败。');
        return;
      }

      // Register / update the project MCP server so it persists + is probeable.
      const serverConfig: ProjectMcpServerConfig = {
        id: UE_MCP_SERVER_ID,
        label: 'Unreal MCP (全版本)',
        description: `版本无关的 Unreal RemoteControl MCP（${binary.version}），支持 UE 4.25–5.8。`,
        source: 'suggested',
        enabled: true,
        transport: 'stdio',
        command: result.serverCommand || binary.path,
        args: [],
        env: {},
        requiresUserApproval: true,
      };
      const merged: ProjectSettings = {
        ...settings,
        engine: 'unreal',
        mcp: {
          ...settings.mcp,
          enabled: true,
          servers: settings.mcp.servers.some((s) => s.id === UE_MCP_SERVER_ID)
            ? settings.mcp.servers.map((s) =>
                s.id === UE_MCP_SERVER_ID ? { ...s, ...serverConfig } : s,
              )
            : [...settings.mcp.servers, serverConfig],
        },
      };
      setSettings(merged);
      await persistSettings(merged);

      // Best-effort connectivity probe (the server lazy-connects, so a failure
      // here usually just means the editor isn't running yet).
      setUeSetupStep('正在探测 MCP 连接...');
      const probe = await probeProjectMcpServer(workspacePath, {
        id: serverConfig.id,
        transport: serverConfig.transport,
        command: serverConfig.command,
        args: serverConfig.args,
        env: serverConfig.env,
      }).catch(
        (err): ProjectMcpProbeResult => ({
          serverId: serverConfig.id,
          ok: false,
          status: 'probe-error',
          message: describeError(err),
          toolsCount: null,
          checkedAtMs: Date.now(),
        }),
      );
      const probed: ProjectSettings = {
        ...merged,
        mcp: {
          ...merged.mcp,
          servers: merged.mcp.servers.map((s) =>
            s.id === serverConfig.id ? { ...s, lastProbe: probe } : s,
          ),
        },
      };
      setSettings(probed);
      await persistSettings(probed);
      setStatus(
        probe.ok
          ? 'Unreal MCP 已配置并连接成功。'
          : 'Unreal MCP 已配置；等待 Unreal Editor 启动后即可连接。',
      );
    } catch (err) {
      setUeSetupError(describeError(err));
    } finally {
      setUeSetupBusy(false);
      setUeSetupStep(null);
    }
  }, [persistSettings, settings, workspacePath]);

  const content = (() => {
    if (tab === 'overview') {
      const detectedEngine = scan?.engine.engine ?? 'unknown';
      return (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <section className="rounded-md border border-border bg-panel-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-fg-faint">项目类型</div>
                <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-fg">
                  <Gamepad2 size={18} className="text-accent" />
                  {scan?.engine.label ?? '检测中'}
                </div>
                <div className="mt-1 text-xs text-fg-faint">
                  {scan?.engine.version ?? projectEngineLabel(detectedEngine)}
                </div>
              </div>
              <span
                className={cn(
                  'rounded border px-2 py-1 text-xs',
                  health.tone === 'connected'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : health.tone === 'failed'
                      ? 'border-red-500/40 bg-red-500/10 text-red-300'
                      : health.tone === 'configured'
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                        : health.tone === 'detected'
                          ? 'border-sky-500/40 bg-sky-500/10 text-sky-300'
                          : 'border-border-soft bg-bg-alt text-fg-faint',
                )}
                title={health.detail}
              >
                {health.label}
              </span>
            </div>
            <div className="mt-4 grid gap-2 text-xs text-fg-dim">
              <div className="truncate" title={workspacePath}>
                工作区：{workspacePath || '未指定'}
              </div>
              <div>标记：{scan?.engine.markers.join('、') || '无'}</div>
              <div>推荐 MCP：{scan?.suggestedMcpServers.length ?? 0}</div>
            </div>
          </section>

          <section className="grid gap-3 rounded-md border border-border bg-panel-2 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-fg">项目 MCP</div>
                <div className="mt-1 text-xs text-fg-faint">{health.detail}</div>
              </div>
              <button
                type="button"
                onClick={() => setTab('mcp')}
                className="rounded-md border border-border bg-bg-alt px-3 py-1.5 text-xs text-fg-dim hover:border-accent hover:text-fg"
              >
                配置
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded border border-border-soft bg-bg-alt p-3">
                <div className="text-[11px] text-fg-faint">已配置</div>
                <div className="mt-1 text-lg font-semibold text-fg">
                  {settings.mcp.servers.length}
                </div>
              </div>
              <div className="rounded border border-border-soft bg-bg-alt p-3">
                <div className="text-[11px] text-fg-faint">已启用</div>
                <div className="mt-1 text-lg font-semibold text-fg">
                  {settings.mcp.servers.filter((server) => server.enabled).length}
                </div>
              </div>
              <div className="rounded border border-border-soft bg-bg-alt p-3">
                <div className="text-[11px] text-fg-faint">已连接</div>
                <div className="mt-1 text-lg font-semibold text-fg">
                  {settings.mcp.servers.filter((server) => server.lastProbe?.ok).length}
                </div>
              </div>
            </div>
          </section>
        </div>
      );
    }

    if (tab === 'mesh') {
      const detectedEngine = scan?.engine.engine ?? 'unknown';
      const autoMode = settings.automation.autoDetect;
      return (
        <div className="grid gap-4">
          <section className="rounded-md border border-border bg-panel-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-fg">Mesh 渠道</div>
                <div className="mt-1 text-xs leading-relaxed text-fg-faint">
                  当前检测：{scan?.engine.label ?? '未识别'}。自动检测开启时，UE /
                  Unity / Godot 项目会默认开启 Mesh 渠道；非游戏项目默认关闭。
                </div>
              </div>
              <span
                className={cn(
                  'rounded border px-2 py-0.5 text-[11px]',
                  detectedEngine === 'unknown'
                    ? 'border-border-soft bg-bg-alt text-fg-faint'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
                )}
              >
                {autoMode ? '自动检测' : '手动设置'}
              </span>
            </div>
          </section>

          <ToggleRow
            label="启用 Mesh 渠道"
            hint="控制当前项目是否启用 3D 模型生成入口。"
            checked={settings.gameFeatures.meshGeneration}
            onChange={(checked) => updateGameFeatures({ meshGeneration: checked })}
          />

          <div className="rounded-md border border-border bg-panel-2 p-4 text-xs text-fg-faint">
            <span className="inline-flex items-center gap-1 rounded border border-border-soft bg-bg-alt px-2 py-1">
              <Box size={12} />
              Mesh：{settings.gameFeatures.meshGeneration ? '开启' : '关闭'}
            </span>
          </div>

          <ThreeDGenerationSettingsPanel locale={locale} embedded />
        </div>
      );
    }

    if (tab === 'rigging') {
      const detectedEngine = scan?.engine.engine ?? 'unknown';
      const autoMode = settings.automation.autoDetect;
      return (
        <div className="grid gap-4">
          <section className="rounded-md border border-border bg-panel-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-fg">绑定渠道</div>
                <div className="mt-1 text-xs leading-relaxed text-fg-faint">
                  当前检测：{scan?.engine.label ?? '未识别'}。自动检测开启时，UE /
                  Unity / Godot 项目会默认开启自动骨骼绑定；非游戏项目默认关闭。
                </div>
              </div>
              <span
                className={cn(
                  'rounded border px-2 py-0.5 text-[11px]',
                  detectedEngine === 'unknown'
                    ? 'border-border-soft bg-bg-alt text-fg-faint'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
                )}
              >
                {autoMode ? '自动检测' : '手动设置'}
              </span>
            </div>
          </section>

          <ToggleRow
            label="启用绑定渠道"
            hint="控制当前项目是否启用自动绑骨流程。"
            checked={settings.gameFeatures.rigging}
            onChange={(checked) => updateGameFeatures({ rigging: checked })}
          />

          <div className="rounded-md border border-border bg-panel-2 p-4 text-xs text-fg-faint">
            <span className="inline-flex items-center gap-1 rounded border border-border-soft bg-bg-alt px-2 py-1">
              <Bone size={12} />
              绑定：{settings.gameFeatures.rigging ? '开启' : '关闭'}
            </span>
          </div>

          <RiggingSettingsPanel locale={locale} embedded />
        </div>
      );
    }

    if (tab === 'gameExperts') {
      const detectedEngine = scan?.engine.engine ?? 'unknown';
      const autoMode = settings.automation.autoDetect;
      return (
        <div className="grid gap-4">
          <section className="rounded-md border border-border bg-panel-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-fg">游戏专家</div>
                <div className="mt-1 text-xs leading-relaxed text-fg-faint">
                  当前检测：{scan?.engine.label ?? '未识别'}。自动检测开启时，UE /
                  Unity / Godot 项目会默认开启游戏专家，并自动选择对应引擎。
                </div>
              </div>
              <span
                className={cn(
                  'rounded border px-2 py-0.5 text-[11px]',
                  detectedEngine === 'unknown'
                    ? 'border-border-soft bg-bg-alt text-fg-faint'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
                )}
              >
                {autoMode ? '自动检测' : '手动设置'}
              </span>
            </div>
          </section>

          <ToggleRow
            label="启用游戏专家"
            hint="控制当前项目是否启用游戏专家，并在游戏项目中自动选择对应引擎。"
            checked={settings.gameFeatures.gameExperts}
            onChange={(checked) => updateGameFeatures({ gameExperts: checked })}
          />

          <div className="grid gap-3 rounded-md border border-border bg-panel-2 p-4">
            <SettingsRow
              label="游戏专家引擎"
              hint="自动检测开启时会跟随项目类型；非游戏项目使用自动。"
            >
              <select
                value={settings.gameFeatures.gameExpertEngine}
                onChange={(event) => {
                  const gameExpertEngine = event.currentTarget
                    .value as ProjectSettings['gameFeatures']['gameExpertEngine'];
                  updateGameFeatures({
                    gameExpertEngine,
                  });
                }}
                className="h-9 w-full rounded-md border border-border bg-bg px-2 text-sm text-fg outline-none focus:border-accent"
              >
                <option value="auto">自动</option>
                <option value="unity">Unity</option>
                <option value="unreal">Unreal / UE</option>
                <option value="godot">Godot</option>
              </select>
            </SettingsRow>
            <div className="flex flex-wrap gap-2 text-[11px] text-fg-faint">
              <span className="inline-flex items-center gap-1 rounded border border-border-soft bg-bg-alt px-2 py-1">
                <Gamepad2 size={12} />
                专家：{settings.gameFeatures.gameExperts ? '开启' : '关闭'}
              </span>
            </div>
          </div>

          <GameExpertSettingsPanel
            locale={locale}
            settings={gameExpertSettings}
            setSettings={setGameExpertSettings}
            embedded
          />
        </div>
      );
    }

    if (tab === 'commands') {
      return <ProjectCommandsSettings />;
    }

    if (tab === 'mcp') {
      return (
        <div className="grid gap-4">
          {isUnrealProject ? (
            <UnrealMcpQuickSetup
              busy={ueSetupBusy}
              step={ueSetupStep}
              result={ueSetupResult}
              error={ueSetupError}
              onRun={setupUnrealMcp}
              onOpenFile={(path) => void openLocalPath(path, { reveal: true })}
            />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ToggleRow
              label="启用项目 MCP"
              checked={settings.mcp.enabled}
              onChange={(checked) => updateMcp({ enabled: checked })}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyRecommended}
                disabled={!scan || scan.suggestedMcpServers.length === 0 || saving}
                className="rounded-md border border-border bg-bg-alt px-3 py-1.5 text-xs text-fg-dim hover:border-accent hover:text-fg disabled:opacity-50"
              >
                应用推荐配置
              </button>
              <button
                type="button"
                onClick={addCustomServer}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-alt px-3 py-1.5 text-xs text-fg-dim hover:border-accent hover:text-fg"
              >
                <Plus size={13} />
                新增
              </button>
            </div>
          </div>

          <div className="grid gap-3">
            {settings.mcp.servers.length === 0 ? (
              <div className="rounded-md border border-border-soft bg-bg-alt p-4 text-sm text-fg-faint">
                当前项目未配置 MCP。
              </div>
            ) : (
              settings.mcp.servers.map((server) => {
                const commandId = fieldId('mcp-command', server.id);
                const argsId = fieldId('mcp-args', server.id);
                return (
                  <section
                    key={server.id}
                    className="grid gap-3 rounded-md border border-border bg-panel-2 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={server.enabled}
                          onChange={(event) =>
                            updateServer(server.id, {
                              enabled: event.currentTarget.checked,
                            })
                          }
                          className="h-4 w-4 shrink-0 accent-accent"
                        />
                        <span className="truncate text-sm font-semibold text-fg">
                          {server.label}
                        </span>
                      </label>
                      <div className="flex items-center gap-2">
                        <ProbeBadge result={server.lastProbe} />
                        <button
                          type="button"
                          title="删除"
                          aria-label="删除"
                          onClick={() => removeServer(server.id)}
                          className="flex h-7 w-7 items-center justify-center rounded border border-border-soft bg-bg-alt text-fg-faint hover:border-red-400 hover:text-red-300"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    {server.description ? (
                      <div className="text-xs text-fg-faint">{server.description}</div>
                    ) : null}
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                      <SettingsRow label="命令">
                        <input
                          id={commandId}
                          value={server.command ?? ''}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateServer(server.id, { command: event.currentTarget.value })
                          }
                          className="w-full rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-xs text-fg outline-none focus:border-accent"
                        />
                      </SettingsRow>
                      <SettingsRow label="参数" hint="空格分隔；工作区可用 {workspace}">
                        <input
                          id={argsId}
                          value={server.args.join(' ')}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateServer(server.id, {
                              args: event.currentTarget.value
                                .split(' ')
                                .map((item) => item.trim())
                                .filter(Boolean),
                            })
                          }
                          className="w-full rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-xs text-fg outline-none focus:border-accent"
                        />
                      </SettingsRow>
                    </div>
                    <div className="text-[11px] text-fg-faint">
                      最近探测：{formatTime(server.lastProbe?.checkedAtMs)}
                      {server.lastProbe ? ` · ${server.lastProbe.message}` : ''}
                    </div>
                  </section>
                );
              })
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={probeEnabledServers}
              disabled={probing || saving}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-alt px-3 py-1.5 text-xs text-fg-dim hover:border-accent hover:text-fg disabled:opacity-50"
            >
              <Terminal size={13} />
              {probing ? '探测中...' : '探测已启用 MCP'}
            </button>
          </div>
        </div>
      );
    }

    if (tab === 'skills') {
      const enabledRootIds = new Set(settings.skills.enabledRootIds);
      return (
        <div className="grid gap-4">
          <div className="grid gap-3">
            {(scan?.skillRoots ?? []).map((root) => (
              <section
                key={root.id}
                className="rounded-md border border-border bg-panel-2 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex min-w-0 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={enabledRootIds.has(root.id)}
                      onChange={(event) => {
                        const next = new Set(enabledRootIds);
                        if (event.currentTarget.checked) next.add(root.id);
                        else next.delete(root.id);
                        updateSkills({ enabledRootIds: [...next] });
                      }}
                      className="h-4 w-4 accent-accent"
                    />
                    <span className="text-sm font-semibold text-fg">{root.label}</span>
                  </label>
                  <span
                    className={cn(
                      'rounded border px-2 py-0.5 text-[11px]',
                      root.exists
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-border-soft bg-bg-alt text-fg-faint',
                    )}
                  >
                    {root.exists ? `${root.skillCount} 个` : '未创建'}
                  </span>
                </div>
                <div className="mt-2 truncate font-mono text-[11px] text-fg-faint" title={root.path}>
                  {root.path}
                </div>
                {root.skills.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {root.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded border border-border-soft bg-bg-alt px-2 py-0.5 text-[11px] text-fg-dim"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
          <div className="rounded-md border border-border-soft bg-bg-alt p-3 text-xs text-fg-faint">
            当前引擎：{scan?.engine.label ?? '未识别'}；推荐 Skill 会跟随项目配置保存。
          </div>
        </div>
      );
    }

    return (
      <div className="grid gap-3">
        <ToggleRow
          label="自动检测项目类型"
          checked={settings.automation.autoDetect}
          onChange={(checked) => updateAutomation({ autoDetect: checked })}
        />
        <ToggleRow
          label="自动写入推荐 MCP 配置"
          hint="只写项目配置，不安装第三方依赖。"
          checked={settings.automation.autoConfigureRecommendedMcp}
          onChange={(checked) =>
            updateAutomation({ autoConfigureRecommendedMcp: checked })
          }
        />
        <ToggleRow
          label="允许自动启动项目 MCP"
          checked={settings.automation.autoStartMcp}
          onChange={(checked) => updateAutomation({ autoStartMcp: checked })}
        />
        <ToggleRow
          label="允许第三方依赖安装"
          hint="涉及 npm、uvx、插件安装时仍需确认。"
          checked={settings.automation.allowThirdPartyInstall}
          onChange={(checked) =>
            updateAutomation({ allowThirdPartyInstall: checked })
          }
        />
      </div>
    );
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-settings-title"
        className="flex h-[calc(100vh-2.5rem)] w-[calc(100vw-2.5rem)] max-w-[1600px] max-h-[1000px] flex-col overflow-hidden rounded-lg border border-border bg-panel shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-border-soft bg-bg-alt px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-bg">
              <SettingsIcon size={18} strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="project-settings-title" className="truncate text-base font-semibold text-fg">
                项目设置 · {record?.name ?? workspace.name}
              </h2>
              <p className="mt-1 truncate text-xs text-fg-faint" title={workspacePath}>
                {workspacePath || '未指定工作区'}
              </p>
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              title="重新检测"
              aria-label="重新检测"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-panel-2 text-fg-faint transition-colors hover:border-accent hover:text-fg disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="关闭"
              aria-label="关闭"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-panel-2 text-fg-faint transition-colors hover:border-accent hover:text-fg"
            >
              <X size={15} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex flex-1 flex-col bg-border-soft sm:flex-row">
          <nav className="w-full shrink-0 overflow-y-auto border-b border-border-soft bg-bg-alt p-3 sm:w-56 sm:border-b-0 sm:border-r">
            <div role="tablist" aria-orientation="vertical" className="grid gap-1">
              {visibleTabs.map((item) => {
                const active = item.id === tab;
                const Icon = item.Icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(item.id)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left text-sm font-medium transition-colors',
                      active
                        ? 'border-accent bg-accent/15 text-fg'
                        : 'border-transparent text-fg-dim hover:bg-border-soft hover:text-fg',
                    )}
                  >
                    <Icon size={15} className={active ? 'text-accent' : 'text-fg-faint'} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <main className="min-h-0 flex-1 overflow-y-auto bg-panel px-6 py-5 md:px-8 md:py-7">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-fg-faint">
                检测中...
              </div>
            ) : (
              <div className="w-full max-w-[1180px]">{content}</div>
            )}
          </main>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-soft bg-bg-alt px-5 py-3">
          <div className="min-w-0 flex-1 truncate text-xs text-fg-faint">
            {status ?? (dirty ? '有未保存修改' : '配置已同步')}
          </div>
          <div className="flex flex-wrap gap-2">
            {workspacePath ? (
              <button
                type="button"
                onClick={() => void openLocalPath(workspacePath, { reveal: true })}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-fg-dim hover:border-accent hover:text-fg"
              >
                <FileText size={13} />
                打开位置
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void persistSettings(settings)}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 rounded-md border border-accent bg-accent/15 px-3 py-1.5 text-xs font-semibold text-fg hover:bg-accent/25 disabled:border-border disabled:bg-panel-2 disabled:text-fg-faint"
            >
              <Check size={13} />
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
