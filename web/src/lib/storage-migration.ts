/**
 * Carries per-browser state across the MacroSync → Ayanox rename.
 *
 * The three keys below hold things a visitor typed or chose: their asset
 * selection, their language, and the deposit and risk percentage behind the
 * position calculator. Renaming the keys without moving the values would have
 * silently reset all of it on the first visit after the rebrand — a deposit
 * somebody entered to size a real trade is not state to throw away for tidiness.
 *
 * A side-effect module, imported at the top of `src/i18n/index.ts` rather than
 * from `main.tsx`: the language detector reads its key while that module is
 * being evaluated, and `App` pulls the module in itself, so it runs before
 * any statement in `main.tsx` could.
 *
 * Safe to keep indefinitely and safe to delete once the tail of returning
 * visitors has passed: it only ever copies a key the new name does not have.
 */
const RENAMED: ReadonlyArray<readonly [from: string, to: string]> = [
  ['macrosync.assets', 'ayanox.assets'],
  ['macrosync.lang', 'ayanox.lang'],
  ['macrosync.calc', 'ayanox.calc'],
];

try {
  for (const [from, to] of RENAMED) {
    const legacy = localStorage.getItem(from);
    // Never overwrite: whatever is under the new name is the newer choice.
    if (legacy !== null && localStorage.getItem(to) === null) {
      localStorage.setItem(to, legacy);
    }
    localStorage.removeItem(from);
  }
} catch {
  // A private window, or storage the browser refuses. Defaults are fine.
}
