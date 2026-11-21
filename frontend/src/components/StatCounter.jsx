import { useEffect, useState } from 'react';

export default function StatCounter({ value = 0, label, suffix = '', mono = true }) {
  const [display, setDisplay] = useState(0);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let raf;
    const duration = 900;
    const start = performance.now();
    const from = display;
    const to = value;
    setSettled(false);

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        // A quick settle-pop once the count lands on its final number —
        // gives the animation a landing beat instead of just stopping dead.
        setSettled(true);
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div>
      <div
        className={`text-4xl md:text-5xl font-semibold text-ink transition-transform duration-200 ${
          settled ? 'scale-100' : 'scale-[1.03]'
        } ${mono ? 'font-mono' : 'font-display'}`}
      >
        {display.toLocaleString()}
        <span className="text-amber-dark">{suffix}</span>
      </div>
      <div className="text-xs uppercase tracking-wide text-ink/50 mt-1 font-medium">{label}</div>
    </div>
  );
}
