import { useState } from "react";
import type { FormEvent } from "react";
import { btnBlock, btnPrimary, cx, fieldInput, fieldLabel, statusText } from "../../ui";

interface CreateAccountScreenProps {
  onCreated: () => void;
}

export function CreateAccountScreen({ onCreated }: CreateAccountScreenProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await window.api.account.create(username, password);
      if (result.ok) {
        onCreated();
      } else {
        setError(result.error || "Couldn't create the account.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-surface-0 font-sans text-ink">
      <div className="w-[340px] rounded-xl border border-line bg-surface-2 p-6">
        <h1 className="mb-1 text-lg font-bold">Welcome to JSeeker</h1>
        <p className="mb-4 text-xs text-ink-faint">
          Create a local account to get started. This stays on your machine — there's no server.
        </p>
        <form onSubmit={submit}>
          <div className="mb-3">
            <label className={fieldLabel} htmlFor="oa-username">
              Username
            </label>
            <input
              id="oa-username"
              className={fieldInput}
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="mb-3">
            <label className={fieldLabel} htmlFor="oa-password">
              Password
            </label>
            <input
              id="oa-password"
              type="password"
              className={fieldInput}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="mb-1">
            <label className={fieldLabel} htmlFor="oa-confirm">
              Confirm password
            </label>
            <input
              id="oa-confirm"
              type="password"
              className={fieldInput}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <button type="submit" className={cx(btnPrimary, btnBlock)} disabled={busy}>
            {busy ? "Creating…" : "Create Account"}
          </button>
          <p className={statusText}>{error}</p>
        </form>
      </div>
    </div>
  );
}
