import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProjectSettingsModal from './ProjectSettingsModal';
import { DEFAULT_GAME_EXPERT_SETTINGS } from '@/lib/gameExperts';
import {
  scanProjectEnvironment,
  type ProjectEnvironmentScan,
} from '@/lib/tauri';
import type { WorkspaceSummary } from '@/store/history/types';
import { useStore } from '@/store/useStore';

vi.mock('@/lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tauri')>(
    '@/lib/tauri',
  );
  return {
    ...actual,
    openLocalPath: vi.fn(),
    probeProjectMcpServer: vi.fn(),
    scanProjectEnvironment: vi.fn(),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const workspace: WorkspaceSummary = {
  id: 'w_test_project_ue53',
  path: 'E:\\uug_mcp\\ue-mcp-for-all-versions\\test_project_ue53',
  name: 'test_project_ue53',
  updatedAt: 1,
  sessionCount: 0,
};

function unrealScan(): ProjectEnvironmentScan {
  return {
    rootPath: workspace.path,
    scannedAtMs: 1,
    engine: {
      engine: 'unreal',
      label: 'Unreal Engine',
      confidence: 0.95,
      markers: ['uproject'],
    },
    skillRoots: [],
    suggestedMcpServers: [],
  };
}

function unknownScan(): ProjectEnvironmentScan {
  return {
    rootPath: workspace.path,
    scannedAtMs: 1,
    engine: {
      engine: 'unknown',
      label: '未识别',
      confidence: 0,
      markers: [],
    },
    skillRoots: [],
    suggestedMcpServers: [],
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function renderProjectSettingsModal(
  scan: ProjectEnvironmentScan = unrealScan(),
): Promise<{
  container: HTMLDivElement;
  cleanup: () => Promise<void>;
}> {
  vi.mocked(scanProjectEnvironment).mockResolvedValue(scan);
  useStore.setState({
    gameExpertSettings: DEFAULT_GAME_EXPERT_SETTINGS,
  });

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(<ProjectSettingsModal workspace={workspace} onClose={vi.fn()} />);
  });
  await settle();

  return {
    container,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

afterEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('ProjectSettingsModal game project tabs', () => {
  it('splits game project capabilities into Mesh, rigging, expert, and command tabs', async () => {
    const view = await renderProjectSettingsModal();

    try {
      const tabText = Array.from(
        view.container.querySelectorAll('nav [role="tab"]'),
      ).map((tab) => tab.textContent?.trim());

      expect(tabText).toEqual([
        '概览',
        'Mesh 渠道',
        '绑定渠道',
        '游戏专家',
        '命令',
        'MCP配置',
        'Skill',
        '权限/自动化',
      ]);
      expect(tabText).not.toContain('游戏功能');
    } finally {
      await view.cleanup();
    }
  });

  it('hides all game capability tabs for non-game projects', async () => {
    const view = await renderProjectSettingsModal(unknownScan());

    try {
      const tabText = Array.from(
        view.container.querySelectorAll('nav [role="tab"]'),
      ).map((tab) => tab.textContent?.trim());

      expect(tabText).toEqual([
        '概览',
        'MCP配置',
        'Skill',
        '权限/自动化',
      ]);
      expect(tabText).not.toContain('Mesh 渠道');
      expect(tabText).not.toContain('绑定渠道');
      expect(tabText).not.toContain('游戏专家');
      expect(tabText).not.toContain('命令');
    } finally {
      await view.cleanup();
    }
  });

  it('renders game slash commands under the project command tab', async () => {
    const view = await renderProjectSettingsModal();

    try {
      const commandTab = Array.from(
        view.container.querySelectorAll('nav [role="tab"]'),
      ).find((tab) => tab.textContent?.trim() === '命令');

      await act(async () => {
        (commandTab as HTMLButtonElement).click();
      });

      const commandNames = Array.from(view.container.querySelectorAll('code')).map(
        (item) => item.textContent?.trim(),
      );
      expect(commandNames).toEqual([
        '/game',
        '/mesh-mode-start',
        '/mesh-mode-end',
      ]);
    } finally {
      await view.cleanup();
    }
  });
});
