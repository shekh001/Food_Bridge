const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — plenty for a scanned certificate/photo

// --- Cloudinary (optional) --------------------------------------------
// Local disk works fine for development, but on Render's free tier the
// filesystem is wiped on every redeploy/restart — any uploaded verification
// doc, report evidence, or listing photo would be silently lost. If
// CLOUDINARY_* env vars are configured, every upload goes to Cloudinary
// instead (which survives redeploys); if not, everything falls back to
// local disk exactly as before. Same "demo unless configured" pattern this
// codebase already uses for Razorpay/VAPID/email.
function cloudinaryConfigured() {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

let cloudinary = null;
if (cloudinaryConfigured()) {
  // eslint-disable-next-line global-require
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

function resourceTypeFor(ext) {
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? 'image' : 'raw'; // PDFs (verification docs, evidence) land here
}

// One multer storage builder for all three upload types. `isPrivate` decides
// the Cloudinary delivery mode: verification docs and report evidence stay
// non-public (`type: 'authenticated'`, requires a signed URL to view) since
// they're sensitive; listing photos are plain public images (`type:
// 'upload'`) since a photo of surplus food isn't sensitive and benefits
// from being a normal, cacheable, CDN-servable URL.
//
// This talks to Cloudinary directly via `uploader.upload_stream` rather than
// through the `multer-storage-cloudinary` package — that package pins a
// peer dependency on cloudinary@^1.x, which has a known high-severity
// argument-injection advisory (GHSA-g4mf-96x5-5m2c) with no fix released
// for that major version. Implementing the small multer storage-engine
// interface (`_handleFile`/`_removeFile`) ourselves means the app can run
// on the patched cloudinary@2.x line instead of carrying that dependency.
function buildStorage(localDir, cloudFolder, { isPrivate } = {}) {
  if (cloudinary) {
    return {
      _handleFile(req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        const publicId = `foodbridge/${cloudFolder}/${req.user?.id || 'anon'}-${crypto.randomBytes(16).toString('hex')}`;
        const uploadStream = cloudinary.uploader.upload_stream(
          { public_id: publicId, resource_type: resourceTypeFor(ext), type: isPrivate ? 'authenticated' : 'upload' },
          (err, result) => {
            if (err) return cb(err);
            cb(null, {
              filename: result.public_id,
              path: result.secure_url,
              resource_type: result.resource_type,
              size: result.bytes,
            });
          }
        );
        file.stream.on('error', cb);
        uploadStream.on('error', cb);
        file.stream.pipe(uploadStream);
      },
      _removeFile(req, file, cb) {
        if (!file.filename) return cb(null);
        cloudinary.uploader
          .destroy(file.filename, { resource_type: file.resource_type || 'image', type: isPrivate ? 'authenticated' : 'upload' })
          .then(() => cb(null))
          .catch(cb);
      },
    };
  }
  fs.mkdirSync(localDir, { recursive: true });
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, localDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const randomName = crypto.randomBytes(16).toString('hex');
      // Prefixing with the user id makes orphan cleanup / auditing easier and
      // avoids any possibility of collisions across concurrent uploads.
      cb(null, `${req.user?.id || 'anon'}-${randomName}${ext}`);
    },
  });
}

// What actually gets saved to the DB field (verificationDoc / evidence[] /
// photo). Local disk: unchanged, a plain filename like before. Cloudinary: a
// small self-describing string — `cloudinary:<resource_type>:<public_id>` —
// so serving code always knows exactly how to fetch it back rather than
// guessing whether it's a PDF or an image.
function storedValueFor(file) {
  if (cloudinary && file.filename) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    return `cloudinary:${file.resource_type || resourceTypeFor(ext)}:${file.filename}`;
  }
  return file.filename;
}

function isCloudReference(storedValue) {
  return typeof storedValue === 'string' && storedValue.startsWith('cloudinary:');
}

// Given a stored value, returns a delivery URL to redirect to if it's a
// Cloudinary reference, or null if it's a local filename (serve from disk as
// before). `isPrivate` must match how the file was originally uploaded, or
// the signed-URL check will fail.
function cloudDeliveryUrl(storedValue, { isPrivate } = {}) {
  if (!isCloudReference(storedValue) || !cloudinary) return null;
  const parts = storedValue.split(':');
  const resourceType = parts[1];
  const publicId = parts.slice(2).join(':');
  return cloudinary.url(publicId, {
    resource_type: resourceType,
    type: isPrivate ? 'authenticated' : 'upload',
    sign_url: isPrivate,
    secure: true,
  });
}

// Deletes a just-uploaded file that turned out not to be needed (e.g. a
// validation check right after upload fails) — branches on where it
// actually landed instead of always assuming local disk.
function cleanupUploadedFile(file, { isPrivate } = {}) {
  if (!file) return;
  if (cloudinary && file.filename) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const resourceType = file.resource_type || resourceTypeFor(ext);
    cloudinary.uploader.destroy(file.filename, { resource_type: resourceType, type: isPrivate ? 'authenticated' : 'upload' }).catch(() => {});
    return;
  }
  if (file.path) fs.unlink(file.path, () => {});
}

function fileFilterFor(allowedMime, allowedExt, label) {
  return function fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedMime.has(file.mimetype) || !allowedExt.has(ext)) {
      const err = new Error(label);
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  };
}

const DOC_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const DOC_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// NGO registration-proof uploads (Darpan certificate, registration letter,
// etc.) — never served statically, only through the protected admin
// download route (and, on Cloudinary, only via a short-lived signed URL).
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'verification-docs');
const uploadVerificationDoc = multer({
  storage: buildStorage(UPLOAD_DIR, 'verification-docs', { isPrivate: true }),
  fileFilter: fileFilterFor(DOC_MIME, DOC_EXT, 'Only PDF, JPG, PNG, or WEBP files are accepted for verification documents.'),
  limits: { fileSize: MAX_SIZE_BYTES, files: 1 },
});

// Report evidence (photos/docs a reporter attaches to back up a dispute).
// Same private-delivery treatment as verification docs.
const EVIDENCE_DIR = path.join(__dirname, '..', '..', 'uploads', 'report-evidence');
const uploadReportEvidence = multer({
  storage: buildStorage(EVIDENCE_DIR, 'report-evidence', { isPrivate: true }),
  fileFilter: fileFilterFor(DOC_MIME, DOC_EXT, 'Only PDF, JPG, PNG, or WEBP files are accepted for report evidence.'),
  // Up to 3 files per report is plenty for "here's what happened" without
  // turning this into a bulk file-drop.
  limits: { fileSize: MAX_SIZE_BYTES, files: 3 },
});

// Listing photos (a picture of the actual surplus food a donor is posting).
// Not sensitive the way verification docs or report evidence are, so these
// stay public on Cloudinary — a normal, cacheable, CDN-served image URL.
const LISTING_PHOTO_DIR = path.join(__dirname, '..', '..', 'uploads', 'listing-photos');
const uploadListingPhoto = multer({
  storage: buildStorage(LISTING_PHOTO_DIR, 'listing-photos', { isPrivate: false }),
  fileFilter: fileFilterFor(IMAGE_MIME, IMAGE_EXT, 'Only JPG, PNG, or WEBP images are accepted for listing photos.'),
  limits: { fileSize: MAX_SIZE_BYTES, files: 1 },
});

module.exports = {
  uploadVerificationDoc, UPLOAD_DIR,
  uploadReportEvidence, EVIDENCE_DIR,
  uploadListingPhoto, LISTING_PHOTO_DIR,
  cloudinaryConfigured, storedValueFor, isCloudReference, cloudDeliveryUrl, cleanupUploadedFile,
};
