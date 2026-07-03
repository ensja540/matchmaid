// Non-destructive, idempotent: add pets/storeys to client_profiles and make
// sure every suburb from the location picker exists in the suburbs table
// (areas/matching resolve by suburb name, so unknown names would be dropped).
import { query } from './db.js';

await query('alter table client_profiles add column if not exists has_pets boolean default false');
await query('alter table client_profiles add column if not exists storeys text');

const towns = {
  Christchurch: [
    'Addington', 'Aidanfield', 'Aranui', 'Avonhead', 'Avonside', 'Barrington',
    'Beckenham', 'Belfast', 'Bexley', 'Bishopdale', 'Bromley', 'Brooklands',
    'Bryndwr', 'Burnside', 'Burwood', 'Casebrook', 'Cashmere', 'Clifton',
    'Cracroft', 'Dallington', 'Diamond Harbour', 'Edgeware', 'Fendalton',
    'Ferrymead', 'Governors Bay', 'Halswell', 'Harewood', 'Heathcote Valley',
    'Hei Hei', 'Hillmorton', 'Hoon Hay', 'Hornby', 'Huntsbury', 'Ilam',
    'Islington', 'Linwood', 'Lyttelton', 'Mairehau', 'Marshland', 'Merivale',
    'Middleton', 'Mount Pleasant', 'New Brighton', 'North New Brighton',
    'Northwood', 'Opawa', 'Papanui', 'Parklands', 'Phillipstown', 'Prestons',
    'Redcliffs', 'Redwood', 'Riccarton', 'Richmond', 'Russley', 'Shirley',
    'Sockburn', 'Somerfield', 'South New Brighton', 'Spreydon', 'St Albans',
    'St Martins', 'Strowan', 'Sumner', 'Sydenham', 'Templeton',
    'Upper Riccarton', 'Waimairi Beach', 'Wainoni', 'Waltham', 'Westmorland',
    'Wigram', 'Woolston', 'Yaldhurst',
  ],
  Auckland: [
    'Albany', 'Avondale', 'Balmoral', 'Birkenhead', 'Botany Downs', 'Browns Bay',
    'Devonport', 'Ellerslie', 'Epsom', 'Glen Eden', 'Glen Innes', 'Glenfield',
    'Grafton', 'Greenlane', 'Grey Lynn', 'Henderson', 'Herne Bay', 'Howick',
    'Kingsland', 'Mangere', 'Manukau', 'Manurewa', 'Massey', 'Meadowbank',
    'Milford', 'Mission Bay', 'Mount Albert', 'Mount Eden', 'Mount Roskill',
    'Mount Wellington', 'New Lynn', 'Newmarket', 'Onehunga', 'Orewa', 'Otahuhu',
    'Pakuranga', 'Panmure', 'Papakura', 'Parnell', 'Point Chevalier', 'Ponsonby',
    'Ranui', 'Remuera', 'Sandringham', 'St Heliers', 'Takapuna', 'Titirangi',
    'Torbay', 'Waiuku', 'Westmere', 'Whangaparaoa',
  ],
  Selwyn: ['Rolleston', 'Lincoln', 'Prebbleton', 'West Melton', 'Leeston', 'Darfield', 'Springston', 'Tai Tapu'],
  Waimakariri: ['Rangiora', 'Kaiapoi', 'Woodend', 'Pegasus', 'Oxford', 'Cust', 'Ohoka', 'Swannanoa'],
};

const REGION = { Christchurch: 'Canterbury', Selwyn: 'Canterbury', Waimakariri: 'Canterbury', Auckland: 'Auckland' };
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
