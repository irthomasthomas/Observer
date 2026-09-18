// src/utils/tutorialStreamCapture.ts
//
// A synthetic "screen" for the RecipeSplash onboarding tutorial: a canvas that draws an
// animated download progress bar and exposes it as a MediaStream via
// `canvas.captureStream()` — the exact same technique already used for the mock camera
// fallback in browserStreamCapture.ts / tauriStreamCapture.ts. StreamManager substitutes
// this stream in place of a real getDisplayMedia/native capture (see acquireMasterStream)
// whenever SensorSettings.isMcpTutorialMode() is on, so a real Observer agent watches a
// fake screen instead of the user's real one — no screen-share permission needed, and the
// MCP's tool-calling flow (capture_screen, create_agent, start_agent) runs completely
// unmodified because it just sees a normal-looking base64 frame.
//
// Purely a web-standard canvas + captureStream, so it needs no platform branching: it
// behaves identically in a browser tab and inside a Tauri webview.

const WIDTH = 960;
const HEIGHT = 540;
const FILL_MS = 20000; // 0% -> 100% once, then holds at 100% forever (no loop)

class TutorialStreamCapture {
  private rafId: number | null = null;
  private stream: MediaStream | null = null;
  private startedAt = 0;
  private clockStarted = false;
  private finishedEmitted = false;
  private finishListeners = new Set<() => void>();

  /** Fires once when the bar reaches 100% (from the live draw loop only, never a still frame). */
  onFinished(cb: () => void): () => void {
    this.finishListeners.add(cb);
    return () => { this.finishListeners.delete(cb); };
  }

  /** Idempotent — returns the existing stream if one is already running. */
  createStream(): MediaStream {
    if (this.stream) return this.stream;

    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d')!;
    this.finishedEmitted = false;

    const draw = () => {
      this.render(ctx);
      if (this.clockStarted && !this.finishedEmitted && performance.now() - this.startedAt >= FILL_MS) {
        this.finishedEmitted = true;
        this.finishListeners.forEach(cb => cb());
      }
      this.rafId = requestAnimationFrame(draw);
    };
    draw();

    this.stream = canvas.captureStream(10);
    return this.stream;
  }

  /** Starts the 0% -> 100% fill. Until called the bar holds at 0%. Idempotent. */
  startClock(): void {
    if (this.clockStarted) return;
    this.clockStarted = true;
    this.startedAt = performance.now();
  }

  /** Holds the bar at 0% again (e.g. the demo was dismissed while the stream is still alive). */
  resetClock(): void {
    this.clockStarted = false;
    this.startedAt = 0;
    this.finishedEmitted = false;
  }

  /**
   * A one-off preview frame (base64 JPEG, no `data:` prefix) for desktop's
   * `see_screen_target`, which previews a target's thumbnail before any stream is live.
   */
  captureStillFrame(): string {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d')!;
    this.render(ctx);
    return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.resetClock();
  }

  private render(ctx: CanvasRenderingContext2D): void {
    // No live stream or clock yet (e.g. a preview still) means the bar hasn't started: hold at 0%.
    const elapsed = this.stream && this.clockStarted ? performance.now() - this.startedAt : 0;
    const finished = elapsed >= FILL_MS;
    const pct = finished ? 100 : Math.round((elapsed / FILL_MS) * 100);

    // Backdrop — a plain "app window" look, not the Observer brand, so it reads as
    // "some other app on your screen" rather than part of Observer's own UI.
    ctx.fillStyle = '#1e2129';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = '#2a2e38';
    ctx.fillRect(0, 0, WIDTH, 48);
    ctx.fillStyle = '#e94b3c';
    ctx.beginPath(); ctx.arc(24, 24, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath(); ctx.arc(48, 24, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath(); ctx.arc(72, 24, 7, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#8b92a3';
    ctx.font = '600 15px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Downloader.app', WIDTH / 2, 24);

    // Label
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '600 26px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(finished ? 'Download complete' : 'A reaaaally long progress bar', WIDTH / 2, HEIGHT / 2 - 60);

    // Progress bar track
    const barW = 640, barH = 28, barX = (WIDTH - barW) / 2, barY = HEIGHT / 2 - 14;
    ctx.fillStyle = '#333844';
    this.roundRect(ctx, barX, barY, barW, barH, 14);
    ctx.fill();

    // Progress bar fill
    const fillW = Math.max(barH, (pct / 100) * barW);
    ctx.fillStyle = finished ? '#2ecc71' : '#6366f1';
    this.roundRect(ctx, barX, barY, fillW, barH, 14);
    ctx.fill();

    // Percentage
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '600 20px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`${pct}%`, WIDTH / 2, barY + barH + 40);
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const radius = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}

export const tutorialStreamCapture = new TutorialStreamCapture();
