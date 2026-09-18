import { useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { ActionError } from '../store';

/* ---------------- toasts ---------------- */

interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  text: string;
}

const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));
let toastSeq = 0;

export function notify(text: string, kind: Toast['kind'] = 'info'): void {
  const id = ++toastSeq;
  useToasts.setState((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
  setTimeout(() => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 7000 : 4000);
}

/** Run a store action, turning thrown errors into a visible message. Returns true on success. */
export function attempt(fn: () => void, success?: string): boolean {
  try {
    fn();
    if (success) notify(success, 'success');
    return true;
  } catch (e) {
    notify(e instanceof ActionError || e instanceof Error ? e.message : String(e), 'error');
    return false;
  }
}

export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.slice(-3).map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* ---------------- confirm dialog ---------------- */

interface ConfirmRequest {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

const useConfirmStore = create<{ req: ConfirmRequest | null }>(() => ({ req: null }));

export function confirmAction(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.setState({ req: { ...opts, resolve } }));
}

export function ConfirmHost() {
  const req = useConfirmStore((s) => s.req);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (req && !d.open) d.showModal();
    if (!req && d.open) d.close();
  }, [req]);
  const done = (ok: boolean) => {
    req?.resolve(ok);
    useConfirmStore.setState({ req: null });
  };
  return (
    <dialog ref={ref} onCancel={(e) => (e.preventDefault(), done(false))}>
      {req && (
        <article>
          <header>
            <h3 style={{ margin: 0 }}>{req.title}</h3>
          </header>
          {req.body && <div className="confirm-body">{req.body}</div>}
          <footer>
            <div className="row-end">
              <button className="secondary outline" onClick={() => done(false)}>
                Cancel
              </button>
              <button className={req.danger ? 'danger' : ''} onClick={() => done(true)} autoFocus>
                {req.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </footer>
        </article>
      )}
    </dialog>
  );
}

/* ---------------- inputs ---------------- */

/** Non-negative integer input that tolerates an empty field while typing. */
export function NumberField(props: {
  value: number | null;
  onChange: (v: number | null) => void;
  allowNull?: boolean;
  label?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { value, onChange, allowNull, label, id, className, disabled, placeholder } = props;
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => {
    const parsed = text === '' ? null : Number(text);
    if (parsed !== value && !(parsed === null && value === 0 && !allowNull)) setText(value === null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      id={id}
      className={className}
      type="number"
      inputMode="numeric"
      min={0}
      step={1}
      aria-label={label}
      disabled={disabled}
      placeholder={placeholder ?? (allowNull ? '—' : '0')}
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t === '') onChange(allowNull ? null : 0);
        else {
          const n = Math.max(0, Math.floor(Number(t)));
          if (Number.isFinite(n)) onChange(n);
        }
      }}
    />
  );
}

export function Badge({ kind, children }: { kind: 'ok' | 'warn' | 'bad' | 'info' | 'muted'; children: ReactNode }) {
  return <span className={`badge badge-${kind}`}>{children}</span>;
}
