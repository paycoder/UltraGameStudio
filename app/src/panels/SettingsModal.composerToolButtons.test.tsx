import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBlueprint } from '@/core/defaultBlueprint';
import { loadComposerToolButtonsVisible } from '@/lib/composerStorage';
import { defaultComposer } from '@/store/sampleSessions';
import { useStore } from '@/store/useStore';
import SettingsModal from './SettingsModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

afterEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('SettingsModal composer tool buttons switch', () => {
  it('turns the composer tool buttons on and persists the choice', async () => {
    useStore.setState({
      locale: 'zh-CN',
      workflow: defaultBlueprint('wf'),
      composer: defaultComposer,
      activeWorkspaceId: null,
      activeSessionId: null,
      workspaces: [],
      composerToolButtonsVisible: false,
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(<SettingsModal onClose={vi.fn()} />);
      });

      // 默认落在「通用」页，开关文案是这一项。
      expect(container.textContent).toContain('显示输入框工具按钮');

      // 该行里唯一的 role=switch；用行内文案定位，避免依赖按钮顺序。
      // 只向上看两层（controls.tsx 的 SettingRow = 控件外层 div + 行 div），
      // 再往上就是整个「通用」页容器，会把别的行也匹配进来。
      const target = Array.from(
        container.querySelectorAll<HTMLButtonElement>('button[role="switch"]'),
      ).find((button) => {
        let el: HTMLElement | null = button.parentElement;
        for (let depth = 0; el && depth < 2; depth += 1) {
          if (el.textContent?.includes('显示输入框工具按钮')) return true;
          el = el.parentElement;
        }
        return false;
      });
      expect(target).toBeInstanceOf(HTMLButtonElement);
      expect(useStore.getState().composerToolButtonsVisible).toBe(false);
      expect(target?.getAttribute('aria-checked')).toBe('false');

      await act(async () => {
        target?.click();
      });

      expect(useStore.getState().composerToolButtonsVisible).toBe(true);
      expect(loadComposerToolButtonsVisible()).toBe(true);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
