// Tell every cleaner listed below their country's price floor that their
// listing has come off the directory, and ask them to set a real rate.
//
//   cd server && node notify-underpriced.mjs            # report only
//   cd server && node notify-underpriced.mjs --send     # actually send
//
// The rule itself lives in underpriced.mjs, shared with the
// /api/tasks/underpriced-notices endpoint - which is how this gets run on
// Render, whose free tier has no shell. This file is just the command line over
// it, for anyone who does have one.
//
// Dry by default: sending mail to real people should need saying out loud, and
// the report alone answers "who is affected" most times this is run.
import { pool } from './db.js';
import { notifyUnderpriced } from './underpriced.mjs';

const send = process.argv.includes('--send');
const report = await notifyUnderpriced({ send });

if (!report.found) {
  console.log('No listing is priced below its floor. Nothing to do.');
  await pool.end();
  process.exit(0);
}

console.log(`${report.found} listing(s) below the floor:\n`);
for (const r of report.listings) {
  console.log(
    `  ${r.name} <${r.email}> — $${r.rate}/hr ` +
      `(${r.country} floor $${r.floor}, listing ${r.listingStatus})` +
      (r.alreadyTold ? ' — already emailed, skipping' : '')
  );
}

if (report.dryRun) {
  console.log(`\nDry run. ${report.pending} would be emailed. Re-run with --send to do it.`);
} else if (report.error) {
  console.error(`\n${report.error} Aborted.`);
  await pool.end();
  process.exit(1);
} else {
  console.log(`\n${report.sent} of ${report.pending} emailed.`);
  for (const f of report.failed) console.error(`  FAILED for ${f.email}:`, f.res);
}

await pool.end();
