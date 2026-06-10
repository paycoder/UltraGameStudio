/**
 * CONTRACT: the in-app Game Producer orchestration layer.
 *
 * 制作人(Producer)在这里从"专家人格之一"升级为"总控/编排器"。它不参与
 * `gameExperts.ts` 的 persona 融合，而是负责一个可移植、纯 TS 的编排循环：
 *
 *   需求 → [拆解] 选管线模板 + 派 owner + 标依赖/验收
 *        → [调度] 无依赖并行、有依赖等上游产物(可对接 runtime/ DAG 引擎)
 *        → [执行] 每个任务用对应专家视角单独跑
 *        → [验收] QA/Producer 视角对标客观验收标准
 *        → [回退] 不过则 rework(限次)；过则进入下一阶段
 *        → [汇总] 制作人汇总交付
 *
 * 不依赖 OMC、不依赖任何 OS 级 hook。流程里的"hook"是应用内生命周期拦截点
 * (见 ProducerHook)，可移植、随 app 走。
 */
import {
  GAME_EXPERTS,
  type GameAssetChannels,
  type GameExpertDefinition,
  type GameExpertSettings,
} from './gameExperts';

/** 游戏制作管线阶段（与真实团队的预生产→生产→里程碑对齐）。 */
export type ProducerStageId =
  | 'concept' // 概念/需求拆解
  | 'prototype' // 原型与可玩验证
  | 'design' // 设计定稿
  | 'art' // 美术（原画→建模→特效）
  | 'audio' // 音频（可与美术并行）
  | 'engineering' // 程序整合
  | 'content' // 关卡/内容填充
  | 'qa'; // 验收与测试

export interface ProducerStage {
  id: ProducerStageId;
  label: string;
  /** 该阶段默认归属的专家 id（按现有 GAME_EXPERTS 目录）。 */
  defaultOwners: string[];
  /** 依赖的上游阶段；为空表示可立即开始。 */
  dependsOn: ProducerStageId[];
}

export interface PipelineTemplate {
  id: string;
  label: string;
  summary: string;
  stages: ProducerStage[];
}

/** 单个被编排的任务节点（制作人拆解的产物）。 */
export interface ProducerTask {
  id: string;
  stage: ProducerStageId;
  title: string;
  /** 负责该任务的专家 id（人力池来自 GAME_EXPERTS）。 */
  ownerExpertId: string;
  /** 依赖的上游任务 id；空数组=可立即执行。 */
  dependsOn: string[];
  /** 客观验收标准——没有它验收会变成空话。 */
  acceptance: string[];
  status: 'pending' | 'running' | 'review' | 'done' | 'failed';
  /** 已重做次数，受 rework 上限约束。 */
  reworkCount: number;
}

export interface ProducerPlan {
  template: PipelineTemplate;
  tasks: ProducerTask[];
}

/**
 * 应用内生命周期 hook（不是 OMC/OS 级 hook）。制作人在编排循环的关键节点
 * 触发这些回调，宿主可借此插入规则：人工 checkpoint、素材渠道推荐、日志、
 * 验收加严等。全部纯 TS，随 app 走，换电脑不丢。
 */
export interface ProducerHooks {
  /** 拆解出计划后、开始调度前。可在此校验/改写计划。 */
  onPlanReady?: (plan: ProducerPlan) => ProducerPlan | void;
  /** 某任务即将执行。返回 false 可拦截（如等待人工 checkpoint）。 */
  beforeTask?: (task: ProducerTask, plan: ProducerPlan) => boolean | void;
  /** 某任务产出后、验收前。 */
  afterTask?: (task: ProducerTask, output: string) => void;
  /** 验收判定后（pass/fail）。返回 false 可强制打回重做。 */
  onReview?: (task: ProducerTask, passed: boolean) => boolean | void;
  /** 阶段切换。 */
  onStageEnter?: (stage: ProducerStageId, plan: ProducerPlan) => void;
  /** 全部完成、制作人汇总前。 */
  onComplete?: (plan: ProducerPlan) => void;
}

/** 默认 rework 上限，超过则任务判 failed（对应 OMC 的 fix-loop bound）。 */
export const PRODUCER_MAX_REWORK = 2;

