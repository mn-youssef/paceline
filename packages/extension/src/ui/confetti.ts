import confetti from 'canvas-confetti';

const COLORS = ['#f97316', '#16a34a', '#facc15', '#38bdf8', '#e879f9'];

/** Two side cannons. canvas-confetti skips itself when the user prefers reduced motion. */
export function fireConfetti(durationMs = 1_200): void {
  const end = Date.now() + durationMs;
  const frame = () => {
    confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors: COLORS, disableForReducedMotion: true });
    confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors: COLORS, disableForReducedMotion: true });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}
