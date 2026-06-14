import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Info,
  Lightbulb,
  MessageSquareWarning,
  OctagonAlert,
} from 'lucide-react';
import type { CalloutKind } from './lib/callout';
import { useStore } from '@/store/useStore';
import { t, type TranslationKey } from '@/lib/i18n';

const META: Record<
  CalloutKind,
  { labelKey: TranslationKey; icon: typeof Info; varName: string }
> = {
  note: { labelKey: 'callout.note', icon: Info, varName: '--accent' },
  tip: { labelKey: 'callout.tip', icon: Lightbulb, varName: '--accent-2' },
  important: { labelKey: 'callout.important', icon: MessageSquareWarning, varName: '--accent-4' },
  warning: { labelKey: 'callout.warning', icon: AlertTriangle, varName: '--status-running' },
  caution: { labelKey: 'callout.caution', icon: OctagonAlert, varName: '--status-error' },
};

/** A GitHub-style alert banner: colored left border + icon + label + body. */
export default function Callout({
  kind,
  children,
}: {
  kind: CalloutKind;
  children: ReactNode;
}) {
  const locale = useStore((s) => s.locale);
  const meta = META[kind];
  const Icon = meta.icon;
  const accent = `var(${meta.varName})`;
  return (
    <div
      className="ai-callout my-2 rounded-md border border-l-[3px] py-1.5 pl-3 pr-3 text-sm"
      style={{
        borderColor: 'var(--border)',
        borderLeftColor: accent,
        background: `color-mix(in oklab, ${accent} 7%, transparent)`,
      }}
    >
      <div
        className="mb-0.5 flex items-center gap-1.5 text-[12px] font-semibold"
        style={{ color: accent }}
      >
        <Icon size={13} />
        <span>{t(locale, meta.labelKey)}</span>
      </div>
      <div className="ai-callout__body text-fg-dim">{children}</div>
    </div>
  );
}
