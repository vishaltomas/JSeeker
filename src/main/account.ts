import { ipcMain } from "electron";
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { loadStore, saveStore } from "./store";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

async function hashPassword(password: string, salt: string): Promise<string> {
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return derived.toString("hex");
}

/**
 * Local account gate — see the `Account` doc comment in store.ts for the
 * security scope (a UI-level gate, not protection against local filesystem
 * access). Password is never stored or compared in plaintext: scrypt with a
 * random per-account salt, verified with a constant-time comparison.
 */
ipcMain.handle("account:create", async (_event, args: { username: string; password: string }) => {
  const username = args.username.trim();
  const password = args.password;
  if (!username) return { ok: false, error: "Choose a username." };
  if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };

  const store = loadStore();
  if (store.account) return { ok: false, error: "An account already exists." };

  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(password, passwordSalt);
  store.account = { username, passwordHash, passwordSalt, onboarded: false };
  saveStore(store);
  return { ok: true };
});

ipcMain.handle("account:login", async (_event, args: { username: string; password: string }) => {
  const store = loadStore();
  const account = store.account;
  if (!account) return false;
  if (account.username !== args.username.trim()) return false;

  const candidateHash = await hashPassword(args.password, account.passwordSalt);
  const stored = Buffer.from(account.passwordHash, "hex");
  const candidate = Buffer.from(candidateHash, "hex");
  if (stored.length !== candidate.length) return false;
  return timingSafeEqual(stored, candidate);
});
