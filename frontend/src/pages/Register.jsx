import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import LocationPicker from '../components/LocationPicker.jsx';

const ORG_TYPES = {
  donor: [
    { value: 'restaurant', label: 'Restaurant' },
    { value: 'hotel', label: 'Hotel' },
    { value: 'caterer', label: 'Event caterer' },
    { value: 'grocery_store', label: 'Grocery store' },
    { value: 'individual', label: 'Individual / household' },
  ],
  ngo: [
    { value: 'shelter', label: 'Shelter' },
    { value: 'ngo', label: 'NGO' },
    { value: 'community_kitchen', label: 'Community kitchen' },
  ],
};

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('donor');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', password: '', orgName: '', orgType: 'restaurant',
    phone: '', address: '', lat: null, lng: null, darpanId: '', dailyCapacityKg: '', businessRegNumber: '', proofType: 'business_licence',
  });
  const [verificationDocFile, setVerificationDocFile] = useState(null);
  const [agreed, setAgreed] = useState(false);

  const isIndividual = role === 'donor' && form.orgType === 'individual';

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function updateOrgType(value) {
    setForm((f) => ({
      ...f,
      orgType: value,
      // Individuals never have business paperwork — steer straight to the
      // government-ID option instead of leaving the earlier business_licence
      // default selected, and drop any business-registration number they
      // may have typed in before switching.
      proofType: value === 'individual' ? 'government_id' : (f.proofType === 'government_id' ? 'business_licence' : f.proofType),
      businessRegNumber: value === 'individual' ? '' : f.businessRegNumber,
    }));
  }

  function updateLocation(lat, lng) {
    setForm((f) => ({ ...f, lat, lng }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!Number.isFinite(form.lat) || !Number.isFinite(form.lng)) {
      setError('Please set your location on the map before continuing.');
      return;
    }
    if (['ngo', 'donor'].includes(role) && !verificationDocFile) {
      setError('Please upload a registration/verification document so we can confirm your organization.');
      return;
    }
    if (!agreed) {
      setError('Please agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }
    setLoading(true);
    try {
      const result = await register({
        name: form.name,
        email: form.email,
        password: form.password,
        role,
        orgName: isIndividual ? form.name : form.orgName,
        orgType: form.orgType,
        phone: form.phone,
        address: form.address,
        darpanId: role === 'ngo' ? form.darpanId : undefined,
        businessRegNumber: role === 'donor' ? form.businessRegNumber : undefined,
        proofType: role === 'donor' ? form.proofType : undefined,
        dailyCapacityKg: role === 'ngo' && form.dailyCapacityKg ? form.dailyCapacityKg : undefined,
        location: { lat: parseFloat(form.lat), lng: parseFloat(form.lng) },
        verificationDocFile,
      });
      navigate(result.user.role === 'donor' ? '/donor' : '/ngo');
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-16">
      <p className="text-xs font-mono uppercase tracking-wide text-ink/40 mb-2">Join the network</p>
      <h1 className="font-display text-3xl font-semibold mb-8">Create your account</h1>

      <div className="flex gap-2 mb-8 bg-white border border-line rounded-full p-1 w-fit">
        {['donor', 'ngo'].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => { setRole(r); update('orgType', ORG_TYPES[r][0].value); }}
            className={`focus-ring px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
              role === r ? 'bg-rescue text-white' : 'text-ink/60 hover:text-ink'
            }`}
          >
            {r === 'donor' ? 'I have surplus food' : 'I run an NGO / shelter'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Your name</label>
            <input required value={form.name} onChange={(e) => update('name', e.target.value)}
              className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line bg-white" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Organization type</label>
            <select value={form.orgType} onChange={(e) => updateOrgType(e.target.value)}
              className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line bg-white">
              {ORG_TYPES[role].map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        {!isIndividual && (
          <div>
            <label className="block text-sm font-medium mb-1.5">Organization name</label>
            <input required value={form.orgName} onChange={(e) => update('orgName', e.target.value)}
              placeholder={role === 'donor' ? 'e.g. Spice Route Restaurant' : 'e.g. Umeed Shelter Home'}
              className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line bg-white" />
          </div>
        )}
        {isIndividual && (
          <p className="text-xs text-ink/40 -mt-2">
            No organization — donations will show under your name, {form.name || 'your name'}.
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Email</label>
            <input type="email" required value={form.email} onChange={(e) => update('email', e.target.value)}
              className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line bg-white" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Password</label>
            <input type="password" required minLength={6} value={form.password} onChange={(e) => update('password', e.target.value)}
              className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line bg-white" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Phone</label>
          <input value={form.phone} onChange={(e) => update('phone', e.target.value)}
            className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line bg-white" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Address</label>
          <input required value={form.address} onChange={(e) => update('address', e.target.value)}
            className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line bg-white" />
        </div>

        {role === 'ngo' && (
          <div>
            <label className="block text-sm font-medium mb-1.5">
              NGO Darpan registration ID <span className="text-ink/40 font-normal">(optional, speeds up verification)</span>
            </label>
            <input value={form.darpanId} onChange={(e) => update('darpanId', e.target.value)}
              placeholder="e.g. DL/2019/0212345"
              className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line bg-white" />
            <p className="text-xs text-ink/40 mt-1.5">
              From NITI Aayog's NGO-Darpan portal. Admins still confirm it manually, but it's shown to
              donors as a trust signal once verified.
            </p>
          </div>
        )}

        {role === 'donor' && isIndividual && (
          <div>
            <p className="text-sm font-medium mb-1.5">Proof of identity</p>
            <p className="text-xs text-ink/50 bg-ink/5 rounded-xl px-3 py-2.5">
              As an individual donor you don't need any business paperwork — a personal government ID
              (Aadhaar, Voter ID, or driving licence) is all we ask for, just to confirm a real,
              traceable person is behind the account.
            </p>
          </div>
        )}

        {role === 'donor' && !isIndividual && (
          <div>
            <label className="block text-sm font-medium mb-1.5">What kind of proof are you uploading?</label>
            <div className="space-y-2">
              {[
                { value: 'business_licence', label: 'Business licence', hint: 'FSSAI, GST, or shop/establishment licence — for a registered restaurant, hotel, caterer, or store' },
                { value: 'government_id', label: 'Personal government ID', hint: 'Aadhaar, Voter ID, or driving licence — for a home cook, small dhaba, or any informal setup without business paperwork' },
                { value: 'other', label: 'Something else', hint: "Any other document that shows you're a real, identifiable person or place" },
              ].map((opt) => (
                <label key={opt.value}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    form.proofType === opt.value ? 'border-rescue bg-rescue/5' : 'border-line bg-white hover:border-ink/20'
                  }`}>
                  <input type="radio" name="proofType" value={opt.value}
                    checked={form.proofType === opt.value}
                    onChange={(e) => update('proofType', e.target.value)}
                    className="mt-0.5 accent-rescue" />
                  <span>
                    <span className="block text-sm font-medium">{opt.label}</span>
                    <span className="block text-xs text-ink/50 mt-0.5">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-ink/40 mt-2">
              Don't have a business licence? A personal government ID works just as well — we just need to
              know a real, traceable person is behind the account. Plenty of genuine donors are informal
              setups with no formal paperwork, and that's completely fine.
            </p>
          </div>
        )}

        {role === 'donor' && !isIndividual && (
          <div>
            <label className="block text-sm font-medium mb-1.5">
              FSSAI / GST / shop licence number <span className="text-ink/40 font-normal">(optional, only if you have one)</span>
            </label>
            <input value={form.businessRegNumber} onChange={(e) => update('businessRegNumber', e.target.value)}
              placeholder="e.g. 12345678901234"
              className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line bg-white" />
            <p className="text-xs text-ink/40 mt-1.5">
              Shown alongside your document as an extra trust signal for admins reviewing your account. Leave
              blank if you don't have one — it won't stop you from registering.
            </p>
          </div>
        )}

        {role === 'ngo' && (
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Daily capacity (kg) <span className="text-ink/40 font-normal">(optional — improves matching)</span>
            </label>
            <input type="number" min="1" step="1" value={form.dailyCapacityKg}
              onChange={(e) => update('dailyCapacityKg', e.target.value)}
              placeholder="e.g. 30"
              className="focus-ring w-full px-4 py-2.5 rounded-xl border border-line bg-white" />
            <p className="text-xs text-ink/40 mt-1.5">
              Roughly how much food (kg) your organization can realistically handle in a day. The matching
              engine uses this to avoid sending you donations way bigger or smaller than you can use — you
              can change this anytime from your dashboard.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Registration / verification document <span className="text-claim">*</span>
          </label>
          <input
            type="file"
            required
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
            onChange={(e) => setVerificationDocFile(e.target.files?.[0] || null)}
            className="focus-ring w-full text-sm px-4 py-2.5 rounded-xl border border-line bg-white file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-rescue/10 file:text-rescue-dark"
          />
          <p className="text-xs text-ink/40 mt-1.5">
            {role === 'ngo'
              ? "Upload your NGO-Darpan certificate, registration letter, or another official document (PDF, JPG, PNG, or WEBP, up to 5MB). Admins review this before your account can claim listings."
              : isIndividual
                ? "Upload a photo or scan of your Aadhaar, Voter ID, or driving licence (PDF, JPG, PNG, or WEBP, up to 5MB). Admins review this before your account can post listings."
                : "Upload whichever document matches what you selected above (PDF, JPG, PNG, or WEBP, up to 5MB). Admins review this before your account can post listings."}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Pickup / organization location</label>
          <LocationPicker lat={form.lat} lng={form.lng} onChange={updateLocation} />
          <p className="text-xs text-ink/40 mt-1.5">Used by the matching engine for proximity scoring.</p>
        </div>

        <label className="flex items-start gap-2.5 text-sm text-ink/70 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="focus-ring mt-0.5 w-4 h-4 rounded border-line accent-rescue"
          />
          <span>
            I agree to FoodBridge's{' '}
            <Link to="/terms" target="_blank" className="text-rescue font-medium hover:underline">Terms of Service</Link>{' '}
            and{' '}
            <Link to="/privacy" target="_blank" className="text-rescue font-medium hover:underline">Privacy Policy</Link>.
          </span>
        </label>

        {error && <p className="text-sm text-claim bg-claim-light px-3 py-2 rounded-lg">{error}</p>}

        <button type="submit" disabled={loading || !agreed}
          className="focus-ring w-full py-3 rounded-full bg-rescue text-white font-semibold hover:bg-rescue-dark transition-colors disabled:opacity-60">
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="text-sm text-ink/60 mt-6">
        Already have an account? <Link to="/login" className="text-rescue font-medium hover:underline">Log in</Link>
      </p>
    </div>
  );
}