/**
 * 固化的游戏管线模板。这是稳定性的关键：不指望模型即兴拆解，而是给制作人
 * 几套现实团队验证过的流程剧本，它据此选模板再微调 owner/验收。
 */
export const PRODUCER_PIPELINES: PipelineTemplate[] = [
  {
    id: 'full-game',
    label: '完整游戏开发',
    summary: '从概念到可发布的全流程，含预生产、生产、里程碑验收。',
    stages: [
      {
        id: 'concept',
        label: '概念与需求拆解',
        defaultOwners: ['producer', 'creative-director'],
        dependsOn: [],
      },
      {
        id: 'prototype',
        label: '原型与可玩验证',
        defaultOwners: ['prototyper', 'game-designer'],
        dependsOn: ['concept'],
      },
      {
        id: 'design',
        label: '设计定稿',
        defaultOwners: ['game-designer', 'systems-designer', 'level-designer'],
        dependsOn: ['prototype'],
      },
      {
        id: 'art',
        label: '美术（原画→建模→特效）',
        defaultOwners: ['art-director', 'technical-artist', 'visual-effects-artist'],
        dependsOn: ['design'],
      },
      {
        id: 'audio',
        label: '音频（与美术并行）',
        defaultOwners: ['audio-director', 'sound-designer'],
        dependsOn: ['design'],
      },
      {
        id: 'engineering',
        label: '程序整合',
        defaultOwners: ['lead-programmer', 'gameplay-programmer'],
        dependsOn: ['art', 'audio'],
      },
      {
        id: 'content',
        label: '关卡与内容填充',
        defaultOwners: ['level-designer', 'world-builder'],
        dependsOn: ['engineering'],
      },
      {
        id: 'qa',
        label: '验收与测试',
        defaultOwners: ['qa-lead', 'qa-tester'],
        dependsOn: ['content'],
      },
    ],
  },
  {
    id: 'prototype-only',
    label: '新玩法原型',
    summary: '只验证一个核心玩法假设是否有趣，快速垂直切片。',
    stages: [
      {
        id: 'concept',
        label: '玩法假设拆解',
        defaultOwners: ['game-designer'],
        dependsOn: [],
      },
      {
        id: 'prototype',
        label: '可玩原型',
        defaultOwners: ['prototyper', 'gameplay-programmer'],
        dependsOn: ['concept'],
      },
      {
        id: 'qa',
        label: '手感验证',
        defaultOwners: ['qa-tester', 'game-designer'],
        dependsOn: ['prototype'],
      },
    ],
  },
  {
    id: 'asset-pipeline',
    label: '美术资产管线',
    summary: '从设定到原画到 3D 模型到音频的资产产出流程。',
    stages: [
      {
        id: 'design',
        label: '资产设定',
        defaultOwners: ['art-director', 'game-designer'],
        dependsOn: [],
      },
      {
        id: 'art',
        label: '原画与建模',
        defaultOwners: ['art-director', 'technical-artist'],
        dependsOn: ['design'],
      },
      {
        id: 'audio',
        label: '配套音频',
        defaultOwners: ['audio-director', 'sound-designer'],
        dependsOn: ['design'],
      },
      {
        id: 'qa',
        label: '资产验收',
        defaultOwners: ['qa-lead'],
        dependsOn: ['art', 'audio'],
      },
    ],
  },
];

const EXPERT_BY_ID = new Map<string, GameExpertDefinition>(
  GAME_EXPERTS.map((expert) => [expert.id, expert]),
);

/** 按需求关键词选最合适的管线模板（兜底用 full-game）。 */
export function selectPipeline(input: string): PipelineTemplate {
  const text = input.toLowerCase();
  const wantsPrototype = /原型|prototype|手感|poc|垂直切片|可玩验证/.test(text);
  const wantsAsset =
    /美术|原画|建模|贴图|资产|asset|texture|音效|配套音/.test(text);
  const wantsFullExplicit = /完整|上线|发布|完整的|whole|full game/.test(text);
  const wantsGame = /游戏|game|开发一(个|款)|做(一)?(个|款)/.test(text);

  // 显式"完整/发布"最强；其次原型、资产这类窄意图优先于泛化的"做个游戏"。
  if (wantsFullExplicit) return PRODUCER_PIPELINES[0];
  if (wantsPrototype)
    return (
      PRODUCER_PIPELINES.find((p) => p.id === 'prototype-only') ??
      PRODUCER_PIPELINES[0]
    );
  if (wantsAsset)
    return (
      PRODUCER_PIPELINES.find((p) => p.id === 'asset-pipeline') ??
      PRODUCER_PIPELINES[0]
    );
  if (wantsGame) return PRODUCER_PIPELINES[0];
  return PRODUCER_PIPELINES[0];
}

