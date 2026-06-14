import { useEffect, useRef, useState } from 'react';
import { FastForward, Pause, Play, SkipForward } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { t } from '@/lib/i18n';

export default function AudioPlayer({
  src,
  label,
}: {
  src: string;
  label?: string;
}) {
  const locale = useStore((s) => s.locale);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setDuration(0);
    setCurrentTime(0);
  }, [src]);

  const syncTime = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
    setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  };

  const seekTo = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const max = Number.isFinite(audio.duration) ? audio.duration : duration;
    audio.currentTime = Math.max(0, Math.min(seconds, max || seconds));
    syncTime();
  };

  const fastForward = () => seekTo(currentTime + 10);

  const endPlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const end = Number.isFinite(audio.duration) ? audio.duration : duration;
    if (end > 0) audio.currentTime = end;
    audio.pause();
    setPlaying(false);
    syncTime();
  };

  return (
    <span className="ai-audio-player my-2 flex w-full max-w-xl flex-col gap-2 rounded-md border border-border bg-bg-alt p-2">
      <span className="text-xs font-medium text-fg-dim">
        {label || t(locale, 'media.audio')}
      </span>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={syncTime}
        onTimeUpdate={syncTime}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <span className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={togglePlay}
          title={playing ? t(locale, 'media.pause') : t(locale, 'media.play')}
          aria-label={playing ? t(locale, 'media.pause') : t(locale, 'media.play')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-panel-2 text-fg-dim transition-colors hover:border-accent hover:text-fg"
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button
          type="button"
          onClick={fastForward}
          title={t(locale, 'media.forward10')}
          aria-label={t(locale, 'media.forward10')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-panel-2 text-fg-dim transition-colors hover:border-accent hover:text-fg"
        >
          <FastForward size={15} />
        </button>
        <button
          type="button"
          onClick={endPlayback}
          title={t(locale, 'media.end')}
          aria-label={t(locale, 'media.end')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-panel-2 text-fg-dim transition-colors hover:border-accent hover:text-fg"
        >
          <SkipForward size={15} />
        </button>
        <span className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step="0.1"
            value={Math.min(currentTime, duration || currentTime)}
            onChange={(event) => seekTo(Number(event.currentTarget.value))}
            aria-label={t(locale, 'media.playbackProgress')}
            className="ai-audio-player__range w-full"
          />
        </span>
        <span className="shrink-0 font-mono text-[11px] text-fg-faint">
          {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
        </span>
      </span>
    </span>
  );
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}
