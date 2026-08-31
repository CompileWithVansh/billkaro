import { useState } from 'react';

interface Props {
  title: string;
  /** 'amount' allows decimals (for a price); 'qty' is integer only. */
  mode: 'amount' | 'qty';
  initial?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (value: number) => void;
}

/**
 * A big touch keypad. Used for two things:
 *  - entering a custom/misc amount (mode='amount', decimals allowed)
 *  - setting an exact quantity on a cart line (mode='qty', integers)
 */
export default function KeypadModal({
  title,
  mode,
  initial = '',
  confirmLabel = 'OK',
  onClose,
  onConfirm,
}: Props) {
  const [value, setValue] = useState(initial);

  const allowDecimal = mode === 'amount';

  function push(ch: string) {
    setValue((prev) => {
      if (ch === '.') {
        if (!allowDecimal || prev.includes('.')) return prev;
        return prev === '' ? '0.' : prev + '.';
      }
      // block more than 2 decimals for amounts
      if (allowDecimal && prev.includes('.')) {
        const decimals = prev.split('.')[1] ?? '';
        if (decimals.length >= 2) return prev;
      }
      // avoid leading zeros like "007"
      if (prev === '0' && ch !== '.') return ch;
      return prev + ch;
    });
  }

  function backspace() {
    setValue((prev) => prev.slice(0, -1));
  }

  function confirm() {
    const num = Number(value);
    if (!isFinite(num) || num <= 0) return;
    onConfirm(mode === 'qty' ? Math.round(num) : +num.toFixed(2));
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', allowDecimal ? '.' : '', '0', '⌫'];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal keypad-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>

        <div className="keypad-display">
          {mode === 'amount' ? '₹' : '×'}
          {value || '0'}
        </div>

        <div className="keypad-grid">
          {keys.map((k, i) =>
            k === '' ? (
              <span key={i} />
            ) : k === '⌫' ? (
              <button key={i} className="keypad-key" onClick={backspace}>
                ⌫
              </button>
            ) : (
              <button key={i} className="keypad-key" onClick={() => push(k)}>
                {k}
              </button>
            )
          )}
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn green" onClick={confirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
