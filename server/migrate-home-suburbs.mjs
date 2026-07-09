// Non-destructive, idempotent: add pets/storeys to client_profiles and make
// sure every suburb from the location picker exists in the suburbs table
// (areas/matching resolve by suburb name, so unknown names would be dropped).
import { query } from './db.js';

await query('alter table client_profiles add column if not exists has_pets boolean default false');
await query('alter table client_profiles add column if not exists storeys text');

const towns = {
  // Greater Christchurch: the city plus the surrounding Selwyn/Waimakariri
  // towns, which we present as one area rather than separate districts.
  Christchurch: [
    'Addington', 'Aidanfield', 'Aranui', 'Avonhead', 'Avonside', 'Barrington',
    'Beckenham', 'Belfast', 'Bexley', 'Bishopdale', 'Bromley', 'Brooklands',
    'Bryndwr', 'Burnside', 'Burwood', 'Casebrook', 'Cashmere', 'Clifton',
    'Cracroft', 'Cust', 'Dallington', 'Darfield', 'Diamond Harbour',
    'Edgeware', 'Fendalton', 'Ferrymead', 'Governors Bay', 'Halswell',
    'Harewood', 'Heathcote Valley', 'Hei Hei', 'Hillmorton', 'Hoon Hay',
    'Hornby', 'Huntsbury', 'Ilam', 'Islington', 'Kaiapoi', 'Leeston',
    'Lincoln', 'Linwood', 'Lyttelton', 'Mairehau', 'Marshland', 'Merivale',
    'Middleton', 'Mount Pleasant', 'New Brighton', 'North New Brighton',
    'Northwood', 'Ohoka', 'Opawa', 'Oxford', 'Papanui', 'Parklands',
    'Pegasus', 'Phillipstown', 'Prebbleton', 'Prestons', 'Rangiora',
    'Redcliffs', 'Redwood', 'Riccarton', 'Richmond', 'Rolleston', 'Russley',
    'Shirley', 'Sockburn', 'Somerfield', 'South New Brighton', 'Spreydon',
    'Springston', 'St Albans', 'St Martins', 'Strowan', 'Sumner',
    'Swannanoa', 'Sydenham', 'Tai Tapu', 'Templeton', 'Upper Riccarton',
    'Waimairi Beach', 'Wainoni', 'Waltham', 'West Melton', 'Westmorland',
    'Wigram', 'Woodend', 'Woolston', 'Yaldhurst',
  ],
  Auckland: [
    'Albany', 'Avondale', 'Balmoral', 'Beach Haven', 'Birkenhead',
    'Blockhouse Bay', 'Botany Downs', 'Browns Bay', 'Bucklands Beach',
    'Clendon Park', 'Clevedon', 'Cockle Bay', 'Dannemora', 'Devonport',
    'Drury', 'East Tamaki', 'Eden Terrace', 'Ellerslie', 'Epsom', 'Favona',
    'Flat Bush', 'Forrest Hill', 'Freemans Bay', 'Glen Eden', 'Glen Innes',
    'Glendene', 'Glendowie', 'Glenfield', 'Grafton', 'Greenlane', 'Grey Lynn',
    'Half Moon Bay', 'Henderson', 'Herne Bay', 'Hillsborough', 'Hobsonville',
    'Howick', 'Huapai', 'Kelston', 'Kingsland', 'Kohimarama', 'Kumeu',
    'Lynfield', 'Mairangi Bay', 'Mangere', 'Mangere Bridge', 'Mangere East',
    'Manukau', 'Manurewa', 'Massey', 'Meadowbank', 'Mellons Bay', 'Milford',
    'Millwater', 'Mission Bay', 'Morningside', 'Mount Albert', 'Mount Eden',
    'Mount Roskill', 'Mount Wellington', 'Murrays Bay', 'Narrow Neck',
    'New Lynn', 'New Windsor', 'Newmarket', 'Newton', 'Northcote',
    'Northcross', 'Onehunga', 'Orewa', 'Otahuhu', 'Otara', 'Oteha',
    'Pahurehure', 'Pakuranga', 'Panmure', 'Papakura', 'Papatoetoe', 'Parnell',
    'Penrose', 'Pinehill', 'Point Chevalier', 'Ponsonby', 'Pukekohe', 'Ranui',
    'Remuera', 'Rosedale', 'Rothesay Bay', 'Royal Oak', 'Sandringham',
    'Silverdale', 'Snells Beach', 'St Heliers', 'St Johns', 'St Lukes',
    'Stanmore Bay', 'Stonefields', 'Sunnynook', 'Sunnyvale', 'Swanson',
    'Takapuna', 'Te Atatu Peninsula', 'Te Atatu South', 'Three Kings',
    'Titirangi', 'Torbay', 'Totara Heights', 'Unsworth Heights', 'Waitakere',
    'Waiuku', 'Wattle Downs', 'Wellsford', 'West Harbour', 'Western Springs',
    'Westgate', 'Westmere', 'Whangaparaoa', 'Whenuapai', 'Windsor Park',
    'Wiri',
  ],
};

const REGION = { Christchurch: 'Canterbury', Auckland: 'Auckland' };
let added = 0;
for (const [town, subs] of Object.entries(towns)) {
  for (const name of subs) {
    const r = await query(
      `insert into suburbs (name, region, territorial_authority)
       select $1, $2, $3 where not exists (select 1 from suburbs where name = $1)`,
      [name, REGION[town], town]
    );
    added += r.rowCount || 0;
  }
}
const total = await query('select count(*) from suburbs');
console.log(`Suburbs ensured: +${added} new, ${total.rows[0].count} total.`);
process.exit(0);
