import type { Signal } from '../../types/domain.js';
import { deleteKey, getJson, setJson, storeKey } from '../store/store.js';

/**
 * Turning a call into a position, for one person.
 *
 * The alert carries a stop distance and a leverage ceiling, which together
 * determine a position size — but only once somebody's account is known. Without
 * it the message can say "risk 1% of book" and leave the arithmetic to the
 * reader, which is where mistakes get made under time pressure.
 *
 * Deliberately never stored alongside anything identifying. It is a number
 * somebody typed into a chat, kept under their chat id and nothing else, and it
 * exists so the bot can do one multiplication on their behalf.
 */

export interface Account {
  /** Deposit in USDT, as the subscriber stated it. */
  balance: number;
  /** Percent of the deposit to put at risk on one trade. */
  riskPct: number;
  updatedAt: string;
}

const ACCOUNT_KEY = (chatId: string): string => storeKey(`telegram:account:${chatId}`);

/** Bounds that reject a typo rather than sizing a position from one. */
const MAX_BALANCE = 100_000_000;
const MAX_RISK_PCT = 20;

export async function getAccount(chatId: string): Promise<Account | null> {
  const stored = await getJson<Account | null>(ACCOUNT_KEY(chatId), null);
  if (!stored || !(stored.balance > 0) || !(stored.riskPct > 0)) return null;
  return stored;
}

export async function setAccount(chatId: string, balance: number, riskPct: number): Promise<Account> {
  const account: Account = { balance, riskPct, updatedAt: new Date().toISOString() };
  await setJson(ACCOUNT_KEY(chatId), account);
  return account;
}

export const clearAccount = (chatId: string): Promise<void> => deleteKey(ACCOUNT_KEY(chatId));

/**
 * Reads a number as somebody would type it into a chat.
 *
 * The comma is the whole difficulty: it is a decimal mark in most of Europe and
 * a thousands separator in most of the anglophone world, and `$2,500` meaning
 * 2.5 is not a rounding error — it is a position a thousandth of the intended
 * size. Groups of exactly three digits are read as separators; anything else is
 * read as a decimal mark. A dot anywhere settles it outright.
 */
function readNumber(raw: string): number {
  const stripped = raw.replace(/[$%\s]/g, '');

  if (stripped.includes('.')) return Number(stripped.replace(/,/g, ''));
  if (/^\d{1,3}(,\d{3})+$/.test(stripped)) return Number(stripped.replace(/,/g, ''));

  return Number(stripped.replace(',', '.'));
}

/**
 * Reads `/balance 1000 1`.
 *
 * `$` and `%` are tolerated: people type what they see, and rejecting `$1,000`
 * on principle only makes the command feel broken.
 */
export function parseBalanceCommand(text: string): { balance: number; riskPct: number } | { error: string } {
  const parts = text.trim().split(/\s+/).slice(1);
  if (!parts.length) return { error: 'usage' };

  const balance = readNumber(parts[0] ?? '');
  // Risk defaults to 1% — the figure the alerts already suggest.
  const riskPct = parts.length > 1 ? readNumber(parts[1] ?? '') : 1;

  if (!Number.isFinite(balance) || balance <= 0) return { error: 'balance' };
  if (balance > MAX_BALANCE) return { error: 'balance-large' };
  if (!Number.isFinite(riskPct) || riskPct <= 0) return { error: 'risk' };
  if (riskPct > MAX_RISK_PCT) return { error: 'risk-large' };

  return { balance, riskPct };
}

export interface PositionPlan {
  /** What is at risk if the stop fills, in USDT. */
  riskAmount: number;
  /** Position value at entry, in USDT. */
  notional: number;
  /** Collateral required at the suggested leverage. */
  margin: number;
  leverage: number;
  /** True when the margin was reduced to fit the account. */
  capped: boolean;
}

/**
 * Sizes a position so the stop costs exactly the intended risk.
 *
 * The whole calculation is one identity: a position of `notional` loses
 * `notional * stopFraction` when the stop fills, and that must equal the risk
 * budget. Leverage does not appear in it — it decides only how much collateral
 * the same position needs, which is why leverage cannot make a trade "safer"
 * and only ever changes how much of the account is tied up.
 *
 * A position whose margin exceeds the balance is not fundable, so it is capped
 * and flagged. Silently sizing something unfundable would be worse than
 * refusing: the reader would place the order and find out from the exchange.
 */
export function planPosition(account: Account, signal: Signal): PositionPlan | null {
  const stopFraction = Math.abs(signal.entry - signal.stopLoss) / signal.entry;
  if (!(stopFraction > 0) || !(signal.maxSafeLeverage > 0)) return null;

  const riskAmount = (account.balance * account.riskPct) / 100;
  const notional = riskAmount / stopFraction;
  const leverage = signal.maxSafeLeverage;

  const wanted = notional / leverage;
  const capped = wanted > account.balance;

  return {
    riskAmount,
    notional: capped ? account.balance * leverage : notional,
    margin: capped ? account.balance : wanted,
    leverage,
    capped,
  };
}
