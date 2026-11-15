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
export function CameraView({ camera, boxes = [], boxColor = "#2BA0FF", landmarks = [], className = "", scanning, label }: Props) {
  return (
    <div className={`relative overflow-hidden rounded-[24px] bg-ink ${className}`}>
      <video ref={camera.attach} className="h-full w-full -scale-x-100 object-cover" muted playsInline aria-label="Live camera" />
      <svg className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100" viewBox="0 0 1 1" preserveAspectRatio="none">
        {boxes.map((b, i) => (
          <rect key={i} x={b[0]} y={b[1]} width={b[2]} height={b[3]} fill="none" stroke={boxColor} strokeWidth={0.008} rx={0.02} />
        ))}
        {landmarks.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={0.0035} fill="#F5E211" opacity={0.9} />
        ))}
      </svg>
      {scanning && <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 animate-scan border-b-4 border-cap-yellow bg-cap-yellow/10" />}
      {camera.state !== "on" && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-[15px] text-water">
          {camera.state === "requesting" ? "Requesting camera…" : camera.error ?? "Camera off"}
        </div>
      )}
      {label && <div className="chip absolute left-3 top-3 bg-cap-yellow">{label}</div>}
    </div>
  );
}