/**
 * 把模板展开成任务 DAG：每个阶段为每个默认 owner 生成一个任务，任务依赖映射
 * 自上游阶段的全部任务。验收标准由 owner 专家的 boundaries/guidance 派生，
 * 保证"验收标准来自该角色的真实关注点"。
 */
export function buildPlan(input: string, template?: PipelineTemplate): ProducerPlan {
  const tpl = template ?? selectPipeline(input);
  const stageTaskIds = new Map<ProducerStageId, string[]>();
  const tasks: ProducerTask[] = [];

  for (const stage of tpl.stages) {
    const owners = stage.defaultOwners.filter((id) => EXPERT_BY_ID.has(id));
    const upstreamTaskIds = stage.dependsOn.flatMap(
      (dep) => stageTaskIds.get(dep) ?? [],
    );
    const idsForStage: string[] = [];

    owners.forEach((ownerId, idx) => {
      const expert = EXPERT_BY_ID.get(ownerId)!;
      const taskId = `${stage.id}-${idx + 1}`;
      idsForStage.push(taskId);
      tasks.push({
        id: taskId,
        stage: stage.id,
        title: `${stage.label} · ${expert.name}`,
        ownerExpertId: ownerId,
        dependsOn: upstreamTaskIds,
        acceptance: deriveAcceptance(expert),
        status: 'pending',
        reworkCount: 0,
      });
    });
    stageTaskIds.set(stage.id, idsForStage);
  }

  return { template: tpl, tasks };
}

/** 验收标准取自专家的 guidance（要做到的）+ boundaries（不能越界的）。 */
function deriveAcceptance(expert: GameExpertDefinition): string[] {
  const out = [...expert.guidance.slice(0, 2)];
  if (expert.boundaries[0]) out.push(`守住边界：${expert.boundaries[0]}`);
  return out;
}

/**
 * 返回当前可执行的任务（依赖全部 done）。可直接喂给 runtime/ 的并发泵做真并行，
 * 也可在单模型串行编排里按此顺序逐个执行。
 */
export function readyTasks(plan: ProducerPlan): ProducerTask[] {
  const done = new Set(
    plan.tasks.filter((t) => t.status === 'done').map((t) => t.id),
  );
  return plan.tasks.filter(
    (t) =>
      t.status === 'pending' && t.dependsOn.every((dep) => done.has(dep)),
  );
}

/**
 * 制作人总控 system prompt。它把制作人定位成"协调者"而非"创作者"，并把固化的
 * 任务 DAG + 验收标准 + 可用素材渠道一并交给模型，使其能按计划自我推进。
 *
 * 这是"单模型串行编排"路径的核心：制作人在一次会话里主持拆解→逐任务执行→
 * 验收→回退。要升级到真并行，把 readyTasks() 喂给 runtime/ 的并发泵即可，
 * 这段 prompt 仍作为每个子任务的角色注入。
 */
