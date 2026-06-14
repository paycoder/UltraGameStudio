import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, FileWarning, Loader2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { t } from '@/lib/i18n';

type DocStatus =
  | { status: 'loading' }
  | { status: 'pdf'; url: string }
  | { status: 'html'; html: string }
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export default function DocumentPreview({
  base64,
  mime,
  fileName,
}: {
  base64: string;
  mime: string;
  fileName: string;
}) {
  const locale = useStore((s) => s.locale);
  const [state, setState] = useState<DocStatus>({ status: 'loading' });
  const urlRef = useRef<string | null>(null);

  const bytes = useMemo(() => {
    try {
      return base64ToBytes(base64);
    } catch {
      return null;
    }
  }, [base64]);

  useEffect(() => {
    let disposed = false;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    if (!bytes) {
      setState({ status: 'error', message: t(locale, 'doc.decodeFailed') });
      return;
    }
    setState({ status: 'loading' });

    const buffer = bytesToArrayBuffer(bytes);

    if (mime === 'application/pdf') {
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setState({ status: 'pdf', url });
    } else if (mime === DOCX_MIME) {
      void import('mammoth/mammoth.browser')
        .then(async (mammoth) => {
          const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
          if (!disposed) setState({ status: 'html', html: result.value });
        })
        .catch((err) => {
          if (!disposed) {
            setState({
              status: 'error',
              message: err instanceof Error ? err.message : String(err),
            });
          }
        });
    } else {
      setState({ status: 'unsupported' });
    }

    return () => {
      disposed = true;
    };
  }, [bytes, mime]);

  useEffect(
    () => () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    },
    [],
  );

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-fg-dim">
        <Loader2 size={16} className="animate-spin text-accent" />
        {t(locale, 'doc.rendering')}
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="max-w-md rounded-md border border-status-error/40 bg-status-error/10 p-4 text-sm leading-relaxed text-fg-dim">
          <div className="mb-2 flex items-center gap-2 font-medium text-status-error">
            <FileWarning size={16} />
            {t(locale, 'doc.cannotRender')}
          </div>
          {state.message}
        </div>
      </div>
    );
  }

  if (state.status === 'unsupported') {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="max-w-md rounded-md border border-border bg-panel-2 p-4 text-sm leading-relaxed text-fg-dim">
          <div className="mb-2 flex items-center gap-2 font-medium text-fg">
            <FileWarning size={16} />
            {t(locale, 'doc.unsupported')}
          </div>
          {locale === 'zh-CN'
            ? `该文档格式（${mime}）无法在预览器中直接渲染，请点击右上角用系统默认程序打开。`
            : `This document format (${mime}) cannot be rendered inline. Click the top-right button to open it with the default program.`}
        </div>
      </div>
    );
  }

  if (state.status === 'pdf') {
    return (
      <iframe
        title={fileName}
        src={state.url}
        className="min-h-0 flex-1 border-0 bg-white"
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-soft bg-panel px-3 py-1.5 font-mono text-[10px] text-fg-faint">
        <FileText size={12} />
        {DOCX_MIME}
      </div>
      <iframe
        title={fileName}
        sandbox=""
        srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.6;color:#1a1a1a;padding:32px 40px;max-width:820px;margin:0 auto;}img{max-width:100%;}table{border-collapse:collapse;}td,th{border:1px solid #d0d0d0;padding:4px 8px;}</style></head><body>${state.html}</body></html>`}
        className="min-h-0 flex-1 border-0 bg-white"
      />
    </div>
  );
}
