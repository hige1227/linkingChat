import { useState, useRef, useCallback, useEffect } from 'react';

interface VoiceRecorderProps {
  onRecordComplete: (blob: Blob, durationMs: number) => void;
  onRecordCancel: () => void;
}

const MAX_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export function VoiceRecorder({ onRecordComplete, onRecordCancel }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const startTimeRef = useRef(0);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop());
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
    setDuration(0);
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const elapsed = Date.now() - startTimeRef.current;
        if (blob.size > 0 && elapsed > 500) {
          onRecordComplete(blob, elapsed);
        }
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start(100); // collect data every 100ms
      startTimeRef.current = Date.now();
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        setDuration(elapsed);
        if (elapsed >= MAX_DURATION_MS) {
          stopRecording();
        }
      }, 200);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setDuration(0);
  };

  const cancelRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
    }
    chunksRef.current = [];
    setIsRecording(false);
    setDuration(0);
    onRecordCancel();
  };

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (!isRecording) {
    return (
      <button
        className="voice-record-btn"
        onClick={startRecording}
        title="Record voice message"
        type="button"
      >
        🎤
      </button>
    );
  }

  return (
    <div className="voice-recorder-active">
      <span className="voice-recording-dot" />
      <span className="voice-duration">{formatDuration(duration)}</span>
      <button className="voice-stop-btn" onClick={stopRecording} type="button" title="Stop and send">
        ⏹
      </button>
      <button className="voice-cancel-btn" onClick={cancelRecording} type="button" title="Cancel">
        ✕
      </button>
    </div>
  );
}
