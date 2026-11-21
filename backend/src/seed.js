require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('./config/db');
const User = require('./models/User');
const FoodListing = require('./models/FoodListing');

async function run() {
  await connectDB();
  console.log('Clearing existing data...');
  await Promise.all([User.deleteMany({}), FoodListing.deleteMany({})]);

  const passwordHash = await bcrypt.hash('password123', 10);

  const admin = await User.create({
    name: 'Platform Admin',
    email: 'admin@foodbridge.app',
    passwordHash,
    role: 'admin',
    orgName: 'FoodBridge HQ',
    orgType: 'other',
    location: { lat: 28.6139, lng: 77.209 },
    verified: true,
  });

  const donors = await User.insertMany([
    {
      name: 'Rahul Mehta',
      email: 'donor1@foodbridge.app',
      passwordHash,
      role: 'donor',
      orgName: 'Spice Route Restaurant',
      orgType: 'restaurant',
      phone: '9990001111',
      address: 'Connaught Place, New Delhi',
      location: { lat: 28.6315, lng: 77.2167 },
      verified: true,
      emailVerified: true,
      businessRegNumber: '12318997000123',
      proofType: 'business_licence',
    },
    {
      name: 'Anita Sharma',
      email: 'donor2@foodbridge.app',
      passwordHash,
      role: 'donor',
      orgName: 'Grand Palace Hotel',
      orgType: 'hotel',
      phone: '9990002222',
      address: 'Karol Bagh, New Delhi',
      location: { lat: 28.6519, lng: 77.1909 },
      verified: true,
      emailVerified: true,
      businessRegNumber: '12318997000456',
      proofType: 'business_licence',
    },
    {
      name: 'Vikram Caterers',
      email: 'donor3@foodbridge.app',
      passwordHash,
      role: 'donor',
      orgName: 'Vikram Event Caterers',
      orgType: 'caterer',
      phone: '9990003333',
      address: 'Rohini, New Delhi',
      location: { lat: 28.7041, lng: 77.1025 },
      verified: false, // pending document review, for admin dashboard demo
      emailVerified: true,
      proofType: 'business_licence',
    },
    {
      // Demo of the "informal donor, no business paperwork" case — verifies
      // with a personal government ID instead of a licence, exactly the
      // scenario the proofType field exists for.
      name: 'Sunita Devi',
      email: 'donor4@foodbridge.app',
      passwordHash,
      role: 'donor',
      orgName: "Sunita's Home Kitchen",
      orgType: 'restaurant',
      phone: '9990004444',
      address: 'Lajpat Nagar, New Delhi',
      location: { lat: 28.5677, lng: 77.2431 },
      verified: false, // pending document review, for admin dashboard demo
      emailVerified: true,
      proofType: 'government_id',
    },
  ]);

  const ngos = await User.insertMany([
    {
      name: 'Suresh Kumar',
      email: 'ngo1@foodbridge.app',
      passwordHash,
      role: 'ngo',
      orgName: 'Umeed Shelter Home',
      orgType: 'shelter',
      phone: '9990004444',
      address: 'Paharganj, New Delhi',
      location: { lat: 28.6448, lng: 77.2167 },
      verified: true,
      dailyCapacityKg: 15,
    },
    {
      name: 'Priya Singh',
      email: 'ngo2@foodbridge.app',
      passwordHash,
      role: 'ngo',
      orgName: 'Annapurna Community Kitchen',
      orgType: 'community_kitchen',
      phone: '9990005555',
      address: 'Rajouri Garden, New Delhi',
      location: { lat: 28.6469, lng: 77.1201 },
      verified: true,
      dailyCapacityKg: 25,
    },
    {
      name: 'Feeding Hands NGO',
      email: 'ngo3@foodbridge.app',
      passwordHash,
      role: 'ngo',
      orgName: 'Feeding Hands Foundation',
      orgType: 'ngo',
      phone: '9990006666',
      address: 'Model Town, New Delhi',
      location: { lat: 28.7128, lng: 77.1913 },
      verified: false, // pending verification, for admin dashboard demo
      dailyCapacityKg: 10,
    },
  ]);

  const now = Date.now();
  await FoodListing.create([
    {
      donor: donors[0]._id,
      foodType: 'Cooked North Indian meals',
      description: '25 servings of dal, rice, and sabzi from today\'s buffet',
      quantityKg: 12,
      expiryAt: new Date(now + 3 * 60 * 60 * 1000),
      pickupLocation: { address: 'Connaught Place, New Delhi', lat: 28.6315, lng: 77.2167 },
      status: 'posted',
    },
    {
      donor: donors[1]._id,
      foodType: 'Bakery items & bread',
      description: 'Leftover bread, pastries from banquet event',
      quantityKg: 8,
      expiryAt: new Date(now + 10 * 60 * 60 * 1000),
      pickupLocation: { address: 'Karol Bagh, New Delhi', lat: 28.6519, lng: 77.1909 },
      status: 'posted',
    },
    {
      donor: donors[2]._id,
      foodType: 'Packaged wedding function food',
      description: 'Surplus from a 500-guest wedding, sealed containers',
      quantityKg: 40,
      expiryAt: new Date(now + 5 * 60 * 60 * 1000),
      pickupLocation: { address: 'Rohini, New Delhi', lat: 28.7041, lng: 77.1025 },
      status: 'claimed',
      claimedBy: ngos[1]._id,
      claimedAt: new Date(now - 60 * 60 * 1000),
    },
    {
      donor: donors[0]._id,
      foodType: 'Rice & curry batch',
      description: 'Yesterday\'s prep, still within safe window',
      quantityKg: 15,
      expiryAt: new Date(now - 2 * 60 * 60 * 1000), // already delivered historically
      pickupLocation: { address: 'Connaught Place, New Delhi', lat: 28.6315, lng: 77.2167 },
      status: 'delivered',
      claimedBy: ngos[0]._id,
      claimedAt: new Date(now - 20 * 60 * 60 * 1000),
      pickedUpAt: new Date(now - 18 * 60 * 60 * 1000),
      deliveredAt: new Date(now - 17 * 60 * 60 * 1000),
    },
  ]);

  console.log('Seeding historical listings for demand-prediction demo...');
  // Backdated, delivered listings clustered around CP and Karol Bagh at recurring
  // day/time patterns (lunch rush near CP, dinner near Karol Bagh) — enough of a
  // signal for the heuristic hotspot aggregation to surface something real.
  const historicalSpecs = [];
  for (let week = 0; week < 6; week++) {
    historicalSpecs.push(
      { donor: donors[0], hoursAgo: week * 168 + (168 - 13), lat: 28.6315, lng: 77.2167, addr: 'Connaught Place, New Delhi', kg: 10 + (week % 3) },
      { donor: donors[0], hoursAgo: week * 168 + (168 - 37), lat: 28.6321, lng: 77.2172, addr: 'Connaught Place, New Delhi', kg: 9 + (week % 2) },
      { donor: donors[1], hoursAgo: week * 168 + (168 - 20), lat: 28.6519, lng: 77.1909, addr: 'Karol Bagh, New Delhi', kg: 14 + (week % 4) },
      { donor: donors[1], hoursAgo: week * 168 + (168 - 44), lat: 28.6524, lng: 77.1901, addr: 'Karol Bagh, New Delhi', kg: 11 + (week % 3) }
    );
  }

  const historicalDocs = historicalSpecs.map((spec) => {
    const createdAt = new Date(now - spec.hoursAgo * 60 * 60 * 1000);
    return {
      donor: spec.donor._id,
      foodType: 'Surplus cooked meals',
      description: 'Historical demo listing for demand prediction',
      quantityKg: spec.kg,
      expiryAt: new Date(createdAt.getTime() + 4 * 60 * 60 * 1000),
      pickupLocation: { address: spec.addr, lat: spec.lat, lng: spec.lng },
      status: 'delivered',
      claimedBy: ngos[Math.random() > 0.5 ? 0 : 1]._id,
      claimedAt: new Date(createdAt.getTime() + 20 * 60 * 1000),
      pickedUpAt: new Date(createdAt.getTime() + 50 * 60 * 1000),
      deliveredAt: new Date(createdAt.getTime() + 90 * 60 * 1000),
    };
  });

  const inserted = await FoodListing.insertMany(historicalDocs);
  // insertMany runs the schema's timestamp hooks on insert, which stamp createdAt as "now" —
  // overwrite it directly so the historical spread actually lands on the intended dates.
  await Promise.all(
    inserted.map((doc, i) =>
      FoodListing.updateOne({ _id: doc._id }, { $set: { createdAt: new Date(now - historicalSpecs[i].hoursAgo * 60 * 60 * 1000) } })
    )
  );

  console.log('Seed complete.');
  console.log('Login with any of these (password: password123):');
  console.log('  admin@foodbridge.app (admin)');
  console.log('  donor1@foodbridge.app / donor2@foodbridge.app (verified) / donor3@foodbridge.app / donor4@foodbridge.app (both pending doc review — donor4 is the informal/personal-ID case)');
  console.log('  ngo1@foodbridge.app / ngo2@foodbridge.app (verified) / ngo3@foodbridge.app (pending)');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