export function buildProducerPrompt(
  input: string,
  settings: GameExpertSettings,
  channels?: GameAssetChannels,
  options: { force?: boolean } = {},
): string {
  if (!options.force && !settings.enabled) return '';
  const plan = buildPlan(input);
  const { template, tasks } = plan;

  const stageLines = template.stages.map((stage) => {
    const stageTasks = tasks.filter((t) => t.stage === stage.id);
    const owners = stageTasks
      .map((t) => EXPERT_BY_ID.get(t.ownerExpertId)?.name ?? t.ownerExpertId)
      .join(' / ');
    const deps =
      stage.dependsOn.length > 0 ? `（依赖：${stage.dependsOn.join('、')}）` : '（可立即开始）';
    return `· ${stage.label}${deps} — 负责：${owners}`;
  });

  const channelLines: string[] = [];
  if (channels?.image)
    channelLines.push('· 需要原画/图标/贴图/UI 草图时，产出图片提示词并建议用户用 /image。');
  if (channels?.music)
    channelLines.push('· 需要 BGM/音效/环境音时，产出音乐提示词并建议用户用 /music。');
  if (channels?.threeD)
    channelLines.push('· 需要 3D 道具/角色/场景网格时，产出建模提示词并建议用户用 /mesh-mode-start。');

  return [
    '',
    '【游戏制作人总控】',
    `已开启。你现在是项目总控(Producer)，负责协调，不亲自做创意拍板——创意交对应总监，技术可行性交技术总监。`,
    `当前需求自动选用管线模板：${template.label}（${template.summary}）`,
    // 强制输出要求：无论底层是 Claude/Codex/Gemini，都必须先亮明制作人身份与管线，
    // 否则像 Codex 这类自带强 system prompt 的编码 agent 会忽略本段、直接动手建工程
    // 而不体现总控编排。把"可见性"从模型自觉变成硬性格式要求，确保跨模型一致。
    `【必须输出】回复的第一行先写一条总控播报：「🎬 游戏制作人总控 · 管线：${template.label} · 阶段：${template.stages.map((s) => s.label).join(' → ')}」，再开始正文。这是强制格式，不可省略。`,
    '按以下阶段推进，遵守依赖顺序；无依赖的阶段可并行，有依赖的必须等上游产出再开始：',
    ...stageLines,
    '',
    '执行规则：',
    '1. 先拆解：把需求落到每个阶段的具体子任务，标清 owner 和验收标准。',
    '2. 按依赖调度：上游产物（设计文档/原画/模型/音频）是下游的真实输入，不要凭空想象。',
    '3. 每个子任务用对应专家视角产出，再用 QA/制作人视角对照验收标准检查。',
    `4. 不达标则打回重做，单任务最多重做 ${PRODUCER_MAX_REWORK} 次；超限标记阻塞并说明原因。`,
    '5. 创意方向（玩法/美术风格）产出草案后请用户拍板，不要全自动越权决定。',
    '6. 全部通过后由制作人汇总交付物与剩余风险。',
    ...(channelLines.length > 0
      ? ['', '【可用素材渠道】在对应阶段主动推荐，附可直接使用的提示词：', ...channelLines]
      : []),
    '你可以并且应当说明自己正以制作人总控身份按计划主持各专家视角的协作；只是不要谎称真的在后台并行启动了多个独立智能体或外部进程。',
  ].join('\n');
}

/**
 * 运行 hook 的薄封装，供宿主在串行/并行编排循环里复用，确保 hook 语义一致。
 */
export function applyPlanHook(plan: ProducerPlan, hooks?: ProducerHooks): ProducerPlan {
  const next = hooks?.onPlanReady?.(plan);
  return next ?? plan;
}

/**
 * 是否启用制作人总控（方案 A）。仅当需求像"完整游戏/多阶段编排"时才接管，
 * 其余窄问题仍走 gameExperts 的专家人格融合。判据：出现"做/设计一个游戏"这类
 * 整体建造意图，或显式提到完整/上线/发布，或同时涉及多个制作领域。
 */
export function shouldUseProducer(input: string): boolean {
  const text = input.toLowerCase();
  const buildIntent =
    /(设计|做|开发|搭建|制作|build|make|create).{0,16}(游戏|game)/.test(text);
  const fullIntent = /完整|上线|发布|full game|whole game/.test(text);
  const assetIntent = /原画|建模|资产|asset|texture|音效|配套音/.test(text);
  const prototypeIntent = /原型|prototype|垂直切片|可玩验证/.test(text);

  // 命中多个制作领域（玩法/美术/音频/程序/关卡）也算需要编排。
  const domains = [
    /玩法|gameplay|机制|mechanic/,
    /美术|art|原画|建模|model|贴图/,
    /音频|audio|音效|bgm|music/,
    /程序|代码|client|engine|引擎/,
    /关卡|level|地图|map/,
  ].filter((re) => re.test(text)).length;

  return buildIntent || fullIntent || assetIntent || prototypeIntent || domains >= 2;
}

