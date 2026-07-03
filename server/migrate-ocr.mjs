// Non-destructive: store OCR-extracted text alongside a submitted document.
import { query } from './db.js';
await query('alter table verifications add column if not exists extracted_text text');
console.log('verifications.extracted_text ensured.');
process.exit(0);
