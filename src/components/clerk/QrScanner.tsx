import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, ImageUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SCAN_INTERVAL_MS = 150;
const MAX_IMAGE_SIDE = 1600;

/** Decode a QR from the camera, or from an uploaded screenshot/photo of the pass. */
export function QrScanner({ onScan, disabled }: { onScan: (text: string) => void; disabled?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function canvas() {
    canvasRef.current ??= document.createElement("canvas");
    return canvasRef.current;
  }

  function stopCamera() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  useEffect(() => stopCamera, []);

  async function startCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't access a camera. Upload a photo of the QR or type the code instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setCameraOn(true);

      let lastScan = 0;
      const loop = (t: number) => {
        frameRef.current = requestAnimationFrame(loop);
        if (t - lastScan < SCAN_INTERVAL_MS || video.readyState < video.HAVE_ENOUGH_DATA) return;
        lastScan = t;
        const result = decode(video, video.videoWidth, video.videoHeight, false);
        if (result) {
          stopCamera();
          onScan(result);
        }
      };
      frameRef.current = requestAnimationFrame(loop);
    } catch (e) {
      stopCamera();
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Camera permission was denied. Allow it in the browser, or upload a photo of the QR instead."
          : "Couldn't start the camera. Upload a photo of the QR or type the code instead.",
      );
    }
  }

  function decode(source: CanvasImageSource, width: number, height: number, thorough: boolean): string | null {
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
    const c = canvas();
    c.width = Math.round(width * scale);
    c.height = Math.round(height * scale);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, c.width, c.height);
    const image = ctx.getImageData(0, 0, c.width, c.height);
    const code = jsQR(image.data, image.width, image.height, {
      inversionAttempts: thorough ? "attemptBoth" : "dontInvert",
    });
    return code?.data || null;
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const result = decode(bitmap, bitmap.width, bitmap.height, true);
      bitmap.close();
      if (result) onScan(result);
      else setError("No QR code found in that image. Try a sharper, closer photo.");
    } catch {
      setError("Couldn't read that image.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border bg-black",
          cameraOn ? "aspect-video" : "hidden",
        )}
      >
        <video ref={videoRef} muted playsInline className="size-full object-cover" />
        <div className="pointer-events-none absolute inset-0 m-auto size-40 rounded-lg border-2 border-white/80" />
      </div>

      <div className="flex flex-wrap gap-2">
        {cameraOn ? (
          <Button type="button" variant="outline" onClick={stopCamera}>
            <CameraOff className="size-4" />
            Stop camera
          </Button>
        ) : (
          <Button type="button" onClick={startCamera} disabled={disabled}>
            <Camera className="size-4" />
            Scan with camera
          </Button>
        )}
        <Button type="button" variant="outline" asChild disabled={disabled}>
          <label className={cn("cursor-pointer", disabled && "pointer-events-none opacity-50")}>
            <ImageUp className="size-4" />
            Upload QR image
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={disabled}
              onChange={(e) => {
                void handleFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
