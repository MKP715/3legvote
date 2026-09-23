import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

/** Renders text as a QR code image (generated locally — nothing leaves the device). */
export function QrCode({ text, size = 220, label }: { text: string; size?: number; label?: string }) {
  const [src, setSrc] = useState<string>('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, width: size * 2 })
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => {
        if (alive) {
          setSrc('');
          setFailed(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [text, size]);
  if (failed) {
    return <p className="warn-box">The QR code could not be drawn on this device — use “Copy teller link” instead and send the link to the teller.</p>;
  }
  if (!src) return null;
  return <img className="qr" src={src} width={size} height={size} alt={label ?? 'QR code'} />;
}

/**
 * Camera QR scanner using jsQR. By default it reads one code and stops; in `continuous`
 * mode it keeps reading (for a registration desk), ignoring the same code for a few seconds
 * so one card is not counted twice.
 */
export function QrScanner({
  onResult,
  onClose,
  continuous = false,
  closeLabel = 'Close camera',
}: {
  onResult: (text: string) => void;
  onClose: () => void;
  continuous?: boolean;
  closeLabel?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  // Kept in a ref so an inline handler from the caller never restarts the camera.
  const handler = useRef(onResult);
  handler.current = onResult;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let done = false;
    let lastText = '';
    let lastAt = 0;
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
            if (!continuous) {
              done = true;
              handler.current(code.data);
              return;
            }
            const now = Date.now();
            if (code.data !== lastText || now - lastAt > 3000) {
              lastText = code.data;
              lastAt = now;
              handler.current(code.data);
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        // The scanner may have been closed while the permission prompt was open.
        if (done || !video.current) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        video.current.srcObject = s;
        await video.current.play();
        raf = requestAnimationFrame(tick);
      } catch {
        setError('Could not open the camera. Allow camera access, or paste the code instead.');
      }
    })();
    return () => {
      done = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [continuous]);

  return (
    <div className="scanner">
      {error ? <p className="warn-box">{error}</p> : <video ref={video} muted playsInline className="scanner-video" />}
      <canvas ref={canvas} hidden />
      <button className="outline secondary" onClick={onClose}>
        {closeLabel}
      </button>
    </div>
  );
}
