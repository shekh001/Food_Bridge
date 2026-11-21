const PDFDocument = require('pdfkit');
const FoodListing = require('../models/FoodListing');

// GET /api/certificates/:listingId  -> streams a PDF donation certificate
// FREE for every donor — the single-donation certificate stays free forever;
// it's the trust-building hook, not the monetization lever.
exports.generateCertificate = async (req, res) => {
  try {
    const listing = await FoodListing.findById(req.params.listingId)
      .populate('donor', 'orgName orgType')
      .populate('claimedBy', 'orgName orgType');

    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    if (listing.status !== 'delivered') {
      return res.status(400).json({ message: 'Certificate is available only after delivery is confirmed' });
    }

    const isDonor = String(listing.donor._id) === String(req.user._id);
    if (!isDonor && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only the donating organization can download this certificate' });
    }

    const meals = Math.round(listing.quantityKg * 2.5);
    const co2 = Math.round(listing.quantityKg * 2.5);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=FoodBridge-Certificate-${listing._id}.pdf`);

    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    doc.pipe(res);

    doc.fontSize(22).fillColor('#2F6F4E').text('FoodBridge', { align: 'center' });
    doc.fontSize(12).fillColor('#555').text('Certificate of Food Donation', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(11).fillColor('#111');
    doc.text('This certifies that', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(18).fillColor('#2F6F4E').text(listing.donor.orgName, { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(11).fillColor('#111').text(
      `donated ${listing.quantityKg} kg of surplus food ("${listing.foodType}") through the FoodBridge platform, ` +
      `which was received by ${listing.claimedBy ? listing.claimedBy.orgName : 'a verified recipient organization'} ` +
      `on ${listing.deliveredAt ? listing.deliveredAt.toDateString() : new Date().toDateString()}.`,
      { align: 'center' }
    );

    doc.moveDown(2);
    doc.fontSize(12).fillColor('#333').text(`Estimated meals provided: ${meals}`, { align: 'center' });
    doc.text(`Estimated CO2-equivalent emissions avoided: ${co2} kg`, { align: 'center' });

    doc.moveDown(3);
    doc.fontSize(9).fillColor('#888').text(
      'This certificate may be used for internal CSR reporting. Estimates are computed using standard ' +
      'food-rescue conversion factors (2.5 meals/kg, 2.5 kg CO2e/kg diverted).',
      { align: 'center' }
    );
    doc.moveDown(1);
    doc.text(`Certificate ID: ${listing._id}`, { align: 'center' });
    doc.text(`Issued: ${new Date().toDateString()}`, { align: 'center' });

    doc.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/certificates/csr-report?from=YYYY-MM-DD&to=YYYY-MM-DD  (donor, Pro plan only)
// Consolidated, branded, multi-donation CSR report — the paid tier. Individual
// certificates are free and always will be; this is the aggregate, audit-ready
// document a corporate CSR/tax team actually files, which is what donors pay for.
exports.generateCsrReport = async (req, res) => {
  try {
    if (req.user.role !== 'donor') return res.status(403).json({ message: 'Only donor accounts can generate CSR reports' });
    if (req.user.plan !== 'pro') {
      return res.status(402).json({ message: 'Consolidated CSR reports are a Pro feature — upgrade to unlock.' });
    }

    const from = req.query.from ? new Date(req.query.from) : new Date(0);
    const to = req.query.to ? new Date(req.query.to) : new Date();

    const listings = await FoodListing.find({
      donor: req.user._id,
      status: 'delivered',
      deliveredAt: { $gte: from, $lte: to },
    })
      .populate('claimedBy', 'orgName orgType')
      .sort({ deliveredAt: 1 });

    if (listings.length === 0) {
      return res.status(404).json({ message: 'No delivered donations found in this date range.' });
    }

    const totalKg = listings.reduce((sum, l) => sum + l.quantityKg, 0);
    const totalMeals = Math.round(totalKg * 2.5);
    const totalCo2 = Math.round(totalKg * 2.5);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=FoodBridge-CSR-Report-${req.user._id}.pdf`);

    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    doc.pipe(res);

    doc.fontSize(22).fillColor('#2F6F4E').text('FoodBridge', { align: 'center' });
    doc.fontSize(12).fillColor('#555').text('Consolidated CSR Impact Report', { align: 'center' });
    doc.fontSize(9).fillColor('#999').text(
      `${from.toDateString()} — ${to.toDateString()}`, { align: 'center' }
    );
    doc.moveDown(2);

    doc.fontSize(14).fillColor('#111').text(req.user.orgName, { align: 'center' });
    doc.moveDown(1.5);

    // Summary stats block
    doc.fontSize(11).fillColor('#333');
    doc.text(`Total donations delivered: ${listings.length}`, { align: 'center' });
    doc.text(`Total food diverted: ${totalKg} kg`, { align: 'center' });
    doc.text(`Estimated meals provided: ${totalMeals}`, { align: 'center' });
    doc.text(`Estimated CO2-equivalent emissions avoided: ${totalCo2} kg`, { align: 'center' });
    doc.moveDown(2);

    // Itemized table
    doc.fontSize(12).fillColor('#2F6F4E').text('Itemized donations', { underline: false });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#111');
    listings.forEach((l, i) => {
      doc.text(
        `${i + 1}. ${l.deliveredAt.toDateString()} — ${l.foodType} — ${l.quantityKg}kg — ` +
        `received by ${l.claimedBy ? l.claimedBy.orgName : 'a verified recipient'}`
      );
    });

    doc.moveDown(2);
    doc.fontSize(9).fillColor('#888').text(
      'Prepared for CSR / tax compliance reporting. Estimates use standard food-rescue conversion ' +
      'factors (2.5 meals/kg, 2.5 kg CO2e/kg diverted). This is a FoodBridge Pro feature.',
      { align: 'center' }
    );
    doc.text(`Report generated: ${new Date().toDateString()}`, { align: 'center' });

    doc.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
