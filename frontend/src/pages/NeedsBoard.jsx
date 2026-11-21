import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import RescueMark from '../components/RescueMark.jsx';
import { Clock, Building2, ArrowRight } from 'lucide-react';

function timeLeft(neededBy) {
  const ms = new Date(neededBy).getTime() - Date.now();
  if (ms <= 0) return 'Deadline passed';
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days}d left`;
  const hrs = Math.floor(ms / 3600000);
  return `${hrs}h left`;
}

export default function NeedsBoard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notifications } = useSocket();
  const [needs, setNeeds] = useState([]);
  const [loading, setLoading] = useState(true);

  function load() {
    client.get('/needs').then(({ data }) => setNeeds(data.needs)).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(load, []);

  // A new need posted while someone's already looking at the board should
  // just show up, the same way the live listing feed does.
  useEffect(() => {
    const latest = notifications[0];
    if (latest?.kind === 'need_posted' && latest.payload?._id) {
      setNeeds((prev) => (prev.some((n) => n._id === latest.payload._id) ? prev : [latest.payload, ...prev]));
    }
  }, [notifications]);

  function respond(need) {
    if (!user) return navigate('/login');
    if (user.role !== 'donor') return; // NGOs can view the board but not respond to it
    const params = new URLSearchParams({
      needId: need._id,
      foodType: need.foodType,
      qty: String(need.quantityKg),
    });
    navigate(`/donor?${params.toString()}`);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-14">
      <p className="text-xs font-mono uppercase tracking-wide text-ink/40 mb-2">Real demand, not guesswork</p>
      <h1 className="font-display text-3xl md:text-4xl font-semibold mb-2">Needs board</h1>
      <p className="text-ink/60 max-w-lg mb-10">
        NGOs post exactly what they're short on — respond directly instead of hoping your listing gets noticed.
      </p>

      {!loading && needs.length === 0 && (
        <div className="border border-dashed border-line rounded-2xl p-12 text-center">
          <RescueMark size={72} className="mx-auto mb-4" />
          <p className="text-ink/50">No open needs right now — check back soon.</p>
        </div>
      )}

      <div className="space-y-3">
        {needs.map((n) => (
          <div key={n._id} className="bg-white border border-line rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="font-display text-lg font-semibold">{n.foodType} · {n.quantityKg}kg</p>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-ink/55">
                <span className="inline-flex items-center gap-1"><Building2 size={12} />{n.ngo?.orgName || n.ngoOrgName}</span>
                <span className={`inline-flex items-center gap-1 font-mono ${new Date(n.neededBy) - Date.now() < 12 * 3600 * 1000 ? 'text-claim' : ''}`}>
                  <Clock size={12} />{timeLeft(n.neededBy)}
                </span>
              </div>
              {n.notes && <p className="text-sm text-ink/60 mt-2">{n.notes}</p>}
            </div>
            {(!user || user.role === 'donor') && (
              <button onClick={() => respond(n)}
                className="focus-ring shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-transit text-white text-sm font-semibold hover:bg-transit-dark transition-colors">
                I can help<ArrowRight size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
