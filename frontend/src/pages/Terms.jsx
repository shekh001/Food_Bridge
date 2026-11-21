import { Link } from 'react-router-dom';

export default function Terms() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <p className="text-xs font-mono uppercase tracking-wide text-ink/40 mb-2">Legal</p>
      <h1 className="font-display text-3xl font-semibold mb-2">Terms of Service</h1>
      <p className="text-sm text-ink/40 mb-10">Last updated: {new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

      <div className="space-y-8 text-sm leading-relaxed text-ink/80">
        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">1. What FoodBridge is</h2>
          <p>
            FoodBridge is a coordination platform that connects donors (restaurants, hotels, caterers, and grocery
            stores with surplus food) with recipient organizations (NGOs, shelters, and community kitchens). We
            help match, track, and confirm food handoffs — we are not a party to the donation itself, and we do
            not handle, store, or transport food ourselves.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">2. Accounts and eligibility</h2>
          <p>
            You must provide accurate information when registering, including your organization's name, contact
            details, and location. Recipient organizations (NGOs, shelters, community kitchens) go through a
            verification step before they can claim listings — this is a manual review by our team and is not a
            guarantee of any particular status, license, or accreditation.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">3. Food safety and liability</h2>
          <p>
            Donors are responsible for accurately describing the food they list, including its condition and
            expiry. Recipients are responsible for inspecting food at pickup and using their own judgment about
            whether it is safe to accept and redistribute. FoodBridge does not inspect, certify, or guarantee the
            safety or quality of any food listed on the platform, and is not liable for issues arising from food
            once it has changed hands.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">4. Acceptable use</h2>
          <p>
            Don't use FoodBridge to post false listings, misrepresent your organization, or interfere with other
            users' ability to use the platform. We may suspend or remove accounts that violate these terms or that
            we reasonably believe are fraudulent.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">5. Changes</h2>
          <p>
            We may update these terms as the platform evolves. Continued use of FoodBridge after an update means
            you accept the revised terms.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">6. Contact</h2>
          <p>
            Questions about these terms? Reach out to the FoodBridge team through your organization's admin
            contact.
          </p>
        </section>
      </div>

      <p className="text-sm text-ink/60 mt-10">
        See also our <Link to="/privacy" className="text-rescue font-medium hover:underline">Privacy Policy</Link>.
      </p>
    </div>
  );
}
