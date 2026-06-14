import { useStore } from '@/store/useStore';
import { t } from '@/lib/i18n';

export default function VideoPlayer({
  src,
  label,
}: {
  src: string;
  label?: string;
}) {
  const locale = useStore((s) => s.locale);
  return (
    <span className="ai-video-player my-2 flex w-full max-w-2xl flex-col gap-2 rounded-md border border-border bg-bg-alt p-2">
      <span className="text-xs font-medium text-fg-dim">
        {label || t(locale, 'media.video')}
      </span>
      <video
        src={src}
        controls
        preload="metadata"
        className="max-h-[420px] w-full rounded border border-border bg-black"
      />
    </span>
  );
}
