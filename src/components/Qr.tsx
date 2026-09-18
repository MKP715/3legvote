import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

/** Renders text as a QR code image (generated locally — nothing leaves the device). */
export function QrCode({ text, size = 220, label }: { text: string; size?: number; label?: string }) {
  const [src, setSrc] = useState<string>('');
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, width: size * 2 })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(''));
    return () => {
      alive = false;
    };
  }, [text, size]);
  if (!src) return null;
  return <img className="qr" src={src} width={size} height={size} alt={label ?? 'QR code'} />;
}

/** Camera QR scanner using jsQR. Calls onResult once with the decoded text. */
export function QrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let done = false;
    const tick = () => {
      const v = video.current;
      const c = canvas.current;
      if (!done && v && c && v.readyState === v.HAVE_ENOUGH_DATA) {
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(v, 0, 0, c.width, c.height);
          const img = ctx.getImageData(0, 0, c.width, c.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code?.data) {
            done = true;
            onResult(code.data);
            return;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
          raf = requestAnimationFrame(tick);
        }
      } catch {
        setError('Could not open the camera. Allow camera access, or paste the code instead.');
      }
    })();
    return () => {
      done = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  return (
    <div className="scanner">
      {error ? <p className="warn-box">{error}</p> : <video ref={video} muted playsInline className="scanner-video" />}
      <canvas ref={canvas} hidden />
      <button className="outline secondary" onClick={onClose}>
        Close camera
      </button>
    </div>
  );
}
