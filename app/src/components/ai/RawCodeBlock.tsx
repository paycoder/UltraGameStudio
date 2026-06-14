import { useMemo, useState, type ReactNode } from 'react';
import { ChevronsDownUp, ChevronsUpDown, WrapText } from 'lucide-react';
import CopyButton from './CopyButton';
import { highlightCode } from './lib/highlight';
import { useStore } from '@/store/useStore';
import { t } from '@/lib/i18n';

/** Collapse tall code blocks past this many lines behind an expand toggle. */
const DEFAULT_MAX_LINES = 22;

export default function RawCodeBlock({
  raw,
  language,
  children,
  compact = false,
  className = '',
  maxLines = DEFAULT_MAX_LINES,
}: {
  raw: string;
  language?: string | null;
  children?: ReactNode;
  compact?: boolean;
  className?: string;
  maxLines?: number;
}) {
  const [wrap, setWrap] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const locale = useStore((s) => s.locale);
  const code = raw.replace(/\n$/, '');
  const lineCount = useMemo(() => code.split('\n').length, [code]);
  const tall = lineCount > maxLines;
  const lang = normalizeLabel(language);
  const isDiff = lang === 'diff';
  const highlighted = useMemo(
    () => (children ? null : highlightCode(code, lang)),
    [children, code, lang],
  );

  return (
    <div
      className={
        'ai-code group/code overflow-hidden border border-[var(--code-border)] ' +
        (compact ? 'ai-code--compact rounded-sm ' : 'my-2 rounded-lg ') +
        className
      }
    >
      <div className="flex items-center justify-between border-b border-[var(--code-border)] bg-[var(--code-header-bg)] px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">
          {lang ?? 'text'}
          {tall && (
            <span className="ml-2 text-fg-faint/70">{lineCount} {t(locale, 'chat.lines')}</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {tall && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              title={expanded ? t(locale, 'chat.collapse') : t(locale, 'chat.expandAll')}
              aria-label={expanded ? t(locale, 'chat.collapseCode') : t(locale, 'chat.expandCode')}
              className="inline-flex items-center rounded p-0.5 text-fg-faint transition-colors hover:text-fg"
            >
              {expanded ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setWrap((w) => !w)}
            title={wrap ? t(locale, 'chat.wrapOff') : t(locale, 'chat.wrapOn')}
            aria-label={t(locale, 'chat.toggleWrap')}
            className={
              'inline-flex items-center rounded p-0.5 transition-colors ' +
              (wrap ? 'text-accent' : 'text-fg-faint hover:text-fg')
            }
          >
            <WrapText size={13} />
          </button>
          <CopyButton value={code} label={t(locale, 'chat.copy')} className="px-1 py-0.5" />
        </div>
      </div>
      <div
        className={
          'ai-code__scroll overflow-auto bg-[var(--code-bg)] leading-relaxed ' +
          (compact ? 'text-[11.5px] ' : 'text-[12.5px] ') +
          (wrap ? 'ai-code--wrap ' : '') +
          (isDiff ? 'ai-code--diff ' : '')
        }
        style={tall && !expanded ? { maxHeight: compact ? '16rem' : '24rem' } : undefined}
      >
        {children ?? (
          <pre>
            <code
              className={highlighted?.className}
              dangerouslySetInnerHTML={{ __html: highlighted?.html ?? escapeHtml(code) }}
            />
          </pre>
        )}
      </div>
    </div>
  );
}

function normalizeLabel(language: string | null | undefined): string | null {
  const value = language?.trim().toLowerCase();
  return value || null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
