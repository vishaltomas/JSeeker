import { useState } from "react";
import { Plus, X } from "lucide-react";
import { btn, cx, fieldInput, gradientBtn, gradientIconBtn } from "../ui";

interface KeyValueEditorProps {
  initialValue: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  addLabel?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  /** Stacks key above value instead of side-by-side — for narrow containers
   * (e.g. a sidebar) where a fixed-width key column plus a value column
   * doesn't leave enough room to be usable. */
  compact?: boolean;
  /** Swaps in the gradient hover/active button treatment (Profile view)
   * instead of the plain flat-hover style (onboarding). */
  gradient?: boolean;
}

interface Row {
  id: string;
  key: string;
  value: string;
}

function toRows(data: Record<string, string>): Row[] {
  return Object.entries(data).map(([key, value]) => ({ id: crypto.randomUUID(), key, value }));
}

/**
 * A dynamic list of key/value rows — for profile data that's genuinely
 * open-ended (extracted field names aren't known in advance, and the user
 * can add anything). Owns its own row state (seeded once from
 * `initialValue`, via a lazy initializer) rather than being a fully
 * controlled component, so typing in a row's key doesn't fight with the
 * parent re-deriving row order from a plain object on every keystroke. If
 * the caller needs to reset it to a new `initialValue` (e.g. after resume
 * extraction finishes), remount it with a changed `key` prop — the normal
 * React way to force a fresh internal state.
 */
export function KeyValueEditor({
  initialValue,
  onChange,
  addLabel = "Add field",
  keyPlaceholder = "Field",
  valuePlaceholder = "Value",
  compact = false,
  gradient = false,
}: KeyValueEditorProps) {
  const removeBtnClass = gradient
    ? gradientIconBtn
    : "flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-faint hover:bg-surface-3 hover:text-danger-text";
  const addBtnClass = gradient ? gradientBtn : btn;
  const [rows, setRows] = useState<Row[]>(() => toRows(initialValue));

  function emit(next: Row[]): void {
    setRows(next);
    const dict: Record<string, string> = {};
    for (const r of next) if (r.key.trim()) dict[r.key.trim()] = r.value;
    onChange(dict);
  }

  function updateRow(id: string, patch: Partial<Row>): void {
    emit(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string): void {
    emit(rows.filter((r) => r.id !== id));
  }

  function addRow(): void {
    emit([...rows, { id: crypto.randomUUID(), key: "", value: "" }]);
  }

  return (
    <div>
      {rows.map((row) =>
        compact ? (
          <div key={row.id} className="mb-3 rounded-md border border-line bg-surface-0/40 p-2">
            <div className="mb-1.5 flex items-center gap-2">
              <input
                className={cx(fieldInput, "min-w-0 flex-1")}
                placeholder={keyPlaceholder}
                value={row.key}
                onChange={(e) => updateRow(row.id, { key: e.target.value })}
              />
              <button
                type="button"
                className={removeBtnClass}
                title="Remove"
                aria-label="Remove field"
                onClick={() => removeRow(row.id)}
              >
                <X size={15} />
              </button>
            </div>
            <input
              className={fieldInput}
              placeholder={valuePlaceholder}
              value={row.value}
              onChange={(e) => updateRow(row.id, { value: e.target.value })}
            />
          </div>
        ) : (
          <div key={row.id} className="mb-2 flex min-w-0 gap-2">
            <div className="w-[220px] flex-shrink-0">
              <input
                className={fieldInput}
                placeholder={keyPlaceholder}
                value={row.key}
                onChange={(e) => updateRow(row.id, { key: e.target.value })}
              />
            </div>
            <div className="min-w-0 flex-1">
              <input
                className={fieldInput}
                placeholder={valuePlaceholder}
                value={row.value}
                onChange={(e) => updateRow(row.id, { value: e.target.value })}
              />
            </div>
            <button
              type="button"
              className={removeBtnClass}
              title="Remove"
              aria-label="Remove field"
              onClick={() => removeRow(row.id)}
            >
              <X size={15} />
            </button>
          </div>
        )
      )}
      <button type="button" className={addBtnClass} onClick={addRow}>
        <Plus size={13} className="mr-1 inline-block" />
        {addLabel}
      </button>
    </div>
  );
}
