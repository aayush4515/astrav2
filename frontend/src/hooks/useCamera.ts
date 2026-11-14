import { useCallback, useEffect, useRef, useState } from "react";

export type CameraState = "off" | "requesting" | "on" | "denied" | "unavailable";

/**
 * Webcam access. Frames are grabbed to an off-screen canvas as JPEG and sent to the local backend;
 * nothing is recorded or stored by the browser.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<CameraState>("off");
  const [error, setError] = useState<string | null>(null);

  const attach = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current;
      el.play().catch(() => undefined);
    }
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      setError("Camera API not available in this browser.");
      return false;
    }
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setState("on");
      setError(null);
      return true;
    } catch (e) {
      const name = (e as DOMException)?.name;
      setState(name === "NotAllowedError" ? "denied" : "unavailable");
      setError(name === "NotAllowedError" ? "Camera permission was denied." : "No camera could be opened.");
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState("off");
  }, []);

  /** Capture the current frame as a JPEG data URL (downscaled for fast local inference). */
  const grab = useCallback((maxWidth = 640, quality = 0.8): string | null => {
    const v = videoRef.current;
    if (!v || v.readyState < 2 || !v.videoWidth) return null;
    const scale = Math.min(1, maxWidth / v.videoWidth);
    const w = Math.round(v.videoWidth * scale);
    const h = Math.round(v.videoHeight * scale);
    const c = (canvasRef.current ??= document.createElement("canvas"));
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    return c.toDataURL("image/jpeg", quality);
  }, []);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  return { attach, start, stop, grab, state, error, videoRef };
}

export type Camera = ReturnType<typeof useCamera>;
