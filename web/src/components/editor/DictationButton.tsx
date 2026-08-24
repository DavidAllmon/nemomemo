import { Loader2, Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api.js';
import { cn } from '@/lib/utils.js';

type Phase = 'idle' | 'connecting' | 'live';

interface LiveSession {
  pc: RTCPeerConnection;
  stream: MediaStream;
}

/**
 * One-tap dictation: tap, talk, tap to stop. Words stream into a live preview
 * as you speak (delta events); each finished phrase lands in the editor as
 * clean text (completed events). The browser talks straight to OpenAI over
 * WebRTC using a short-lived key minted by our server — the real API key
 * never reaches the client.
 */
export function DictationButton({
  onPreview,
  onFinalText,
}: {
  /** In-flight words for the current phrase ('' when quiet). */
  onPreview: (text: string) => void;
  /** A finished phrase, ready to insert into the memo. */
  onFinalText: (text: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const sessionRef = useRef<LiveSession | null>(null);
  const deltasRef = useRef(new Map<string, string>());

  const stop = () => {
    sessionRef.current?.pc.close();
    sessionRef.current?.stream.getTracks().forEach((track) => track.stop());
    sessionRef.current = null;
    // Words spoken but not yet finalized still belong in the memo.
    const pending = [...deltasRef.current.values()].join(' ').trim();
    deltasRef.current.clear();
    onPreview('');
    if (pending) onFinalText(pending);
    setPhase('idle');
  };

  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setPhase('connecting');
    try {
      const { clientSecret } = await api<{ clientSecret: string }>(
        'POST',
        '/api/v1/dictation/session',
      );
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const pc = new RTCPeerConnection();
      sessionRef.current = { pc, stream };
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
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') stop();
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
      setPhase('live');
    } catch (error) {
      console.warn('[dictation]', error);
      stop();
      alert("Couldn't start dictation — check your microphone permission and connection, then try again. 🎤");
    }
  };

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;

  return (
    <button
      type="button"
      disabled={phase === 'connecting'}
      onClick={() => (phase === 'live' ? stop() : void start())}
      aria-label={phase === 'live' ? 'Stop dictation' : 'Dictate a memo'}
      title={phase === 'live' ? 'Stop dictation' : 'Dictate — tap, talk, tap again'}
      className={cn(
        'flex items-center gap-1 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground',
        phase === 'live' && 'bg-destructive/10 text-destructive hover:text-destructive',
      )}
    >
      {phase === 'connecting' ? (
        <Loader2 className="size-4 animate-spin" />
      ) : phase === 'live' ? (
        <>
          <Square className="size-4 motion-safe:animate-pulse" fill="currentColor" />
          <span className="text-xs font-semibold">listening…</span>
        </>
      ) : (
        <Mic className="size-4" />
      )}
    </button>
  );
}
