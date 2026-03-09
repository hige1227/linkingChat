import { useState, useRef, useEffect, useMemo } from 'react';

interface VoiceMessageProps {
  audioUrl: string;
  durationMs: number;
  isOwn: boolean;
}

export function VoiceMessage({ audioUrl, durationMs, isOwn }: VoiceMessageProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(durationMs / 1000);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Generate consistent random waveform bars
  const barHeights = useMemo(() => {
    const bars: number[] = [];
    let seed = 42;
    for (let i = 0; i < 30; i++) {
      seed = (seed * 16807 + 0) % 2147483647;
      bars.push(4 + (seed % 20));
    }
    return bars;
  }, []);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration && isFinite(audio.duration)) {
        setTotalDuration(audio.duration);
      }
    });

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
    });

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, [audioUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progress = totalDuration > 0 ? currentTime / totalDuration : 0;

  return (
    <div className={`voice-message ${isOwn ? 'voice-own' : 'voice-other'}`}>
      <button className="voice-play-btn" onClick={togglePlay} type="button">
        {isPlaying ? '⏸' : '▶'}
      </button>
      <div className="voice-waveform">
        {barHeights.map((h, i) => (
          <div
            key={i}
            className="voice-bar"
            style={{
              height: `${h}px`,
              backgroundColor: i / barHeights.length <= progress
                ? (isOwn ? '#2e7d32' : '#1976d2')
                : (isOwn ? '#a5d6a7' : '#bbdefb'),
            }}
          />
        ))}
      </div>
      <span className="voice-time">
        {isPlaying ? formatTime(currentTime) : formatTime(totalDuration)}
      </span>
      <input
        className="voice-seek"
        type="range"
        min={0}
        max={totalDuration}
        step={0.1}
        value={currentTime}
        onChange={handleSeek}
      />
    </div>
  );
}
