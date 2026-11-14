import type { Camera } from "../../hooks/useCamera";

interface Props {
  camera: Camera;
  /** Normalized face boxes [x, y, w, h] to outline (from recognition). */
  boxes?: [number, number, number, number][];
  boxColor?: string;
  /** Normalized landmark points to draw (from MediaPipe). */
  landmarks?: [number, number][];
  className?: string;
  scanning?: boolean;
  label?: string;
}

/** Mirrored live webcam with optional detection overlays (SVG, in normalized coordinates). */
export function CameraView({ camera, boxes = [], boxColor = "#5ee7ff", landmarks = [], className = "", scanning, label }: Props) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-line bg-black ${className}`}>
      <video ref={camera.attach} className="h-full w-full -scale-x-100 object-cover" muted playsInline aria-label="Live camera" />
      <svg className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100" viewBox="0 0 1 1" preserveAspectRatio="none">
        {boxes.map((b, i) => (
          <rect key={i} x={b[0]} y={b[1]} width={b[2]} height={b[3]} fill="none" stroke={boxColor} strokeWidth={0.004} rx={0.01} />
        ))}
        {landmarks.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={0.0035} fill="#5ee7ff" opacity={0.85} />
        ))}
      </svg>
      {scanning && <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 animate-scan bg-gradient-to-b from-transparent via-cyan-glow/15 to-transparent" />}
      {camera.state !== "on" && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-ink-muted">
          {camera.state === "requesting" ? "Requesting camera…" : camera.error ?? "Camera off"}
        </div>
      )}
      {label && <div className="label absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1">{label}</div>}
    </div>
  );
}
