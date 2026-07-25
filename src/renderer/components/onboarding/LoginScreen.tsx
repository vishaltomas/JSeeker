import { useState } from "react";
import type { FormEvent } from "react";
import { btnBlock, btnPrimary, cx, fieldInput, fieldLabel, statusText } from "../../ui";

interface LoginScreenProps {
  username: string;
  onUnlocked: () => void;
}

export function LoginScreen({ username, onUnlocked }: LoginScreenProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const ok = await window.api.account.login(username, password);
      if (ok) {
        onUnlocked();
      } else {
        setError("Incorrect password.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-surface-0 font-sans text-ink">
      <div className="w-[340px] rounded-xl border border-line bg-surface-2 p-6">
        <h1 className="mb-1 text-lg font-bold">Welcome back</h1>
        <p className="mb-4 text-xs text-ink-faint">Signed in as {username}</p>
        <form onSubmit={submit}>
          <div className="mb-1">
            <label className={fieldLabel} htmlFor="li-password">
              Password
            </label>
            <input
              id="li-password"
              type="password"
              className={fieldInput}
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className={cx(btnPrimary, btnBlock)} disabled={busy}>
            {busy ? "Checking…" : "Unlock"}
          </button>
          <p className={statusText}>{error}</p>
        </form>
      </div>
    </div>
  );
}
