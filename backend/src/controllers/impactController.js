const FoodListing = require('../models/FoodListing');
const User = require('../models/User');

// Standard-ish estimates used across food-rescue orgs for reporting
const MEALS_PER_KG = 2.5;
const CO2E_KG_PER_KG_FOOD = 2.5; // kg CO2-equivalent avoided per kg of food diverted from landfill

async function computeImpact(filter = {}) {
  const delivered = await FoodListing.find({ status: 'delivered', ...filter });
  const totalKg = delivered.reduce((sum, l) => sum + l.quantityKg, 0);
  return {
    donationsCompleted: delivered.length,
    kgDiverted: Math.round(totalKg * 10) / 10,
    mealsSaved: Math.round(totalKg * MEALS_PER_KG),
    co2eKgAvoided: Math.round(totalKg * CO2E_KG_PER_KG_FOOD),
  };
}

// GET /api/impact  (platform-wide, public)
exports.platformImpact = async (req, res) => {
  try {
    const impact = await computeImpact();
    const [donorCount, ngoCount] = await Promise.all([
      User.countDocuments({ role: 'donor' }),
      User.countDocuments({ role: 'ngo', verified: true }),
    ]);
    res.json({ ...impact, activeDonors: donorCount, verifiedNGOs: ngoCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/impact/recent-activity  (public — powers the landing page's live
// feed strip). Deliberately narrow field selection: org names and what/how
// much, nothing that would be sensitive on a public marketing page (no
// phone numbers, no exact pickup coordinates, no internal matching data).
exports.recentActivity = async (req, res) => {
  try {
    const deliveries = await FoodListing.find({ status: 'delivered' })
      .sort({ deliveredAt: -1 })
      .limit(8)
      .populate('donor', 'orgName')
      .populate('claimedBy', 'orgName')
      .select('foodType quantityKg deliveredAt donor claimedBy');

    res.json({
      activity: deliveries.map((d) => ({
        foodType: d.foodType,
        quantityKg: d.quantityKg,
        deliveredAt: d.deliveredAt,
        donorOrgName: d.donor?.orgName || 'A donor',
        ngoOrgName: d.claimedBy?.orgName || 'a local NGO',
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/impact/mine  (logged-in donor or ngo)
exports.myImpact = async (req, res) => {
  try {
    const filter = req.user.role === 'donor' ? { donor: req.user._id } : { claimedBy: req.user._id };
    const impact = await computeImpact(filter);
    res.json(impact);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
