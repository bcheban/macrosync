/**
 * Ambient background: two slow-drifting colour auras, a masked grid and a
 * vignette. Purely decorative, fixed behind the whole app.
 */
export function BackgroundFX() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-void">
      <div className="absolute inset-0 grid-fade opacity-70" />

      <div className="animate-float-slow absolute -top-[28rem] left-1/2 size-[62rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(124,92,255,0.20),transparent_62%)] blur-3xl" />
      <div className="animate-float-slow absolute -right-64 top-40 size-[46rem] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.14),transparent_65%)] blur-3xl [animation-delay:-6s]" />
      <div className="animate-float-slow absolute -bottom-72 -left-52 size-[44rem] rounded-full bg-[radial-gradient(circle,rgba(0,255,163,0.10),transparent_65%)] blur-3xl [animation-delay:-10s]" />

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,transparent_35%,rgba(5,6,10,0.85)_100%)]" />
    </div>
  );
}
