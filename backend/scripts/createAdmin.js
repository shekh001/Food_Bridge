#!/usr/bin/env node
/**
 * Bootstraps the FIRST admin account for a real deployment.
 *
 * Why this exists separately from seed.js:
 *   seed.js is a DEMO script — it wipes the whole database and creates an
 *   admin with a well-known password (password123). That's fine for local
 *   dev/grading, but must never touch a production database.
 *
 * Why this exists separately from "Promote to admin" in the app:
 *   Promoting a user to admin (PATCH /api/admin/users/:id/promote) requires
 *   an ALREADY-LOGGED-IN admin to call it. The very first admin can't exist
 *   that way — this script is the one-time bootstrap that breaks the
 *   chicken-and-egg problem. Once you have one admin, do everything else
 *   (adding more admins, verifying NGOs) from the app itself.
 *
 * Usage:
 *   Interactive (recommended):  node scripts/createAdmin.js
 *   Non-interactive (CI/deploy hooks — e.g. Render's post-deploy command):
 *     ADMIN_NAME="Ops Lead" ADMIN_EMAIL="you@org.com" ADMIN_ORG_NAME="FoodBridge Ops" \
 *     ADMIN_PASSWORD="a strong unique password" node scripts/createAdmin.js
 *
 * Safety:
 *   - Does NOT touch or delete any existing data (unlike seed.js).
 *   - Refuses to run if the email is already registered.
 *   - Enforces a real password policy instead of accepting "password123".
 *   - Masks password input in the terminal instead of echoing it in plaintext.
 */

require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePassword(pw) {
  const problems = [];
  if (pw.length < 10) problems.push('at least 10 characters');
  if (!/[a-z]/.test(pw)) problems.push('a lowercase letter');
  if (!/[A-Z]/.test(pw)) problems.push('an uppercase letter');
  if (!/[0-9]/.test(pw)) problems.push('a number');
  if (!/[^A-Za-z0-9]/.test(pw)) problems.push('a special character');
  const common = ['password', 'password123', 'admin123', '12345678', 'qwerty123'];
  if (common.includes(pw.toLowerCase())) problems.push('not be a well-known weak password');
  return problems;
}

function ask(query, { hidden = false } = {}) {
  return new Promise((resolve) => {
    if (!hidden) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(query, (answer) => { rl.close(); resolve(answer.trim()); });
      return;
    }

    // Masked input: falls back to plain (visible) input if stdin isn't a real
    // TTY (e.g. piped input in some CI runners) — raw mode requires a TTY.
    if (!process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(query, (answer) => { rl.close(); resolve(answer.trim()); });
      return;
    }

    process.stdout.write(query);
    process.stdin.resume();
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');

    let input = '';
    const onData = (char) => {
      if (char === '\n' || char === '\r' || char === '\u0004') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input.trim());
      } else if (char === '\u0003') {
        process.stdout.write('\n');
        process.exit(1);
      } else if (char === '\u007f' || char === '\b') {
        if (input.length) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        input += char;
        process.stdout.write('*');
      }
    };
    process.stdin.on('data', onData);
  });
}

async function collectViaPrompts() {
  console.log('\n=== FoodBridge \u2014 create the first production admin ===\n');

  let email = '';
  while (!EMAIL_RE.test(email)) {
    email = await ask('Admin email: ');
    if (!EMAIL_RE.test(email)) console.log('  \u2717 That doesn\u2019t look like a valid email. Try again.');
  }

  const name = (await ask('Admin full name [Platform Admin]: ')) || 'Platform Admin';
  const orgName = (await ask('Organization name [FoodBridge Operations]: ')) || 'FoodBridge Operations';

  let password = '';
  for (;;) {
    password = await ask('Admin password (hidden): ', { hidden: true });
    const problems = validatePassword(password);
    if (problems.length === 0) break;
    console.log(`  \u2717 Password must have: ${problems.join(', ')}.`);
  }
  const confirm = await ask('Confirm password (hidden): ', { hidden: true });
  if (confirm !== password) {
    console.log('\n\u2717 Passwords did not match. Run the script again.');
    process.exit(1);
  }

  return { email, name, orgName, password };
}

function collectFromEnv() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, ADMIN_ORG_NAME } = process.env;
  if (!EMAIL_RE.test(ADMIN_EMAIL || '')) {
    console.error('\u2717 ADMIN_EMAIL is missing or invalid.');
    process.exit(1);
  }
  const problems = validatePassword(ADMIN_PASSWORD || '');
  if (problems.length) {
    console.error(`\u2717 ADMIN_PASSWORD is too weak \u2014 needs: ${problems.join(', ')}.`);
    process.exit(1);
  }
  return {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    name: ADMIN_NAME || 'Platform Admin',
    orgName: ADMIN_ORG_NAME || 'FoodBridge Operations',
  };
}

async function main() {
  await connectDB();

  const nonInteractive = !!(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
  const { email, name, orgName, password } = nonInteractive ? collectFromEnv() : await collectViaPrompts();

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.error(`\n\u2717 An account with ${email} already exists (role: ${existing.role}). Refusing to overwrite it.`);
    console.error('  If you meant to promote it to admin, log in as an existing admin and use');
    console.error('  the "Promote to admin" action in the Admin Dashboard instead.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash,
    role: 'admin',
    orgName,
    orgType: 'other',
    // Default location: New Delhi. Harmless for an admin account (never used
    // for matching), but the schema requires *some* value.
    location: { lat: 28.6139, lng: 77.209 },
    verified: true,
  });

  console.log(`\n\u2713 Admin account created: ${admin.email} (id: ${admin._id})`);
  console.log('  Log in at /login with this email and the password you just set.');
  console.log('  Add any further admins from inside the app (Admin Dashboard \u2192 Promote to admin) \u2014');
  console.log('  there\u2019s no need to run this bootstrap script again.\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('\nUnexpected error while creating the admin account:', err.message);
  process.exit(1);
});
