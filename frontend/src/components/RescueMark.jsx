/**
 * FoodBridge's one recurring illustration: a crate of rescued food with a
 * sprout growing from it, on a dotted route line — the whole brand story
 * (surplus food → route → new growth) in one small flat-geometric mark.
 * Deliberately simple shapes (no gradients, no photorealism) so it reads
 * crisply at both a 40px empty-state size and a 200px hero size. Colors
 * come from the same three-accent system as the rest of the app.
 */
export default function RescueMark({ size = 96, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" className={className} aria-hidden="true">
      {/* soft field behind the crate */}
      <circle cx="48" cy="48" r="46" fill="#E6F0EA" />

      {/* dotted route curving under the crate — the "it's moving somewhere" motif */}
      <path d="M14 66 Q 30 78 48 72 Q 66 66 82 74" fill="none" stroke="#2C6E8E" strokeOpacity="0.35"
        strokeWidth="2.5" strokeLinecap="round" strokeDasharray="0.5 7" />

      {/* crate */}
      <rect x="24" y="42" width="48" height="30" rx="4" fill="#F2A93B" />
      <rect x="24" y="42" width="48" height="9" rx="4" fill="#C9840F" />
      <path d="M30 51h36M38 51v21M58 51v21" stroke="#C9840F" strokeWidth="2" strokeLinecap="round" />

      {/* crate lid flaps, open like it was just unpacked/handed over */}
      <path d="M28 42 L20 30 L38 34 Z" fill="#1F4D37" />
      <path d="M68 42 L76 30 L58 34 Z" fill="#2F6F4E" />

      {/* sprout growing out of the crate */}
      <path d="M48 42 C48 32 40 30 36 24 C44 24 48 30 48 34 C48 26 54 22 60 22 C56 30 48 32 48 42Z" fill="#2F6F4E" />
      <rect x="46.5" y="38" width="3" height="8" rx="1.5" fill="#1F4D37" />
    </svg>
  );
}
