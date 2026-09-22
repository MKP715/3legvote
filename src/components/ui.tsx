import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
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

/* ---------------- error boundary ---------------- */

/** A render error must not blank the screen in the middle of an election. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="container">
        <article className="panel">
          <h2>Something went wrong on this screen</h2>
          <p>
            Your election is still saved in this browser. Reload the page to carry on. If it keeps happening, export a backup from the home screen and
            send it with this message:
          </p>
          <pre className="poll-text">{this.state.error.message}</pre>
          <div className="row">
            <button onClick={() => window.location.reload()}>Reload</button>
            <button className="outline secondary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <a role="button" className="outline secondary" href="#/">
              Home
            </a>
          </div>
        </article>
      </main>
    );
  }
}

/* ---------------- confirm dialog ---------------- */

interface ConfirmRequest {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
  /** Present when the question has more than two answers. */
  options?: { value: string; label: string; danger?: boolean }[];
  resolveChoice?: (value: string | null) => void;
}

const useConfirmStore = create<{ req: ConfirmRequest | null }>(() => ({ req: null }));

/** True while a confirmation dialog is open (keyboard shortcuts pause). */
export const useConfirmOpen = () => useConfirmStore((s) => s.req !== null);
export const isConfirmOpen = () => useConfirmStore.getState().req !== null;

export function confirmAction(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    // Never leave an earlier question hanging — answering it "no" is the safe default.
    useConfirmStore.getState().req?.resolve(false);
    useConfirmStore.setState({ req: { ...opts, resolve } });
  });
}

/**
 * A question with more than two answers (e.g. replace / add / cancel). Cancel and Escape
 * both mean "do nothing", so a mis-clicked file never changes anything.
 */
export function choose(opts: {
  title: string;
  body?: ReactNode;
  options: { value: string; label: string; danger?: boolean }[];
}): Promise<string | null> {
  return new Promise((resolve) => {
    useConfirmStore.getState().req?.resolve(false);
    useConfirmStore.setState({
      req: {
        title: opts.title,
        body: opts.body,
        options: opts.options,
        resolve: () => resolve(null),
        resolveChoice: resolve,
      },
    });
  });
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
    req?.resolveChoice?.(null);
    req?.resolve(ok);
    useConfirmStore.setState({ req: null });
  };
  const pick = (value: string) => {
    req?.resolveChoice?.(value);
    useConfirmStore.setState({ req: null });
  };
  return (
    <dialog ref={ref} aria-labelledby="confirm-title" onCancel={(e) => (e.preventDefault(), done(false))}>
      {req && (
        <article>
          <header>
            <h3 id="confirm-title" style={{ margin: 0 }}>
              {req.title}
            </h3>
          </header>
          {req.body && <div className="confirm-body">{req.body}</div>}
          <footer>
            <div className="row-end wrap">
              {/* Cancel takes focus on destructive questions, so a stray Enter does nothing. */}
              <button className="secondary outline" onClick={() => done(false)} autoFocus={req.danger || !!req.options}>
                Cancel
              </button>
              {req.options ? (
                req.options.map((o) => (
                  <button key={o.value} className={o.danger ? 'danger' : ''} onClick={() => pick(o.value)}>
                    {o.label}
                  </button>
                ))
              ) : (
                <button className={req.danger ? 'danger' : ''} onClick={() => done(true)} autoFocus={!req.danger}>
                  {req.confirmLabel ?? 'Confirm'}
                </button>
              )}
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
      // A text box with a numeric keypad: unlike <input type="number"> a half-typed value
      // never silently commits 0, and the spinner cannot nudge a count on a trackpad scroll.
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      aria-label={label}
      disabled={disabled}
      placeholder={placeholder ?? (allowNull ? '—' : '0')}
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d]/g, '');
        setText(t);
        if (t === '') onChange(allowNull ? null : 0);
        else onChange(Math.min(1000000, Number(t)));
      }}
    />
  );
}

export function Badge({ kind, children }: { kind: 'ok' | 'warn' | 'bad' | 'info' | 'muted'; children: ReactNode }) {
  return <span className={`badge badge-${kind}`}>{children}</span>;
}
