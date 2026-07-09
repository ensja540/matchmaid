// Non-destructive, idempotent: fold the Selwyn and Waimakariri districts into
// Christchurch. We present greater Christchurch as one area, so every
// Canterbury suburb now sits under a single territorial authority.
//
// This also normalises the historical mix of values ('Christchurch' vs
// 'Christchurch City', 'Selwyn' vs 'Selwyn District') that earlier seed
// scripts wrote.
import { query } from './db.js';

const before = await query(
  `select territorial_authority as ta, count(*)::int as n
     from suburbs where region = 'Canterbury' group by 1 order by 1`
);
console.log('Before:');
console.table(before.rows);

const r = await query(
  `update suburbs set territorial_authority = 'Christchurch City'
    where region = 'Canterbury' and territorial_authority is distinct from 'Christchurch City'`
);

const after = await query(
  `select territorial_authority as ta, count(*)::int as n
     from suburbs where region = 'Canterbury' group by 1 order by 1`
);
console.log(`\nUpdated ${r.rowCount} row(s).\n\nAfter:`);
console.table(after.rows);
process.exit(0);
