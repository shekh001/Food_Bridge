import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client.js';
import StatCounter from '../components/StatCounter.jsx';
import RescueRail from '../components/RescueRail.jsx';
import { UtensilsCrossed, Leaf, Cloud, ShieldCheck, Scale, Users, MapPin, Sparkles, Truck } from 'lucide-react';
import RescueMark from '../components/RescueMark.jsx';

const PIPELINE = ['posted', 'claimed', 'picked_up', 'delivered'];

function timeAgo(dateStr) {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Landing() {
  const [impact, setImpact] = useState({ mealsSaved: 0, kgDiverted: 0, co2eKgAvoided: 0, verifiedNGOs: 0 });
  const [demoStep, setDemoStep] = useState(0);
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    client.get('/impact').then(({ data }) => setImpact(data)).catch(() => {});
    client.get('/impact/recent-activity').then(({ data }) => setActivity(data.activity)).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setDemoStep((s) => (s + 1) % PIPELINE.length), 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden max-w-6xl mx-auto px-6 pt-16 pb-20 md:pt-24 md:pb-28 grid md:grid-cols-[1.1fr_0.9fr] gap-14 items-center">
        {/* Subtle decorative texture — a loose dot-grid, evokes a map of
            scattered pickup points without being literal or noisy. */}
        <svg className="hero-texture pointer-events-none absolute -top-10 -right-24 w-[520px] h-[520px] opacity-[0.06]" viewBox="0 0 200 200" aria-hidden="true">
          <pattern id="dotgrid" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="2" fill="#1C2321" />
          </pattern>
          <rect width="200" height="200" fill="url(#dotgrid)" />
        </svg>
        <div className="relative">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-rescue bg-rescue-light px-3 py-1.5 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-rescue animate-pulse" />
            Live dispatch network
          </div>
          <h1 className="font-display text-5xl md:text-6xl leading-[1.05] tracking-tight text-ink font-semibold">
            Surplus food doesn't need charity.
            <br />
            <span className="text-rescue">It needs coordination.</span>
          </h1>
          <p className="mt-6 text-lg text-ink/70 max-w-lg leading-relaxed">
            FoodBridge matches restaurants, hotels, caterers, and grocery stores with verified
            shelters and community kitchens the moment food becomes available — ranked by
            distance, quantity fit, and how little time is left before it spoils.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              to="/register"
              className="focus-ring px-6 py-3 rounded-full bg-rescue text-white font-semibold hover:bg-rescue-dark transition-colors"
            >
              List surplus food
            </Link>
            <Link
              to="/browse"
              className="focus-ring px-6 py-3 rounded-full border border-line font-semibold hover:border-ink/30 transition-colors"
            >
              Browse live feed
            </Link>
          </div>
        </div>

        {/* Signature element: live dispatch card showing the Rescue Rail animate through its states */}
        <div className="bg-white rounded-3xl border border-line shadow-card p-7">
          <div className="flex items-center justify-between mb-5">
            <span className="text-xs font-mono uppercase tracking-wide text-ink/40">Dispatch #FB-2291</span>
            <span className="text-xs font-mono text-amber-dark bg-amber-light px-2 py-1 rounded-full">2h 40m left</span>
          </div>
          <p className="font-display text-xl font-semibold">Cooked North Indian meals</p>
          <p className="text-sm text-ink/60 mt-1">Spice Route Restaurant → Umeed Shelter Home</p>

          <div className="mt-6 flex items-center gap-4 font-mono text-sm text-ink/70">
            <span className="inline-flex items-center gap-1.5"><Scale size={14} />12 kg</span>
            <span className="inline-flex items-center gap-1.5"><Users size={14} />~30 meals</span>
            <span className="inline-flex items-center gap-1.5 text-transit-dark"><MapPin size={14} />1.5 km away</span>
          </div>

          <div className="mt-7">
            <RescueRail status={PIPELINE[demoStep]} />
          </div>

          <div className="mt-6 pt-5 border-t border-line flex items-center justify-between">
            <span className="text-xs text-ink/40 font-mono inline-flex items-center gap-1.5"><Sparkles size={13} />match score</span>
            <span className="text-sm font-mono font-semibold text-rescue">87.6%</span>
          </div>
        </div>
      </section>

      {/* Live impact strip */}
      <section className="border-y border-line bg-white">
        <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <span className="w-8 h-8 rounded-lg bg-rescue-light text-rescue-dark flex items-center justify-center mb-3">
              <UtensilsCrossed size={16} strokeWidth={2.25} />
            </span>
            <StatCounter value={impact.mealsSaved} label="Meals rescued" />
          </div>
          <div>
            <span className="w-8 h-8 rounded-lg bg-transit-light text-transit-dark flex items-center justify-center mb-3">
              <Leaf size={16} strokeWidth={2.25} />
            </span>
            <StatCounter value={impact.kgDiverted} label="KG diverted" suffix=" kg" />
          </div>
          <div>
            <span className="w-8 h-8 rounded-lg bg-amber-light text-amber-dark flex items-center justify-center mb-3">
              <Cloud size={16} strokeWidth={2.25} />
            </span>
            <StatCounter value={impact.co2eKgAvoided} label="CO2e avoided" suffix=" kg" />
          </div>
          <div>
            <span className="w-8 h-8 rounded-lg bg-rescue-light text-rescue-dark flex items-center justify-center mb-3">
              <ShieldCheck size={16} strokeWidth={2.25} />
            </span>
            <StatCounter value={impact.verifiedNGOs} label="Verified NGOs" />
          </div>
        </div>
      </section>

      {/* Live activity marquee — real recent deliveries, scrolling. Only
          renders once there's real data; an empty/fake marquee would work
          against the "coordination, not charity" honesty the whole site
          is going for. */}
      {activity.length > 0 && (
        <section className="border-b border-line bg-paper overflow-hidden py-5">
          <div className="marquee-track flex gap-10 w-max">
            {[...activity, ...activity].map((a, i) => (
              <div key={i} className="flex items-center gap-2.5 text-sm text-ink/60 shrink-0 font-mono">
                <span className="w-6 h-6 rounded-full bg-rescue-light text-rescue-dark flex items-center justify-center shrink-0">
                  <Truck size={12} strokeWidth={2.5} />
                </span>
                <span className="text-ink font-medium">{a.donorOrgName}</span>
                <span className="text-ink/30">→</span>
                <span>{a.ngoOrgName}</span>
                <span className="text-ink/30">·</span>
                <span>{a.foodType}, {a.quantityKg}kg</span>
                <span className="text-ink/30">·</span>
                <span className="text-ink/40">{timeAgo(a.deliveredAt)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* How it works — the pipeline itself as the structural device */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <p className="text-xs font-mono uppercase tracking-wide text-ink/40 mb-3">How it moves</p>
        <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mb-14 max-w-xl">
          Every donation follows one rail, from kitchen to plate.
        </h2>

        <div className="grid md:grid-cols-4 gap-6">
          {[
            { step: 'Posted', icon: UtensilsCrossed, desc: 'A donor lists surplus food with quantity, type, and pickup window the moment it\'s available.', color: 'bg-ink/5', iconColor: 'text-ink/50' },
            { step: 'Claimed', icon: Sparkles, desc: 'The matching engine ranks verified NGOs by proximity, urgency, and quantity fit — top match is notified instantly.', color: 'bg-amber-light', iconColor: 'text-amber-dark' },
            { step: 'Picked up', icon: Truck, desc: 'Volunteer or NGO staff confirms pickup; both sides track status in real time.', color: 'bg-transit-light', iconColor: 'text-transit-dark' },
            { step: 'Delivered', icon: ShieldCheck, desc: 'Delivery is confirmed, impact is logged, and the donor gets an auto-generated CSR certificate.', color: 'bg-rescue-light', iconColor: 'text-rescue-dark' },
          ].map((s, i) => (
            <div key={s.step} className={`rounded-2xl border border-line p-6 ${s.color}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-ink/40">0{i + 1}</span>
                <s.icon size={18} strokeWidth={2} className={s.iconColor} />
              </div>
              <p className="font-display text-lg font-semibold mt-2">{s.step}</p>
              <p className="text-sm text-ink/60 mt-2 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 pb-28">
        <div className="rounded-3xl bg-ink text-paper px-10 py-16 text-center">
          <RescueMark size={64} className="mx-auto mb-6" />
          <h3 className="font-display text-3xl md:text-4xl font-semibold max-w-2xl mx-auto">
            Turn tonight's surplus into tomorrow's meals.
          </h3>
          <p className="mt-4 text-paper/60 max-w-md mx-auto">
            Free for shelters and community kitchens. Donors get CSR-ready reporting from day one.
          </p>
          <Link
            to="/register"
            className="focus-ring inline-block mt-8 px-7 py-3 rounded-full bg-amber text-ink font-semibold hover:bg-amber-dark transition-colors"
          >
            Get started
          </Link>
        </div>
      </section>
    </div>
  );
}
