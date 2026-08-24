import { AudioLines, ChevronDown, Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/overlays.js';
import { api } from '@/lib/api.js';
import { cn } from '@/lib/utils.js';

type Phase = 'idle' | 'connecting' | 'dictating' | 'clipRecording';

function pickMimeType(): { mime: string; ext: string } {
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')) {
    return { mime: 'audio/webm', ext: 'webm' };
  }
  return { mime: 'audio/mp4', ext: 'm4a' }; // Safari
}

/**
 * The editor's one voice control. Tapping the mic starts dictation (speech
 * streams into the memo as text) — the everyday, instead-of-typing path.
 * The chevron opens the occasional path: record a voice clip that attaches
 * as audio (and gets its own transcript). On reefs without dictation set up,
 * the mic records a clip directly and the chevron disappears.
 */
export function VoiceControls({
  dictationEnabled,
  onPreview,
  onFinalText,
  onFile,
}: {
  dictationEnabled: boolean;
  /** In-flight dictated words for the current phrase ('' when quiet). */
  onPreview: (text: string) => void;
  /** A finished dictated phrase, ready to insert into the memo. */
  onFinalText: (text: string) => void;
  /** A recorded voice clip, ready to upload as an attachment. */
  onFile: (file: File) => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const deltasRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (phase !== 'clipRecording') return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const releaseMedia = () => {
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => releaseMedia, []);

  const stopDictation = () => {
    releaseMedia();
    // Words spoken but not yet finalized still belong in the memo.
    const pending = [...deltasRef.current.values()].join(' ').trim();
    deltasRef.current.clear();
    onPreview('');
    if (pending) onFinalText(pending);
    setPhase('idle');
  };

  const startDictation = async () => {
    setPhase('connecting');
    try {
      const { clientSecret } = await api<{ clientSecret: string }>(
        'POST',
        '/api/v1/dictation/session',
      );
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.addTrack(stream.getAudioTracks()[0]!);

      const channel = pc.createDataChannel('oai-events');
      channel.addEventListener('message', (event) => {
        const parsed = JSON.parse(event.data as string) as {
          type: string;
          item_id?: string;
          delta?: string;
          transcript?: string;
        };
        if (parsed.type === 'conversation.item.input_audio_transcription.delta') {
          const key = parsed.item_id ?? 'turn';
          const sofar = (deltasRef.current.get(key) ?? '') + (parsed.delta ?? '');
          deltasRef.current.set(key, sofar);
          onPreview(sofar.trim());
        } else if (parsed.type === 'conversation.item.input_audio_transcription.completed') {
          deltasRef.current.delete(parsed.item_id ?? 'turn');
          onPreview('');
          const text = (parsed.transcript ?? '').trim();
          if (text) onFinalText(text);
        }
      });
      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          stopDictation();
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const answer = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: { authorization: `Bearer ${clientSecret}`, 'content-type': 'application/sdp' },
        body: offer.sdp,
      });
      if (!answer.ok) throw new Error(`realtime call failed: ${answer.status}`);
      await pc.setRemoteDescription({ type: 'answer', sdp: await answer.text() });
      setPhase('dictating');
    } catch (error) {
      console.warn('[dictation]', error);
      stopDictation();
      alert("Couldn't start dictation — check your microphone permission and connection, then try again. 🎤");
    }
  };

  const stopClip = () => recorderRef.current?.stop();

  const startClip = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const { mime, ext } = pickMimeType();
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        releaseMedia();
        recorderRef.current = null;
        const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
        onFile(new File(chunks, `voice-memo-${stamp}.${ext}`, { type: mime }));
        setPhase('idle');
        setSeconds(0);
      };
      recorderRef.current = recorder;
      recorder.start();
      setPhase('clipRecording');
    } catch {
      alert("Couldn't reach your microphone — check the browser permission and try again. 🎤");
    }
  };

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;

  // Active states: one red button that stops whatever is running.
  if (phase === 'dictating' || phase === 'clipRecording' || phase === 'connecting') {
    const busy = phase === 'connecting';
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => (phase === 'dictating' ? stopDictation() : stopClip())}
        aria-label={phase === 'clipRecording' ? 'Stop recording' : 'Stop dictation'}
        className="flex items-center gap-1 rounded-lg bg-destructive/10 p-1.5 text-destructive"
      >
        <Square
          className={cn('size-4', !busy && 'motion-safe:animate-pulse')}
          fill="currentColor"
        />
        <span className="text-xs font-semibold tabular-nums">
          {phase === 'connecting'
            ? '…'
            : phase === 'dictating'
              ? 'listening…'
              : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}
        </span>
      </button>
    );
  }

  if (!dictationEnabled) {
    return (
      <button
        type="button"
        onClick={() => void startClip()}
        aria-label="Record a voice memo"
        className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Mic className="size-4" />
      </button>
    );
  }

  return (
    <span className="flex items-center">
      <button
        type="button"
        onClick={() => void startDictation()}
        aria-label="Dictate a memo"
        title="Dictate — tap, talk, tap again"
        className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Mic className="size-4" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="More voice options"
            className="-ml-1 rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronDown className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => void startDictation()}>
            <Mic className="size-3.5" />
            <span className="flex flex-col">
              <span>Dictate</span>
              <span className="text-[11px] text-muted-foreground">words appear as you speak</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void startClip()}>
            <AudioLines className="size-3.5" />
            <span className="flex flex-col">
              <span>Record a voice clip</span>
              <span className="text-[11px] text-muted-foreground">
                attaches the audio, transcript included
              </span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
