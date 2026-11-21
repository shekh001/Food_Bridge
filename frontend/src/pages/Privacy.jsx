import { Link } from 'react-router-dom';

export default function Privacy() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <p className="text-xs font-mono uppercase tracking-wide text-ink/40 mb-2">Legal</p>
      <h1 className="font-display text-3xl font-semibold mb-2">Privacy Policy</h1>
      <p className="text-sm text-ink/40 mb-10">Last updated: {new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

      <div className="space-y-8 text-sm leading-relaxed text-ink/80">
        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">1. What we collect</h2>
          <p>
            When you register, we collect your name, email address, phone number, organization details, and
            your organization's location (used for proximity matching between donors and recipients). NGO
            accounts also submit a registration/verification document (e.g. an NGO-Darpan certificate) so our
            team can confirm the organization is genuine before it can claim listings.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">2. How we use it</h2>
          <p>
            We use this information to operate the matching engine, show relevant listings, coordinate pickups,
            send account and transaction notifications, and verify NGO accounts. Location data is used to rank
            and route nearby listings and pickups — it is not sold or shared with advertisers.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">3. Verification documents</h2>
          <p>
            Documents uploaded for NGO verification are stored securely and are only accessible to FoodBridge
            admins reviewing your account. They are never made public or shown to donors — only your
            organization name, Darpan ID (if provided), and verification status are visible to other users.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">4. Who can see your data</h2>
          <p>
            Donors and NGOs see each other's organization name, approximate location, and contact details only
            once a listing is claimed, so a pickup can be coordinated. Admins can see full account details to
            operate the platform, resolve disputes, and verify NGOs.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">5. Data retention and your choices</h2>
          <p>
            We keep account data for as long as your account is active. You can request account deletion or a
            copy of your data at any time by contacting the FoodBridge team through your organization's admin
            contact — we'll typically remove personal data within 30 days, retaining only what's legally
            required (e.g. donation records for CSR/tax purposes).
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">6. Security</h2>
          <p>
            Passwords are stored as salted hashes, never in plain text. Verification documents are kept outside
            the public web root and are only reachable through an authenticated admin-only endpoint.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">7. Changes</h2>
          <p>
            We may update this policy as the platform evolves. Continued use of FoodBridge after an update
            means you accept the revised policy.
          </p>
        </section>
      </div>

      <p className="text-sm text-ink/60 mt-10">
        See also our <Link to="/terms" className="text-rescue font-medium hover:underline">Terms of Service</Link>.
      </p>
    </div>
  );
}
