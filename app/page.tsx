"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type LyricCue = {
  start: number;
  end: number;
  text: string;
};

type RawCue = {
  time: number;
  text: string;
};

type ParsedLrc = {
  cues: LyricCue[];
  offsetSeconds: number;
};

const GLOBAL_SYNC_SHIFT = 0;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00";
  }

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function rawToCues(raw: RawCue[]): LyricCue[] {
  const ordered = [...raw].sort((a, b) => a.time - b.time);
  return ordered.map((line, index) => ({
    start: line.time,
    end: index < ordered.length - 1 ? ordered[index + 1].time : Number.POSITIVE_INFINITY,
    text: line.text,
  }));
}

function parseLrc(content: string): ParsedLrc {
  const normalized = content.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/);
  const raw: RawCue[] = [];
  let offsetSeconds = 0;

  const stampRegex = /\[(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?\]/g;
  const offsetRegex = /^\[offset:([+-]?\d+)\]\s*$/i;

  for (const line of lines) {
    const trimmed = line.trim();
    const offsetMatch = trimmed.match(offsetRegex);

    if (offsetMatch) {
      const offsetMillis = Number(offsetMatch[1] ?? "0");
      if (Number.isFinite(offsetMillis)) {
        offsetSeconds = offsetMillis / 1000;
      }
      continue;
    }

    const text = line.replace(stampRegex, "").trim();
    stampRegex.lastIndex = 0;

    const matches = [...line.matchAll(stampRegex)];
    for (const match of matches) {
      const mins = Number(match[1] ?? "0");
      const secs = Number(match[2] ?? "0");
      const fracRaw = match[3] ?? "0";
      const frac = Number(`0.${fracRaw.padEnd(3, "0")}`);
      const time = mins * 60 + secs + frac;

      if (text) {
        raw.push({ time, text });
      }
    }
  }

  return { cues: rawToCues(raw), offsetSeconds };
}

export default function Home() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [hasStarted, setHasStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioStatus, setAudioStatus] = useState<"loading" | "ready" | "error">("loading");
  const [hasEnded, setHasEnded] = useState(false);

  const [lyrics, setLyrics] = useState<LyricCue[]>([]);
  const [lyricsStatus, setLyricsStatus] = useState<"loading" | "ready" | "empty" | "error">(
    "loading"
  );
  const [lrcOffset, setLrcOffset] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadLyrics = async () => {
      setLyricsStatus("loading");

      try {
        const response = await fetch("/jigsaw.lrc", { cache: "no-store" });
        if (!response.ok) {
          if (isMounted) {
            setLyrics([]);
            setLrcOffset(0);
            setLyricsStatus("error");
          }
          return;
        }

        const text = await response.text();
        const parsed = parseLrc(text);

        if (!isMounted) {
          return;
        }

        setLyrics(parsed.cues);
        setLrcOffset(parsed.offsetSeconds);
        setLyricsStatus(parsed.cues.length > 0 ? "ready" : "empty");
      } catch {
        if (isMounted) {
          setLyrics([]);
          setLrcOffset(0);
          setLyricsStatus("error");
        }
      }
    };

    loadLyrics();

    return () => {
      isMounted = false;
    };
  }, []);

  const syncedTime = Math.max(0, currentTime + GLOBAL_SYNC_SHIFT + lrcOffset);

  const activeCue = useMemo(() => {
    if (lyrics.length === 0) {
      return null;
    }

    for (let i = lyrics.length - 1; i >= 0; i -= 1) {
      if (syncedTime >= lyrics[i].start && syncedTime < lyrics[i].end) {
        return lyrics[i];
      }
    }

    return null;
  }, [lyrics, syncedTime]);

  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    try {
      if (audio.paused) {
        if (hasEnded) {
          audio.currentTime = 0;
          setCurrentTime(0);
          setHasEnded(false);
        }

        await audio.play();
        setHasStarted(true);
      } else {
        audio.pause();
      }
    } catch (error) {
      setAudioStatus("error");
      console.error("Ses başlatılamadı:", error);
    }
  };

  const restartSong = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.currentTime = 0;
    setCurrentTime(0);
    setHasEnded(false);

    if (hasStarted) {
      try {
        await audio.play();
      } catch (error) {
        console.error("Ses yeniden başlatılamadı:", error);
      }
    }
  };

  return (
    <main className={`love-page ${hasStarted ? "started" : "intro"}`}>
      <div className="ambient ambient-one" aria-hidden />
      <div className="ambient ambient-two" aria-hidden />
      <div className="ambient ambient-three" aria-hidden />

      <audio
        ref={audioRef}
        src="/jigsaw.mp3"
        preload="auto"
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration);
          setAudioStatus("ready");
        }}
        onCanPlay={() => setAudioStatus("ready")}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => {
          setIsPlaying(true);
          setHasStarted(true);
        }}
        onPause={() => {
          if (!hasEnded) {
            setIsPlaying(false);
          }
        }}
        onEnded={() => {
          setHasEnded(true);
          setIsPlaying(false);
        }}
        onError={() => setAudioStatus("error")}
      />

      <section className="stage-shell">
        <header className="hero-head">
          <p className="kicker">Everything For u Babe</p>
          <h1>For the most beautiful girl in the world, the most beautiful song in the world.</h1>
          <p>i am so happy and lucky to be with you</p>
        </header>

        <div className="lyrics-card">
          <div className="status-row">
            <span className="badge">{isPlaying ? "Canlı" : "Beklemede"}</span>
            <span>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="lyrics-stage" role="status" aria-live="polite">
            <h2 className="current-line">{lyricsStatus === "ready" ? activeCue?.text ?? "" : ""}</h2>
          </div>

          <div className="timeline-wrap" aria-hidden>
            <div className="timeline-track">
              <span className="timeline-progress" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="controls">
            <button type="button" className="main-button" onClick={togglePlayback}>
              {isPlaying ? "Duraklat" : hasEnded ? "Tekrar Oynat" : "Çal"}
            </button>
            <button type="button" className="soft-button" onClick={restartSong}>
              Başa Sar
            </button>
          </div>

          {lyricsStatus === "loading" && (
            <p className="error-text">Söz dosyası yükleniyor...</p>
          )}

          {lyricsStatus === "empty" && (
            <p className="error-text">
              `public/jigsaw.lrc` içinde zaman kodlu satır bulunamadı.
            </p>
          )}

          {lyricsStatus === "error" && (
            <p className="error-text">`public/jigsaw.lrc` dosyası okunamadı.</p>
          )}

          {audioStatus === "error" && (
            <p className="error-text">Ses dosyası açılamadı. `public/jigsaw.mp3` yolunu kontrol et.</p>
          )}
        </div>
      </section>

      {!hasStarted && (
        <div className="intro-overlay" role="dialog" aria-live="polite">
          <div className="intro-panel">
            <p className="intro-kicker">With you, every night and morning is possible...</p>
            <h2>For the most beautiful girl in the world.</h2>
            <p>Will you press the button, my dear?</p>
            <button type="button" className="main-button" onClick={togglePlayback}>
              {audioStatus === "ready" ? "Start" : "Preparing..."}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
