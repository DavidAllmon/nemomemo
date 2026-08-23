import { Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils.js';

function pickMimeType(): { mime: string; ext: string } {
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')) {
    return { mime: 'audio/webm', ext: 'webm' };
  }
  return { mime: 'audio/mp4', ext: 'm4a' }; // Safari
}

/**
 * One-tap voice memo: records from the microphone and hands the finished clip
 * to the editor's normal upload path as an audio attachment.
 */
export function RecordButton({ onFile }: { onFile: (file: File) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  // Stop tracks if the editor unmounts mid-recording.
  useEffect(
    () => () => {
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const { mime, ext } = pickMimeType();
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
        onFile(new File(chunks, `voice-memo-${stamp}.${ext}`, { type: mime }));
        setRecording(false);
        setSeconds(0);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      alert("Couldn't reach your microphone — check the browser permission and try again. 🎤");
    }
  };

  return (
    <button
      type="button"
      onClick={() => (recording ? recorderRef.current?.stop() : void start())}
      aria-label={recording ? 'Stop recording' : 'Record a voice memo'}
      className={cn(
        'flex items-center gap-1 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground',
        recording && 'text-destructive hover:text-destructive',
      )}
    >
      {recording ? (
        <>
          <Square className="size-4 motion-safe:animate-pulse" fill="currentColor" />
          <span className="text-xs font-semibold tabular-nums">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
          </span>
        </>
      ) : (
        <Mic className="size-4" />
      )}
    </button>
  );
}
