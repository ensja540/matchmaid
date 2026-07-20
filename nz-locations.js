// Every NZ town and suburb, grouped region -> town -> suburbs.
// Generated - see scratchpad/nz/build.mjs. Consumed by the location pickers and
// by the launch-area check below.
//
// Names repeat across regions (Richmond, Bishopdale, Merivale, Hillsborough all
// exist in more than one), so anything that talks to the API sends the suburb
// id, never the bare name.
const NZ_LOCATIONS = {
 "Canterbury": {
  "Christchurch": [
   "Addington",
   "Aidanfield",
   "Aranui",
   "Avonhead",
   "Avonside",
   "Barrington",
   "Beckenham",
   "Belfast",
   "Bexley",
   "Bishopdale",
   "Bromley",
   "Brooklands",
   "Bryndwr",
   "Burnside",
   "Burwood",
   "Casebrook",
   "Cashmere",
   "Clifton",
   "Cracroft",
   "Cust",
   "Dallington",
   "Darfield",
   "Diamond Harbour",
   "Edgeware",
   "Fendalton",
   "Ferrymead",
   "Governors Bay",
   "Halswell",
   "Harewood",
   "Heathcote Valley",
   "Hei Hei",
   "Hillmorton",
   "Hoon Hay",
   "Hornby",
   "Huntsbury",
   "Ilam",
   "Islington",
   "Kaiapoi",
   "Leeston",
   "Lincoln",
   "Linwood",
   "Lyttelton",
   "Mairehau",
   "Marshland",
   "Merivale",
   "Middleton",
   "Mount Pleasant",
   "New Brighton",
   "North New Brighton",
   "Northwood",
   "Ohoka",
   "Opawa",
   "Oxford",
   "Papanui",
   "Parklands",
   "Pegasus",
   "Phillipstown",
   "Prebbleton",
   "Prestons",
   "Rangiora",
   "Redcliffs",
   "Redwood",
   "Riccarton",
   "Richmond",
   "Rolleston",
   "Russley",
   "Shirley",
   "Sockburn",
   "Somerfield",
   "South New Brighton",
   "Spreydon",
   "Springston",
   "St Albans",
   "St Martins",
   "Strowan",
   "Sumner",
   "Swannanoa",
   "Sydenham",
   "Tai Tapu",
   "Templeton",
   "Upper Riccarton",
   "Waimairi Beach",
   "Wainoni",
   "Waltham",
   "West Melton",
   "Westmorland",
   "Wigram",
   "Woodend",
   "Woolston",
   "Yaldhurst"
  ],
  "Kaikoura": [],
  "Clarence": [],
  "Kekerengu": [],
  "Hapuku": [],
  "Peketa": [],
  "Goose Bay": [],
  "Oaro": [],
  "Mt Lyford": [],
  "Parnassus": [],
  "Cheviot": [],
  "Gore Bay": [],
  "Domett": [],
  "Greta Valley": [],
  "Motunau Beach": [],
  "Scargill": [],
  "Waiau": [],
  "Rotherham": [],
  "Culverden": [],
  "Hanmer Springs": [],
  "Hawarden": [],
  "Waikari": [],
  "Omihi": [],
  "Waipara": [],
  "Amberley": [],
  "Leithfield": [],
  "Leithfield Beach": [],
  "Sefton": [],
  "Ashley": [],
  "Loburn": [],
  "Tuahiwi": [],
  "Clarkville": [],
  "Kairaki": [],
  "The Pines Beach": [],
  "Woodend Beach": [],
  "Ravenswood": [],
  "Waikuku": [],
  "Waikuku Beach": [],
  "Fernside": [],
  "View Hill": [],
  "West Eyreton": [],
  "Eyrewell": [],
  "Weedons": [],
  "Burnham": [],
  "Ladbrooks": [],
  "Motukarara": [],
  "Greenpark": [],
  "Doyleston": [],
  "Southbridge": [],
  "Dunsandel": [],
  "Selwyn Huts": [],
  "Kirwee": [],
  "Charing Cross": [],
  "Aylesbury": [],
  "Sheffield": [],
  "Waddington": [],
  "Springfield": [],
  "Castle Hill": [],
  "Arthurs Pass": [],
  "Coalgate": [],
  "Glentunnel": [],
  "Whitecliffs": [],
  "Hororata": [],
  "Windwhistle": [],
  "Lake Coleridge": [],
  "Little River": [],
  "Birdlings Flat": [],
  "Akaroa": [],
  "Duvauchelle": [],
  "Takamatua": [],
  "Barrys Bay": [],
  "Wainui": [],
  "Okains Bay": [],
  "Le Bons Bay": [],
  "Little Akaloa": [],
  "Pigeon Bay": [],
  "Port Levy": [],
  "Rakaia": [],
  "Rakaia Huts": [],
  "Barrhill": [],
  "Methven": [],
  "Mount Somers": [],
  "Staveley": [],
  "Springburn": [],
  "Mayfield": [],
  "Ashburton": [
   "Ashburton",
   "Allenton",
   "Hampstead",
   "Netherby",
   "Tinwald"
  ],
  "Fairton": [],
  "Winslow": [],
  "Dromore": [],
  "Chertsey": [],
  "Lauriston": [],
  "Willowby": [],
  "Wakanui": [],
  "Seafield": [],
  "Longbeach": [],
  "Hinds": [],
  "Ealing": [],
  "Lowcliffe": [],
  "Rangitata": [],
  "Orari": [],
  "Arundel": [],
  "Geraldine": [],
  "Woodbury": [],
  "Peel Forest": [],
  "Winchester": [],
  "Temuka": [],
  "Clandeboye": [],
  "Pleasant Point": [],
  "Cave": [],
  "Timaru": [
   "Timaru",
   "Fairview",
   "Gleniti",
   "Glenwood",
   "Highfield",
   "Maori Hill",
   "Marchwiel",
   "Parkside",
   "Redruth",
   "Seaview",
   "Waimataitai",
   "Washdyke",
   "Watlington",
   "West End"
  ],
  "Seadown": [],
  "Levels": [],
  "Pareora": [],
  "St Andrews": [],
  "Makikihi": [],
  "Albury": [],
  "Fairlie": [],
  "Kimbell": [],
  "Burkes Pass": [],
  "Tekapo": [],
  "Twizel": [],
  "Mount Cook Village": [],
  "Waimate": [],
  "Hook": [],
  "Studholme": [],
  "Morven": [],
  "Glenavy": []
 },
 "Auckland": {
  "Auckland": [
   "Albany",
   "Avondale",
   "Balmoral",
   "Beach Haven",
   "Birkenhead",
   "Blockhouse Bay",
   "Botany Downs",
   "Browns Bay",
   "Bucklands Beach",
   "Clendon Park",
   "Clevedon",
   "Cockle Bay",
   "Dannemora",
   "Devonport",
   "Drury",
   "East Tamaki",
   "Eden Terrace",
   "Ellerslie",
   "Epsom",
   "Favona",
   "Flat Bush",
   "Forrest Hill",
   "Freemans Bay",
   "Glen Eden",
   "Glen Innes",
   "Glendene",
   "Glendowie",
   "Glenfield",
   "Grafton",
   "Greenlane",
   "Grey Lynn",
   "Half Moon Bay",
   "Henderson",
   "Herne Bay",
   "Hillsborough",
   "Hobsonville",
   "Howick",
   "Huapai",
   "Kelston",
   "Kingsland",
   "Kohimarama",
   "Kumeu",
   "Lynfield",
   "Mairangi Bay",
   "Mangere",
   "Mangere Bridge",
   "Mangere East",
   "Manukau",
   "Manurewa",
   "Massey",
   "Meadowbank",
   "Mellons Bay",
   "Milford",
   "Millwater",
   "Mission Bay",
   "Morningside",
   "Mount Albert",
   "Mount Eden",
   "Mount Roskill",
   "Mount Wellington",
   "Murrays Bay",
   "Narrow Neck",
   "New Lynn",
   "New Windsor",
   "Newmarket",
   "Newton",
   "Northcote",
   "Northcross",
   "Onehunga",
   "Orewa",
   "Otahuhu",
   "Otara",
   "Oteha",
   "Pahurehure",
   "Pakuranga",
   "Panmure",
   "Papakura",
   "Papatoetoe",
   "Parnell",
   "Penrose",
   "Pinehill",
   "Point Chevalier",
   "Ponsonby",
   "Pukekohe",
   "Ranui",
   "Remuera",
   "Rosedale",
   "Rothesay Bay",
   "Royal Oak",
   "Sandringham",
   "Silverdale",
   "Snells Beach",
   "St Heliers",
   "St Johns",
   "St Lukes",
   "Stanmore Bay",
   "Stonefields",
   "Sunnynook",
   "Sunnyvale",
   "Swanson",
   "Takapuna",
   "Te Atatu Peninsula",
   "Te Atatu South",
   "Three Kings",
   "Titirangi",
   "Torbay",
   "Totara Heights",
   "Unsworth Heights",
   "Waitakere",
   "Waiuku",
   "Wattle Downs",
   "Wellsford",
   "West Harbour",
   "Western Springs",
   "Westgate",
   "Westmere",
   "Whangaparaoa",
   "Whenuapai",
   "Windsor Park",
   "Wiri"
  ],
  "Warkworth": [],
  "Snells Beach": [],
  "Algies Bay": [],
  "Sandspit": [],
  "Matakana": [],
  "Point Wells": [],
  "Omaha": [],
  "Leigh": [],
  "Pakiri": [],
  "Kaipara Flats": [],
  "Wellsford": [],
  "Te Hana": [],
  "Tomarata": [],
  "Puhoi": [],
  "Waiwera": [],
  "Hatfields Beach": [],
  "Kaukapakapa": [],
  "Waitoki": [],
  "Wainui": [],
  "Dairy Flat": [],
  "Coatesville": [],
  "Helensville": [],
  "Parakai": [],
  "South Head": [],
  "Shelly Beach": [],
  "Riverhead": [],
  "Kumeu": [],
  "Huapai": [],
  "Waimauku": [],
  "Muriwai": [],
  "Bethells Beach": [],
  "Piha": [],
  "Karekare": [],
  "Huia": [],
  "Cornwallis": [],
  "Oratia": [],
  "Henderson Valley": [],
  "Whitford": [],
  "Brookby": [],
  "Beachlands": [],
  "Maraetai": [],
  "Clevedon": [],
  "Kawakawa Bay": [],
  "Orere Point": [],
  "Ardmore": [],
  "Karaka": [],
  "Kingseat": [],
  "Waiau Pa": [],
  "Clarks Beach": [],
  "Glenbrook": [],
  "Waiuku": [],
  "Awhitu": [],
  "Matakawau": [],
  "Pukekohe": [],
  "Buckland": [],
  "Paerata": [],
  "Patumahoe": [],
  "Ramarama": [],
  "Bombay": [],
  "Waiheke Island": [
   "Waiheke Island",
   "Blackpool",
   "Oneroa",
   "Onetangi",
   "Ostend",
   "Palm Beach",
   "Rocky Bay",
   "Surfdale"
  ],
  "Great Barrier Island": [
   "Great Barrier Island",
   "Claris",
   "Medlands",
   "Okiwi",
   "Okupu",
   "Port FitzRoy",
   "Tryphena",
   "Whangaparapara"
  ],
  "Kawau Island": []
 },
 "Northland": {
  "Whangarei": [
   "Whangarei",
   "Avenues",
   "Glenbervie",
   "Horahora",
   "Kamo",
   "Kensington",
   "Mairtown",
   "Maunu",
   "Morningside",
   "Onerahi",
   "Otaika",
   "Otangarei",
   "Parua Bay",
   "Raumanga",
   "Regent",
   "Riverside",
   "Sherwood Rise",
   "Springs Flat",
   "Three Mile Bush",
   "Tikipunga",
   "Whau Valley",
   "Woodhill"
  ],
  "Kerikeri": [],
  "Waipapa": [],
  "Paihia": [],
  "Waitangi": [],
  "Haruru": [],
  "Opua": [],
  "Russell": [],
  "Kawakawa": [],
  "Moerewa": [],
  "Kaikohe": [],
  "Ngawha Springs": [],
  "Okaihau": [],
  "Ohaeawai": [],
  "Kaeo": [],
  "Whangaroa": [],
  "Totara North": [],
  "Matauri Bay": [],
  "Mangonui": [],
  "Coopers Beach": [],
  "Cable Bay": [],
  "Taipa": [],
  "Hihi": [],
  "Whatuwhiwhi": [],
  "Tokerau Beach": [],
  "Awanui": [],
  "Kaitaia": [],
  "Ahipara": [],
  "Pukenui": [],
  "Houhora": [],
  "Ngataki": [],
  "Te Kao": [],
  "Herekino": [],
  "Broadwood": [],
  "Panguru": [],
  "Kohukohu": [],
  "Rawene": [],
  "Horeke": [],
  "Opononi": [],
  "Omapere": [],
  "Waimamaku": [],
  "Hikurangi": [],
  "Whakapara": [],
  "Towai": [],
  "Ngunguru": [],
  "Tutukaka": [],
  "Matapouri": [],
  "Whananaki": [],
  "Oakura": [],
  "Whangarei Heads": [],
  "McLeod Bay": [],
  "Pataua": [],
  "Portland": [],
  "Oakleigh": [],
  "Ruakaka": [],
  "One Tree Point": [],
  "Marsden Point": [],
  "Waipu": [],
  "Waipu Cove": [],
  "Langs Beach": [],
  "Mangawhai": [],
  "Mangawhai Heads": [],
  "Kaiwaka": [],
  "Maungaturoto": [],
  "Paparoa": [],
  "Matakohe": [],
  "Ruawai": [],
  "Te Kopuru": [],
  "Dargaville": [],
  "Baylys Beach": [],
  "Tangowahine": [],
  "Kaihu": [],
  "Tangiteroria": [],
  "Maungakaramea": [],
  "Waiotira": [],
  "Poroti": [],
  "Titoki": [],
  "Kokopu": []
 },
 "Waikato": {
  "Hamilton": [
   "Hamilton",
   "Bader",
   "Beerescourt",
   "Burbush",
   "Chartwell",
   "Chedworth Park",
   "Claudelands",
   "Crawshaw",
   "Deanwell",
   "Dinsdale",
   "Enderley",
   "Fairfield",
   "Fairview Downs",
   "Fitzroy",
   "Flagstaff",
   "Forest Lake",
   "Frankton",
   "Glenview",
   "Grandview Heights",
   "Hamilton Central",
   "Hamilton East",
   "Harrowfield",
   "Hillcrest",
   "Horsham Downs",
   "Huntington",
   "Maeroa",
   "Melville",
   "Nawton",
   "Peacocke",
   "Pukete",
   "Queenwood",
   "Riverlea",
   "Rototuna",
   "Rototuna North",
   "Rotokauri",
   "Ruakura",
   "Silverdale",
   "St Andrews",
   "Te Rapa",
   "Temple View",
   "Western Heights",
   "Whitiora"
  ],
  "Cambridge": [],
  "Karapiro": [],
  "Te Awamutu": [],
  "Kihikihi": [],
  "Pirongia": [],
  "Ohaupo": [],
  "Ngahinapouri": [],
  "Rukuhia": [],
  "Tamahere": [],
  "Matangi": [],
  "Tauwhare": [],
  "Newstead": [],
  "Eureka": [],
  "Gordonton": [],
  "Puketaha": [],
  "Te Kowhai": [],
  "Horotiu": [],
  "Whatawhata": [],
  "Ngaruawahia": [],
  "Taupiri": [],
  "Glen Massey": [],
  "Waingaro": [],
  "Raglan": [],
  "Te Uku": [],
  "Huntly": [],
  "Ohinewai": [],
  "Rangiriri": [],
  "Te Kauwhata": [],
  "Meremere": [],
  "Mercer": [],
  "Pokeno": [],
  "Tuakau": [],
  "Onewhero": [],
  "Port Waikato": [],
  "Pukekawa": [],
  "Morrinsville": [],
  "Tatuanui": [],
  "Waitoa": [],
  "Waharoa": [],
  "Matamata": [],
  "Te Poi": [],
  "Walton": [],
  "Hinuera": [],
  "Te Aroha": [],
  "Manawaru": [],
  "Paeroa": [],
  "Waikino": [],
  "Waihi": [],
  "Whiritoa": [],
  "Ngatea": [],
  "Kerepehi": [],
  "Turua": [],
  "Waitakaruru": [],
  "Kaiaua": [],
  "Miranda": [],
  "Thames": [],
  "Te Puru": [],
  "Tapu": [],
  "Coromandel": [],
  "Kuaotunu": [],
  "Matarangi": [],
  "Whitianga": [],
  "Cooks Beach": [],
  "Hahei": [],
  "Hot Water Beach": [],
  "Coroglen": [],
  "Tairua": [],
  "Pauanui": [],
  "Opoutere": [],
  "Onemana": [],
  "Whangamata": [],
  "Tirau": [],
  "Putaruru": [],
  "Arapuni": [],
  "Lichfield": [],
  "Tokoroa": [],
  "Mangakino": [],
  "Whakamaru": [],
  "Otorohanga": [],
  "Kawhia": [],
  "Te Kuiti": [],
  "Waitomo Caves": [],
  "Piopio": [],
  "Aria": [],
  "Benneydale": [],
  "Marokopa": [],
  "Mokau": [],
  "Awakino": [],
  "Taupo": [
   "Taupo",
   "Acacia Bay",
   "Hilltop",
   "Nukuhau",
   "Rainbow Point",
   "Richmond Heights",
   "Tauhara",
   "Two Mile Bay",
   "Waipahihi",
   "Wharewaka"
  ],
  "Kinloch": [],
  "Wairakei": [],
  "Waitahanui": [],
  "Motuoapa": [],
  "Turangi": [],
  "Tokaanu": [],
  "Kuratau": [],
  "Omori": [],
  "Pukawa": []
 },
 "Bay of Plenty": {
  "Tauranga": [
   "Tauranga",
   "Tauranga Central",
   "Tauranga South",
   "The Avenues",
   "Judea",
   "Otumoetai",
   "Matua",
   "Bureta",
   "Cherrywood",
   "Bellevue",
   "Brookfield",
   "Bethlehem",
   "Pillans Point",
   "Gate Pa",
   "Merivale",
   "Greerton",
   "Parkvale",
   "Pyes Pa",
   "Tauriko",
   "Ohauiti",
   "Hairini",
   "Maungatapu",
   "Welcome Bay",
   "Poike",
   "Matapihi",
   "Sulphur Point",
   "Mount Maunganui",
   "Omanu",
   "Arataki",
   "Bayfair",
   "Papamoa",
   "Papamoa Beach",
   "Palm Beach"
  ],
  "Te Puke": [],
  "Katikati": [],
  "Omokoroa": [],
  "Waihi Beach": [],
  "Athenree": [],
  "Bowentown": [],
  "Te Puna": [],
  "Minden": [],
  "Whakamarama": [],
  "Aongatete": [],
  "Kauri Point": [],
  "Tanners Point": [],
  "Matakana Island": [],
  "Oropi": [],
  "Kaimai": [],
  "Paengaroa": [],
  "Pongakawa": [],
  "Maketu": [],
  "Pukehina": [],
  "Otamarakau": [],
  "Rotorua": [
   "Rotorua",
   "Rotorua Central",
   "Glenholme",
   "Springfield",
   "Fenton Park",
   "Victoria",
   "Utuhina",
   "Kuirau",
   "Mangakakahi",
   "Western Heights",
   "Selwyn Heights",
   "Fordlands",
   "Pomare",
   "Sunnybrook",
   "Hillcrest",
   "Ohinemutu",
   "Koutu",
   "Kawaha Point",
   "Fairy Springs",
   "Ngongotaha",
   "Ngongotaha Valley",
   "Whakarewarewa",
   "Ngapuna",
   "Owhata",
   "Lynmore",
   "Holdens Bay",
   "Hannahs Bay",
   "Tihiotonga"
  ],
  "Hamurana": [],
  "Mamaku": [],
  "Kaharoa": [],
  "Okere Falls": [],
  "Mourea": [],
  "Rotoiti": [],
  "Rotoehu": [],
  "Tikitere": [],
  "Lake Tarawera": [],
  "Lake Okareka": [],
  "Rerewhakaaitu": [],
  "Reporoa": [],
  "Ngakuru": [],
  "Waikite Valley": [],
  "Horohoro": [],
  "Whakatane": [
   "Whakatane",
   "Whakatane Central",
   "Awatapu",
   "Coastlands",
   "Hillcrest",
   "Piripai",
   "Otarawairere",
   "Mokorua"
  ],
  "Ohope": [],
  "Edgecumbe": [],
  "Te Teko": [],
  "Otakiri": [],
  "Awakeri": [],
  "Thornton": [],
  "Poroporo": [],
  "Taneatua": [],
  "Waimana": [],
  "Ruatoki": [],
  "Matata": [],
  "Pikowai": [],
  "Manawahe": [],
  "Murupara": [],
  "Galatea": [],
  "Waiohau": [],
  "Te Mahoe": [],
  "Minginui": [],
  "Te Whaiti": [],
  "Ruatahuna": [],
  "Kaingaroa": [],
  "Kawerau": [],
  "Opotiki": [],
  "Waiotahe": [],
  "Ohiwa": [],
  "Omarumutu": [],
  "Torere": [],
  "Hawai": [],
  "Omaio": [],
  "Te Kaha": [],
  "Whanarua Bay": [],
  "Raukokore": [],
  "Waihau Bay": [],
  "Cape Runaway": []
 },
 "Gisborne": {
  "Gisborne": [
   "Gisborne",
   "Gisborne Central",
   "Whataupoko",
   "Mangapapa",
   "Te Hapara",
   "Elgin",
   "Awapuni",
   "Riverdale",
   "Lytton West",
   "Kaiti",
   "Outer Kaiti",
   "Tamarau",
   "Makaraka",
   "Matawhero",
   "Wainui",
   "Okitu"
  ],
  "Wainui Beach": [],
  "Makorori": [],
  "Tatapouri": [],
  "Whangara": [],
  "Manutuke": [],
  "Muriwai": [],
  "Patutahi": [],
  "Ormond": [],
  "Ngatapa": [],
  "Rere": [],
  "Waerengaokuri": [],
  "Tiniroto": [],
  "Te Karaka": [],
  "Whatatutu": [],
  "Matawai": [],
  "Motu": [],
  "Tolaga Bay": [],
  "Tokomaru Bay": [],
  "Waipiro Bay": [],
  "Te Puia Springs": [],
  "Ruatoria": [],
  "Tikitiki": [],
  "Rangitukia": [],
  "Te Araroa": [],
  "Hicks Bay": [],
  "Potaka": []
 },
 "Hawke's Bay": {
  "Napier": [
   "Napier",
   "Napier Central",
   "Napier South",
   "Bluff Hill",
   "Hospital Hill",
   "Ahuriri",
   "Westshore",
   "Bay View",
   "Poraiti",
   "Marewa",
   "Onekawa",
   "Pirimai",
   "Tamatea",
   "Greenmeadows",
   "Taradale",
   "Maraenui",
   "Meeanee",
   "Awatoto",
   "Jervoistown",
   "Te Awa"
  ],
  "Hastings": [
   "Hastings",
   "Hastings Central",
   "Mayfair",
   "Raureka",
   "Akina",
   "Parkvale",
   "Mahora",
   "Frimley",
   "Camberley",
   "St Leonards",
   "Tomoana",
   "Havelock North",
   "Flaxmere"
  ],
  "Clive": [],
  "Whakatu": [],
  "Haumoana": [],
  "Te Awanga": [],
  "Waimarama": [],
  "Pakipaki": [],
  "Bridge Pa": [],
  "Twyford": [],
  "Fernhill": [],
  "Maraekakaho": [],
  "Puketapu": [],
  "Rissington": [],
  "Patoka": [],
  "Puketitiri": [],
  "Eskdale": [],
  "Tangoio": [],
  "Tutira": [],
  "Te Pohue": [],
  "Putorino": [],
  "Mohaka": [],
  "Raupunga": [],
  "Wairoa": [],
  "Frasertown": [],
  "Tuai": [],
  "Waikaremoana": [],
  "Ruakituri": [],
  "Whakaki": [],
  "Nuhaka": [],
  "Morere": [],
  "Mahia": [],
  "Mahia Beach": [],
  "Waipawa": [],
  "Waipukurau": [],
  "Otane": [],
  "Tikokino": [],
  "Ongaonga": [],
  "Takapau": [],
  "Elsthorpe": [],
  "Porangahau": [],
  "Kairakau Beach": [],
  "Hatuma": []
 },
 "Taranaki": {
  "New Plymouth": [
   "New Plymouth",
   "New Plymouth Central",
   "Strandon",
   "Fitzroy",
   "Glen Avon",
   "Merrilands",
   "Highlands Park",
   "Welbourn",
   "Vogeltown",
   "Frankleigh Park",
   "Hurdon",
   "Westown",
   "Marfell",
   "Spotswood",
   "Moturoa",
   "Lynmouth",
   "Blagdon",
   "Brooklands",
   "Hillsborough",
   "Mangorei",
   "Waiwhakaiho",
   "Bell Block",
   "Ferndale"
  ],
  "Waitara": [],
  "Inglewood": [],
  "Oakura": [],
  "Okato": [],
  "Urenui": [],
  "Onaero": [],
  "Tikorangi": [],
  "Motunui": [],
  "Lepperton": [],
  "Egmont Village": [],
  "Uruti": [],
  "Tongaporutu": [],
  "Omata": [],
  "Warea": [],
  "Pungarehu": [],
  "Parihaka": [],
  "Rahotu": [],
  "Oaonui": [],
  "Opunake": [],
  "Otakeho": [],
  "Manaia": [],
  "Kaponga": [],
  "Eltham": [],
  "Stratford": [],
  "Midhirst": [],
  "Tariki": [],
  "Toko": [],
  "Douglas": [],
  "Te Wera": [],
  "Whangamomona": [],
  "Hawera": [],
  "Normanby": [],
  "Okaiawa": [],
  "Matapu": [],
  "Kakaramea": [],
  "Manutahi": [],
  "Patea": [],
  "Whenuakura": [],
  "Waverley": [],
  "Waitotara": []
 },
 "Manawatu-Whanganui": {
  "Palmerston North": [
   "Palmerston North",
   "Palmerston North Central",
   "West End",
   "Terrace End",
   "Hokowhitu",
   "Awapuni",
   "Takaro",
   "Highbury",
   "Cloverlea",
   "Milson",
   "Kelvin Grove",
   "Roslyn",
   "Westbrook",
   "Aokautere",
   "Fitzherbert",
   "Summerhill",
   "Whakarongo"
  ],
  "Whanganui": [
   "Whanganui",
   "Whanganui Central",
   "Whanganui East",
   "Aramoho",
   "Castlecliff",
   "Gonville",
   "Springvale",
   "St Johns Hill",
   "Durie Hill",
   "Bastia Hill",
   "College Estate",
   "Tawhero",
   "Otamatea",
   "Putiki",
   "Westmere",
   "Kaierau",
   "Wembley Park"
  ],
  "Feilding": [],
  "Levin": [],
  "Marton": [],
  "Dannevirke": [],
  "Taumarunui": [],
  "Foxton": [],
  "Foxton Beach": [],
  "Bulls": [],
  "Taihape": [],
  "Ohakune": [],
  "Raetihi": [],
  "Waiouru": [],
  "National Park": [],
  "Pahiatua": [],
  "Woodville": [],
  "Eketahuna": [],
  "Norsewood": [],
  "Ormondville": [],
  "Shannon": [],
  "Tokomaru": [],
  "Ashhurst": [],
  "Sanson": [],
  "Rongotea": [],
  "Halcombe": [],
  "Kimbolton": [],
  "Cheltenham": [],
  "Colyton": [],
  "Awahuri": [],
  "Apiti": [],
  "Pohangina": [],
  "Himatangi Beach": [],
  "Tangimoana": [],
  "Waitarere Beach": [],
  "Hokio Beach": [],
  "Waikawa Beach": [],
  "Manakau": [],
  "Ohau": [],
  "Kuku": [],
  "Opiki": [],
  "Hunterville": [],
  "Mangaweka": [],
  "Utiku": [],
  "Ohingaiti": [],
  "Turakina": [],
  "Ratana": [],
  "Koitiata": [],
  "Kai Iwi": [],
  "Maxwell": [],
  "Fordell": [],
  "Upokongaro": [],
  "Brunswick": [],
  "Mowhanau": [],
  "Whangaehu": [],
  "Jerusalem": [],
  "Ranana": [],
  "Koriniti": [],
  "Pipiriki": [],
  "Owhango": [],
  "Manunui": [],
  "Kakahi": [],
  "Piriaka": [],
  "Ongarue": [],
  "Waimiha": [],
  "Ohura": [],
  "Matiere": [],
  "Raurimu": [],
  "Horopito": [],
  "Erua": [],
  "Rangataua": [],
  "Whakapapa Village": [],
  "Pongaroa": [],
  "Weber": [],
  "Akitio": [],
  "Herbertville": [],
  "Alfredton": [],
  "Mangatainoka": [],
  "Longburn": [],
  "Linton": [],
  "Bunnythorpe": []
 },
 "Wellington": {
  "Wellington City": [
   "Wellington City",
   "Wellington Central",
   "Te Aro",
   "Thorndon",
   "Pipitea",
   "Mount Victoria",
   "Mount Cook",
   "Aro Valley",
   "Kelburn",
   "Northland",
   "Karori",
   "Wilton",
   "Wadestown",
   "Highbury",
   "Brooklyn",
   "Vogeltown",
   "Mornington",
   "Kingston",
   "Happy Valley",
   "Berhampore",
   "Newtown",
   "Melrose",
   "Island Bay",
   "Owhiro Bay",
   "Houghton Bay",
   "Southgate",
   "Lyall Bay",
   "Rongotai",
   "Kilbirnie",
   "Hataitai",
   "Roseneath",
   "Oriental Bay",
   "Evans Bay",
   "Maupuia",
   "Miramar",
   "Strathmore Park",
   "Seatoun",
   "Breaker Bay",
   "Moa Point",
   "Worser Bay",
   "Karaka Bays",
   "Ngaio",
   "Khandallah",
   "Crofton Downs",
   "Broadmeadows",
   "Kaiwharawhara",
   "Ngauranga",
   "Johnsonville",
   "Newlands",
   "Paparangi",
   "Woodridge",
   "Grenada Village",
   "Grenada North",
   "Churton Park",
   "Glenside",
   "Horokiwi",
   "Tawa",
   "Linden",
   "Redwood",
   "Takapu Valley",
   "Makara",
   "Makara Beach",
   "Ohariu"
  ],
  "Lower Hutt": [
   "Lower Hutt",
   "Hutt Central",
   "Petone",
   "Alicetown",
   "Melling",
   "Belmont",
   "Kelson",
   "Maungaraki",
   "Normandale",
   "Tirohanga",
   "Korokoro",
   "Harbour View",
   "Boulcott",
   "Epuni",
   "Waterloo",
   "Woburn",
   "Moera",
   "Waiwhetu",
   "Gracefield",
   "Seaview",
   "Naenae",
   "Avalon",
   "Taita",
   "Fairfield",
   "Stokes Valley",
   "Manor Park",
   "Haywards",
   "Wainuiomata",
   "Arakura",
   "Homedale",
   "Parkway",
   "Eastbourne",
   "Days Bay",
   "Lowry Bay",
   "York Bay",
   "Mahina Bay",
   "Point Howard",
   "Muritai",
   "Sunshine Bay"
  ],
  "Upper Hutt": [
   "Upper Hutt",
   "Upper Hutt Central",
   "Trentham",
   "Heretaunga",
   "Silverstream",
   "Pinehaven",
   "Wallaceville",
   "Elderslea",
   "Ebdentown",
   "Clouston Park",
   "Totara Park",
   "Maoribank",
   "Birchville",
   "Brown Owl",
   "Timberlea",
   "Te Marua",
   "Kaitoke",
   "Akatarawa",
   "Maymorn",
   "Riverstone Terraces",
   "Whitemans Valley",
   "Blue Mountains",
   "Emerald Hill",
   "Mount Marua"
  ],
  "Porirua": [
   "Porirua",
   "Porirua Central",
   "Porirua East",
   "Cannons Creek",
   "Waitangirua",
   "Ranui Heights",
   "Ascot Park",
   "Elsdon",
   "Takapuwahia",
   "Titahi Bay",
   "Kenepuru",
   "Aotea",
   "Whitby",
   "Papakowhai",
   "Paremata",
   "Camborne",
   "Mana",
   "Plimmerton",
   "Karehana Bay",
   "Pukerua Bay",
   "Hongoeka",
   "Pauatahanui",
   "Judgeford"
  ],
  "Paraparaumu": [
   "Paraparaumu",
   "Paraparaumu Beach",
   "Raumati Beach",
   "Raumati South",
   "Otaihanga",
   "Kena Kena"
  ],
  "Waikanae": [
   "Waikanae",
   "Waikanae Beach",
   "Waikanae East"
  ],
  "Otaki": [
   "Otaki",
   "Otaki Beach",
   "Otaki Railway"
  ],
  "Paekakariki": [],
  "Te Horo": [],
  "Peka Peka": [],
  "Masterton": [
   "Masterton",
   "Masterton Central",
   "Lansdowne",
   "Solway",
   "Kuripuni",
   "Upper Plain",
   "Douglas Park"
  ],
  "Carterton": [],
  "Greytown": [],
  "Featherston": [],
  "Martinborough": [],
  "Riversdale Beach": [],
  "Castlepoint": [],
  "Tinui": [],
  "Mauriceville": [],
  "Opaki": [],
  "Gladstone": [],
  "Ngawi": [],
  "Lake Ferry": [],
  "Pirinoa": []
 },
 "Marlborough": {
  "Blenheim": [
   "Blenheim",
   "Blenheim Central",
   "Springlands",
   "Redwoodtown",
   "Witherlea",
   "Mayfield",
   "Riversdale",
   "Islington",
   "Burleigh",
   "Whitney Street",
   "Omaka"
  ],
  "Picton": [
   "Picton",
   "Picton Central",
   "Waikawa"
  ],
  "Renwick": [],
  "Havelock": [],
  "Seddon": [],
  "Ward": [],
  "Rai Valley": [],
  "Spring Creek": [],
  "Grovetown": [],
  "Tuamarina": [],
  "Rapaura": [],
  "Rarangi": [],
  "Fairhall": [],
  "Wairau Valley": [],
  "Riverlands": [],
  "Woodbourne": [],
  "Koromiko": [],
  "Linkwater": [],
  "Anakiwa": [],
  "Canvastown": [],
  "Okiwi Bay": [],
  "French Pass": [],
  "Portage": [],
  "Ngakuta Bay": [],
  "Te Mahia": [],
  "Elaine Bay": []
 },
 "Nelson": {
  "Nelson": [
   "Nelson",
   "Nelson Central",
   "The Wood",
   "The Brook",
   "Britannia Heights",
   "Nelson South",
   "Toi Toi",
   "Washington Valley",
   "Port Nelson",
   "Tahunanui",
   "Bishopdale",
   "Enner Glynn",
   "Ngawhatu",
   "Stoke",
   "Wakatu",
   "Annesbrook",
   "Monaco",
   "Nayland",
   "Atawhai",
   "Marybank",
   "Wakapuaka",
   "Maitai Valley",
   "Beachville",
   "Isel Park",
   "Ranzau"
  ],
  "Hira": [],
  "Cable Bay": [],
  "Glenduan": [],
  "Todds Valley": []
 },
 "Tasman": {
  "Richmond": [],
  "Motueka": [],
  "Takaka": [],
  "Brightwater": [],
  "Wakefield": [],
  "Mapua": [],
  "Murchison": [],
  "Tapawera": [],
  "Collingwood": [],
  "Riwaka": [],
  "Kaiteriteri": [],
  "Marahau": [],
  "Ngatimoti": [],
  "Upper Moutere": [],
  "Lower Moutere": [],
  "Tasman": [],
  "Ruby Bay": [],
  "Hope": [],
  "Appleby": [],
  "Redwood Valley": [],
  "Wai-iti": [],
  "Foxhill": [],
  "Belgrove": [],
  "Motupiko": [],
  "Korere": [],
  "Golden Downs": [],
  "Stanley Brook": [],
  "Dovedale": [],
  "St Arnaud": [],
  "Owen River": [],
  "Glenhope": [],
  "Pohara": [],
  "Ligar Bay": [],
  "Tata Beach": [],
  "Patons Rock": [],
  "Onekaka": [],
  "Puponga": [],
  "Bainham": [],
  "Tarakohe": []
 },
 "West Coast": {
  "Westport": [],
  "Carters Beach": [],
  "Cape Foulwind": [],
  "Charleston": [],
  "Waimangaroa": [],
  "Granity": [],
  "Ngakawau": [],
  "Hector": [],
  "Seddonville": [],
  "Mokihinui": [],
  "Little Wanganui": [],
  "Karamea": [],
  "Inangahua Junction": [],
  "Reefton": [],
  "Springs Junction": [],
  "Maruia": [],
  "Ikamatua": [],
  "Ahaura": [],
  "Nelson Creek": [],
  "Totara Flat": [],
  "Blackball": [],
  "Runanga": [],
  "Rapahoe": [],
  "Barrytown": [],
  "Punakaiki": [],
  "Greymouth": [
   "Greymouth",
   "Blaketown",
   "Cobden",
   "Karoro",
   "Boddytown",
   "Marsden",
   "Gladstone",
   "South Beach",
   "Paroa",
   "Kaiata"
  ],
  "Dobson": [],
  "Taylorville": [],
  "Stillwater": [],
  "Moana": [],
  "Kumara": [],
  "Kumara Junction": [],
  "Otira": [],
  "Hokitika": [],
  "Arahura": [],
  "Ross": [],
  "Ruatapu": [],
  "Hari Hari": [],
  "Whataroa": [],
  "Franz Josef": [],
  "Fox Glacier": [],
  "Bruce Bay": [],
  "Haast": [],
  "Jackson Bay": [],
  "Okuru": []
 },
 "Otago": {
  "Oamaru": [
   "Oamaru",
   "Awamoa",
   "Glen Warren",
   "Holmes Hill",
   "Redcastle",
   "South Hill",
   "Weston"
  ],
  "Kakanui": [],
  "Maheno": [],
  "Enfield": [],
  "Ngapara": [],
  "Tokarahi": [],
  "Duntroon": [],
  "Kurow": [],
  "Otematata": [],
  "Omarama": [],
  "Georgetown": [],
  "Herbert": [],
  "Waianakarua": [],
  "Hampden": [],
  "Moeraki": [],
  "Palmerston": [],
  "Dunback": [],
  "Macraes Flat": [],
  "Waikouaiti": [],
  "Karitane": [],
  "Seacliff": [],
  "Warrington": [],
  "Waitati": [],
  "Purakaunui": [],
  "Aramoana": [],
  "Dunedin": [
   "Dunedin",
   "Abbotsford",
   "Andersons Bay",
   "Balaclava",
   "Belleknowes",
   "Broad Bay",
   "Brockville",
   "Burnside",
   "Calton Hill",
   "Caversham",
   "City Rise",
   "Company Bay",
   "Concord",
   "Corstorphine",
   "Dalmore",
   "Dunedin Central",
   "Fairfield",
   "Forbury",
   "Glenleith",
   "Green Island",
   "Halfway Bush",
   "Helensburgh",
   "Kaikorai",
   "Kenmure",
   "Kew",
   "Leith Valley",
   "Liberton",
   "Lookout Point",
   "Macandrew Bay",
   "Maia",
   "Maori Hill",
   "Maryhill",
   "Mornington",
   "Mosgiel",
   "Musselburgh",
   "Normanby",
   "North Dunedin",
   "North East Valley",
   "Ocean Grove",
   "Ocean View",
   "Opoho",
   "Pine Hill",
   "Port Chalmers",
   "Portobello",
   "Ravensbourne",
   "Roslyn",
   "Sawyers Bay",
   "Shiel Hill",
   "South Dunedin",
   "St Clair",
   "St Kilda",
   "St Leonards",
   "Sunnyvale",
   "Tainui",
   "Vauxhall",
   "Wakari",
   "Waldronville",
   "Waverley",
   "Woodhaugh"
  ],
  "Careys Bay": [],
  "Outram": [],
  "East Taieri": [],
  "Wingatui": [],
  "Allanton": [],
  "Momona": [],
  "Henley": [],
  "Brighton": [],
  "Taieri Mouth": [],
  "Waihola": [],
  "Middlemarch": [],
  "Hyde": [],
  "Sutton": [],
  "Milton": [],
  "Waitahuna": [],
  "Lawrence": [],
  "Beaumont": [],
  "Balclutha": [],
  "Stirling": [],
  "Kaitangata": [],
  "Clydevale": [],
  "Owaka": [],
  "Pounawea": [],
  "Kaka Point": [],
  "Papatowai": [],
  "Clinton": [],
  "Waiwera South": [],
  "Tapanui": [],
  "Heriot": [],
  "Ettrick": [],
  "Millers Flat": [],
  "Roxburgh": [],
  "Alexandra": [],
  "Clyde": [],
  "Earnscleugh": [],
  "Chatto Creek": [],
  "Omakau": [],
  "Ophir": [],
  "Lauder": [],
  "Becks": [],
  "St Bathans": [],
  "Oturehua": [],
  "Wedderburn": [],
  "Naseby": [],
  "Ranfurly": [],
  "Patearoa": [],
  "Waipiata": [],
  "Kyeburn": [],
  "Poolburn": [],
  "Cromwell": [],
  "Bannockburn": [],
  "Lowburn": [],
  "Pisa Moorings": [],
  "Tarras": [],
  "Luggate": [],
  "Wanaka": [],
  "Albert Town": [],
  "Hawea Flat": [],
  "Lake Hawea": [],
  "Makarora": [],
  "Cardrona": [],
  "Arrowtown": [],
  "Queenstown": [
   "Queenstown",
   "Arthurs Point",
   "Fernhill",
   "Frankton",
   "Hanleys Farm",
   "Jacks Point",
   "Kelvin Heights",
   "Lake Hayes",
   "Lake Hayes Estate",
   "Quail Rise",
   "Queenstown Hill",
   "Shotover Country",
   "Sunshine Bay"
  ],
  "Gibbston": [],
  "Glenorchy": [],
  "Kinloch": [],
  "Kingston": []
 },
 "Southland": {
  "Invercargill": [
   "Invercargill",
   "Appleby",
   "Avenal",
   "Clifton",
   "Georgetown",
   "Gladstone",
   "Glengarry",
   "Grasmere",
   "Hargest",
   "Hawthorndale",
   "Heidelberg",
   "Invercargill Central",
   "Kew",
   "Kingswell",
   "Myross Bush",
   "Newfield",
   "Otatara",
   "Prestonville",
   "Richmond",
   "Rosedale",
   "Strathern",
   "Tisbury",
   "Waikiwi",
   "Waverley",
   "Windsor",
   "Woodend"
  ],
  "Bluff": [],
  "Kennington": [],
  "Makarewa": [],
  "Lorneville": [],
  "Ryal Bush": [],
  "Wallacetown": [],
  "Waianiwa": [],
  "Winton": [],
  "Limehills": [],
  "Centre Bush": [],
  "Dipton": [],
  "Lumsden": [],
  "Mossburn": [],
  "Athol": [],
  "Garston": [],
  "Balfour": [],
  "Riversdale": [],
  "Waikaia": [],
  "Waikaka": [],
  "Mandeville": [],
  "Gore": [
   "Gore",
   "East Gore"
  ],
  "Mataura": [],
  "Pukerau": [],
  "Edendale": [],
  "Wyndham": [],
  "Woodlands": [],
  "Dacre": [],
  "Mokotua": [],
  "Gorge Road": [],
  "Tokanui": [],
  "Fortrose": [],
  "Waikawa": [],
  "Curio Bay": [],
  "Otautau": [],
  "Nightcaps": [],
  "Ohai": [],
  "Drummond": [],
  "Browns": [],
  "Thornbury": [],
  "Riverton": [],
  "Colac Bay": [],
  "Orepuki": [],
  "Tuatapere": [],
  "Clifden": [],
  "Blackmount": [],
  "Manapouri": [],
  "Te Anau": [],
  "Milford Sound": [],
  "Oban": []
 }
};

// Areas Match Maid has actually launched in. Everything else gets the
// "not available in your area yet" notice. Keyed "name|region" because the
// name alone is ambiguous nationwide.
const NZ_LAUNCHED = new Set(["Addington|Canterbury","Aidanfield|Canterbury","Aranui|Canterbury","Avonhead|Canterbury","Avonside|Canterbury","Barrington|Canterbury","Beckenham|Canterbury","Belfast|Canterbury","Bexley|Canterbury","Bishopdale|Canterbury","Bromley|Canterbury","Brooklands|Canterbury","Bryndwr|Canterbury","Burnside|Canterbury","Burwood|Canterbury","Casebrook|Canterbury","Cashmere|Canterbury","Clifton|Canterbury","Cracroft|Canterbury","Cust|Canterbury","Dallington|Canterbury","Darfield|Canterbury","Diamond Harbour|Canterbury","Edgeware|Canterbury","Fendalton|Canterbury","Ferrymead|Canterbury","Governors Bay|Canterbury","Halswell|Canterbury","Harewood|Canterbury","Heathcote Valley|Canterbury","Hei Hei|Canterbury","Hillmorton|Canterbury","Hoon Hay|Canterbury","Hornby|Canterbury","Huntsbury|Canterbury","Ilam|Canterbury","Islington|Canterbury","Kaiapoi|Canterbury","Leeston|Canterbury","Lincoln|Canterbury","Linwood|Canterbury","Lyttelton|Canterbury","Mairehau|Canterbury","Marshland|Canterbury","Merivale|Canterbury","Middleton|Canterbury","Mount Pleasant|Canterbury","New Brighton|Canterbury","North New Brighton|Canterbury","Northwood|Canterbury","Ohoka|Canterbury","Opawa|Canterbury","Oxford|Canterbury","Papanui|Canterbury","Parklands|Canterbury","Pegasus|Canterbury","Phillipstown|Canterbury","Prebbleton|Canterbury","Prestons|Canterbury","Rangiora|Canterbury","Redcliffs|Canterbury","Redwood|Canterbury","Riccarton|Canterbury","Richmond|Canterbury","Rolleston|Canterbury","Russley|Canterbury","Shirley|Canterbury","Sockburn|Canterbury","Somerfield|Canterbury","South New Brighton|Canterbury","Spreydon|Canterbury","Springston|Canterbury","St Albans|Canterbury","St Martins|Canterbury","Strowan|Canterbury","Sumner|Canterbury","Swannanoa|Canterbury","Sydenham|Canterbury","Tai Tapu|Canterbury","Templeton|Canterbury","Upper Riccarton|Canterbury","Waimairi Beach|Canterbury","Wainoni|Canterbury","Waltham|Canterbury","West Melton|Canterbury","Westmorland|Canterbury","Wigram|Canterbury","Woodend|Canterbury","Woolston|Canterbury","Yaldhurst|Canterbury","Albany|Auckland","Avondale|Auckland","Balmoral|Auckland","Beach Haven|Auckland","Birkenhead|Auckland","Blockhouse Bay|Auckland","Botany Downs|Auckland","Browns Bay|Auckland","Bucklands Beach|Auckland","Clendon Park|Auckland","Clevedon|Auckland","Cockle Bay|Auckland","Dannemora|Auckland","Devonport|Auckland","Drury|Auckland","East Tamaki|Auckland","Eden Terrace|Auckland","Ellerslie|Auckland","Epsom|Auckland","Favona|Auckland","Flat Bush|Auckland","Forrest Hill|Auckland","Freemans Bay|Auckland","Glen Eden|Auckland","Glen Innes|Auckland","Glendene|Auckland","Glendowie|Auckland","Glenfield|Auckland","Grafton|Auckland","Greenlane|Auckland","Grey Lynn|Auckland","Half Moon Bay|Auckland","Henderson|Auckland","Herne Bay|Auckland","Hillsborough|Auckland","Hobsonville|Auckland","Howick|Auckland","Huapai|Auckland","Kelston|Auckland","Kingsland|Auckland","Kohimarama|Auckland","Kumeu|Auckland","Lynfield|Auckland","Mairangi Bay|Auckland","Mangere|Auckland","Mangere Bridge|Auckland","Mangere East|Auckland","Manukau|Auckland","Manurewa|Auckland","Massey|Auckland","Meadowbank|Auckland","Mellons Bay|Auckland","Milford|Auckland","Millwater|Auckland","Mission Bay|Auckland","Morningside|Auckland","Mount Albert|Auckland","Mount Eden|Auckland","Mount Roskill|Auckland","Mount Wellington|Auckland","Murrays Bay|Auckland","Narrow Neck|Auckland","New Lynn|Auckland","New Windsor|Auckland","Newmarket|Auckland","Newton|Auckland","Northcote|Auckland","Northcross|Auckland","Onehunga|Auckland","Orewa|Auckland","Otahuhu|Auckland","Otara|Auckland","Oteha|Auckland","Pahurehure|Auckland","Pakuranga|Auckland","Panmure|Auckland","Papakura|Auckland","Papatoetoe|Auckland","Parnell|Auckland","Penrose|Auckland","Pinehill|Auckland","Point Chevalier|Auckland","Ponsonby|Auckland","Pukekohe|Auckland","Ranui|Auckland","Remuera|Auckland","Rosedale|Auckland","Rothesay Bay|Auckland","Royal Oak|Auckland","Sandringham|Auckland","Silverdale|Auckland","Snells Beach|Auckland","St Heliers|Auckland","St Johns|Auckland","St Lukes|Auckland","Stanmore Bay|Auckland","Stonefields|Auckland","Sunnynook|Auckland","Sunnyvale|Auckland","Swanson|Auckland","Takapuna|Auckland","Te Atatu Peninsula|Auckland","Te Atatu South|Auckland","Three Kings|Auckland","Titirangi|Auckland","Torbay|Auckland","Totara Heights|Auckland","Unsworth Heights|Auckland","Waitakere|Auckland","Waiuku|Auckland","Wattle Downs|Auckland","Wellsford|Auckland","West Harbour|Auckland","Western Springs|Auckland","Westgate|Auckland","Westmere|Auckland","Whangaparaoa|Auckland","Whenuapai|Auckland","Windsor Park|Auckland","Wiri|Auckland"]);

// Flat town -> suburbs, the shape the existing pickers (browse.js, maid.js)
// already expect from DEMO.towns. A town with no suburb breakdown maps to
// itself so there is still something to toggle.
const NZ_TOWNS = {
 "Christchurch": [
  "Addington",
  "Aidanfield",
  "Aranui",
  "Avonhead",
  "Avonside",
  "Barrington",
  "Beckenham",
  "Belfast",
  "Bexley",
  "Bishopdale",
  "Bromley",
  "Brooklands",
  "Bryndwr",
  "Burnside",
  "Burwood",
  "Casebrook",
  "Cashmere",
  "Clifton",
  "Cracroft",
  "Cust",
  "Dallington",
  "Darfield",
  "Diamond Harbour",
  "Edgeware",
  "Fendalton",
  "Ferrymead",
  "Governors Bay",
  "Halswell",
  "Harewood",
  "Heathcote Valley",
  "Hei Hei",
  "Hillmorton",
  "Hoon Hay",
  "Hornby",
  "Huntsbury",
  "Ilam",
  "Islington",
  "Kaiapoi",
  "Leeston",
  "Lincoln",
  "Linwood",
  "Lyttelton",
  "Mairehau",
  "Marshland",
  "Merivale",
  "Middleton",
  "Mount Pleasant",
  "New Brighton",
  "North New Brighton",
  "Northwood",
  "Ohoka",
  "Opawa",
  "Oxford",
  "Papanui",
  "Parklands",
  "Pegasus",
  "Phillipstown",
  "Prebbleton",
  "Prestons",
  "Rangiora",
  "Redcliffs",
  "Redwood",
  "Riccarton",
  "Richmond",
  "Rolleston",
  "Russley",
  "Shirley",
  "Sockburn",
  "Somerfield",
  "South New Brighton",
  "Spreydon",
  "Springston",
  "St Albans",
  "St Martins",
  "Strowan",
  "Sumner",
  "Swannanoa",
  "Sydenham",
  "Tai Tapu",
  "Templeton",
  "Upper Riccarton",
  "Waimairi Beach",
  "Wainoni",
  "Waltham",
  "West Melton",
  "Westmorland",
  "Wigram",
  "Woodend",
  "Woolston",
  "Yaldhurst"
 ],
 "Kaikoura": [
  "Kaikoura"
 ],
 "Clarence": [
  "Clarence"
 ],
 "Kekerengu": [
  "Kekerengu"
 ],
 "Hapuku": [
  "Hapuku"
 ],
 "Peketa": [
  "Peketa"
 ],
 "Goose Bay": [
  "Goose Bay"
 ],
 "Oaro": [
  "Oaro"
 ],
 "Mt Lyford": [
  "Mt Lyford"
 ],
 "Parnassus": [
  "Parnassus"
 ],
 "Cheviot": [
  "Cheviot"
 ],
 "Gore Bay": [
  "Gore Bay"
 ],
 "Domett": [
  "Domett"
 ],
 "Greta Valley": [
  "Greta Valley"
 ],
 "Motunau Beach": [
  "Motunau Beach"
 ],
 "Scargill": [
  "Scargill"
 ],
 "Waiau": [
  "Waiau"
 ],
 "Rotherham": [
  "Rotherham"
 ],
 "Culverden": [
  "Culverden"
 ],
 "Hanmer Springs": [
  "Hanmer Springs"
 ],
 "Hawarden": [
  "Hawarden"
 ],
 "Waikari": [
  "Waikari"
 ],
 "Omihi": [
  "Omihi"
 ],
 "Waipara": [
  "Waipara"
 ],
 "Amberley": [
  "Amberley"
 ],
 "Leithfield": [
  "Leithfield"
 ],
 "Leithfield Beach": [
  "Leithfield Beach"
 ],
 "Sefton": [
  "Sefton"
 ],
 "Ashley": [
  "Ashley"
 ],
 "Loburn": [
  "Loburn"
 ],
 "Tuahiwi": [
  "Tuahiwi"
 ],
 "Clarkville": [
  "Clarkville"
 ],
 "Kairaki": [
  "Kairaki"
 ],
 "The Pines Beach": [
  "The Pines Beach"
 ],
 "Woodend Beach": [
  "Woodend Beach"
 ],
 "Ravenswood": [
  "Ravenswood"
 ],
 "Waikuku": [
  "Waikuku"
 ],
 "Waikuku Beach": [
  "Waikuku Beach"
 ],
 "Fernside": [
  "Fernside"
 ],
 "View Hill": [
  "View Hill"
 ],
 "West Eyreton": [
  "West Eyreton"
 ],
 "Eyrewell": [
  "Eyrewell"
 ],
 "Weedons": [
  "Weedons"
 ],
 "Burnham": [
  "Burnham"
 ],
 "Ladbrooks": [
  "Ladbrooks"
 ],
 "Motukarara": [
  "Motukarara"
 ],
 "Greenpark": [
  "Greenpark"
 ],
 "Doyleston": [
  "Doyleston"
 ],
 "Southbridge": [
  "Southbridge"
 ],
 "Dunsandel": [
  "Dunsandel"
 ],
 "Selwyn Huts": [
  "Selwyn Huts"
 ],
 "Kirwee": [
  "Kirwee"
 ],
 "Charing Cross": [
  "Charing Cross"
 ],
 "Aylesbury": [
  "Aylesbury"
 ],
 "Sheffield": [
  "Sheffield"
 ],
 "Waddington": [
  "Waddington"
 ],
 "Springfield": [
  "Springfield"
 ],
 "Castle Hill": [
  "Castle Hill"
 ],
 "Arthurs Pass": [
  "Arthurs Pass"
 ],
 "Coalgate": [
  "Coalgate"
 ],
 "Glentunnel": [
  "Glentunnel"
 ],
 "Whitecliffs": [
  "Whitecliffs"
 ],
 "Hororata": [
  "Hororata"
 ],
 "Windwhistle": [
  "Windwhistle"
 ],
 "Lake Coleridge": [
  "Lake Coleridge"
 ],
 "Little River": [
  "Little River"
 ],
 "Birdlings Flat": [
  "Birdlings Flat"
 ],
 "Akaroa": [
  "Akaroa"
 ],
 "Duvauchelle": [
  "Duvauchelle"
 ],
 "Takamatua": [
  "Takamatua"
 ],
 "Barrys Bay": [
  "Barrys Bay"
 ],
 "Wainui": [
  "Wainui"
 ],
 "Okains Bay": [
  "Okains Bay"
 ],
 "Le Bons Bay": [
  "Le Bons Bay"
 ],
 "Little Akaloa": [
  "Little Akaloa"
 ],
 "Pigeon Bay": [
  "Pigeon Bay"
 ],
 "Port Levy": [
  "Port Levy"
 ],
 "Rakaia": [
  "Rakaia"
 ],
 "Rakaia Huts": [
  "Rakaia Huts"
 ],
 "Barrhill": [
  "Barrhill"
 ],
 "Methven": [
  "Methven"
 ],
 "Mount Somers": [
  "Mount Somers"
 ],
 "Staveley": [
  "Staveley"
 ],
 "Springburn": [
  "Springburn"
 ],
 "Mayfield": [
  "Mayfield"
 ],
 "Ashburton": [
  "Ashburton",
  "Allenton",
  "Hampstead",
  "Netherby",
  "Tinwald"
 ],
 "Fairton": [
  "Fairton"
 ],
 "Winslow": [
  "Winslow"
 ],
 "Dromore": [
  "Dromore"
 ],
 "Chertsey": [
  "Chertsey"
 ],
 "Lauriston": [
  "Lauriston"
 ],
 "Willowby": [
  "Willowby"
 ],
 "Wakanui": [
  "Wakanui"
 ],
 "Seafield": [
  "Seafield"
 ],
 "Longbeach": [
  "Longbeach"
 ],
 "Hinds": [
  "Hinds"
 ],
 "Ealing": [
  "Ealing"
 ],
 "Lowcliffe": [
  "Lowcliffe"
 ],
 "Rangitata": [
  "Rangitata"
 ],
 "Orari": [
  "Orari"
 ],
 "Arundel": [
  "Arundel"
 ],
 "Geraldine": [
  "Geraldine"
 ],
 "Woodbury": [
  "Woodbury"
 ],
 "Peel Forest": [
  "Peel Forest"
 ],
 "Winchester": [
  "Winchester"
 ],
 "Temuka": [
  "Temuka"
 ],
 "Clandeboye": [
  "Clandeboye"
 ],
 "Pleasant Point": [
  "Pleasant Point"
 ],
 "Cave": [
  "Cave"
 ],
 "Timaru": [
  "Timaru",
  "Fairview",
  "Gleniti",
  "Glenwood",
  "Highfield",
  "Maori Hill",
  "Marchwiel",
  "Parkside",
  "Redruth",
  "Seaview",
  "Waimataitai",
  "Washdyke",
  "Watlington",
  "West End"
 ],
 "Seadown": [
  "Seadown"
 ],
 "Levels": [
  "Levels"
 ],
 "Pareora": [
  "Pareora"
 ],
 "St Andrews": [
  "St Andrews"
 ],
 "Makikihi": [
  "Makikihi"
 ],
 "Albury": [
  "Albury"
 ],
 "Fairlie": [
  "Fairlie"
 ],
 "Kimbell": [
  "Kimbell"
 ],
 "Burkes Pass": [
  "Burkes Pass"
 ],
 "Tekapo": [
  "Tekapo"
 ],
 "Twizel": [
  "Twizel"
 ],
 "Mount Cook Village": [
  "Mount Cook Village"
 ],
 "Waimate": [
  "Waimate"
 ],
 "Hook": [
  "Hook"
 ],
 "Studholme": [
  "Studholme"
 ],
 "Morven": [
  "Morven"
 ],
 "Glenavy": [
  "Glenavy"
 ],
 "Auckland": [
  "Albany",
  "Avondale",
  "Balmoral",
  "Beach Haven",
  "Birkenhead",
  "Blockhouse Bay",
  "Botany Downs",
  "Browns Bay",
  "Bucklands Beach",
  "Clendon Park",
  "Clevedon",
  "Cockle Bay",
  "Dannemora",
  "Devonport",
  "Drury",
  "East Tamaki",
  "Eden Terrace",
  "Ellerslie",
  "Epsom",
  "Favona",
  "Flat Bush",
  "Forrest Hill",
  "Freemans Bay",
  "Glen Eden",
  "Glen Innes",
  "Glendene",
  "Glendowie",
  "Glenfield",
  "Grafton",
  "Greenlane",
  "Grey Lynn",
  "Half Moon Bay",
  "Henderson",
  "Herne Bay",
  "Hillsborough",
  "Hobsonville",
  "Howick",
  "Huapai",
  "Kelston",
  "Kingsland",
  "Kohimarama",
  "Kumeu",
  "Lynfield",
  "Mairangi Bay",
  "Mangere",
  "Mangere Bridge",
  "Mangere East",
  "Manukau",
  "Manurewa",
  "Massey",
  "Meadowbank",
  "Mellons Bay",
  "Milford",
  "Millwater",
  "Mission Bay",
  "Morningside",
  "Mount Albert",
  "Mount Eden",
  "Mount Roskill",
  "Mount Wellington",
  "Murrays Bay",
  "Narrow Neck",
  "New Lynn",
  "New Windsor",
  "Newmarket",
  "Newton",
  "Northcote",
  "Northcross",
  "Onehunga",
  "Orewa",
  "Otahuhu",
  "Otara",
  "Oteha",
  "Pahurehure",
  "Pakuranga",
  "Panmure",
  "Papakura",
  "Papatoetoe",
  "Parnell",
  "Penrose",
  "Pinehill",
  "Point Chevalier",
  "Ponsonby",
  "Pukekohe",
  "Ranui",
  "Remuera",
  "Rosedale",
  "Rothesay Bay",
  "Royal Oak",
  "Sandringham",
  "Silverdale",
  "Snells Beach",
  "St Heliers",
  "St Johns",
  "St Lukes",
  "Stanmore Bay",
  "Stonefields",
  "Sunnynook",
  "Sunnyvale",
  "Swanson",
  "Takapuna",
  "Te Atatu Peninsula",
  "Te Atatu South",
  "Three Kings",
  "Titirangi",
  "Torbay",
  "Totara Heights",
  "Unsworth Heights",
  "Waitakere",
  "Waiuku",
  "Wattle Downs",
  "Wellsford",
  "West Harbour",
  "Western Springs",
  "Westgate",
  "Westmere",
  "Whangaparaoa",
  "Whenuapai",
  "Windsor Park",
  "Wiri"
 ],
 "Warkworth": [
  "Warkworth"
 ],
 "Snells Beach": [
  "Snells Beach"
 ],
 "Algies Bay": [
  "Algies Bay"
 ],
 "Sandspit": [
  "Sandspit"
 ],
 "Matakana": [
  "Matakana"
 ],
 "Point Wells": [
  "Point Wells"
 ],
 "Omaha": [
  "Omaha"
 ],
 "Leigh": [
  "Leigh"
 ],
 "Pakiri": [
  "Pakiri"
 ],
 "Kaipara Flats": [
  "Kaipara Flats"
 ],
 "Wellsford": [
  "Wellsford"
 ],
 "Te Hana": [
  "Te Hana"
 ],
 "Tomarata": [
  "Tomarata"
 ],
 "Puhoi": [
  "Puhoi"
 ],
 "Waiwera": [
  "Waiwera"
 ],
 "Hatfields Beach": [
  "Hatfields Beach"
 ],
 "Kaukapakapa": [
  "Kaukapakapa"
 ],
 "Waitoki": [
  "Waitoki"
 ],
 "Dairy Flat": [
  "Dairy Flat"
 ],
 "Coatesville": [
  "Coatesville"
 ],
 "Helensville": [
  "Helensville"
 ],
 "Parakai": [
  "Parakai"
 ],
 "South Head": [
  "South Head"
 ],
 "Shelly Beach": [
  "Shelly Beach"
 ],
 "Riverhead": [
  "Riverhead"
 ],
 "Kumeu": [
  "Kumeu"
 ],
 "Huapai": [
  "Huapai"
 ],
 "Waimauku": [
  "Waimauku"
 ],
 "Muriwai": [
  "Muriwai"
 ],
 "Bethells Beach": [
  "Bethells Beach"
 ],
 "Piha": [
  "Piha"
 ],
 "Karekare": [
  "Karekare"
 ],
 "Huia": [
  "Huia"
 ],
 "Cornwallis": [
  "Cornwallis"
 ],
 "Oratia": [
  "Oratia"
 ],
 "Henderson Valley": [
  "Henderson Valley"
 ],
 "Whitford": [
  "Whitford"
 ],
 "Brookby": [
  "Brookby"
 ],
 "Beachlands": [
  "Beachlands"
 ],
 "Maraetai": [
  "Maraetai"
 ],
 "Clevedon": [
  "Clevedon"
 ],
 "Kawakawa Bay": [
  "Kawakawa Bay"
 ],
 "Orere Point": [
  "Orere Point"
 ],
 "Ardmore": [
  "Ardmore"
 ],
 "Karaka": [
  "Karaka"
 ],
 "Kingseat": [
  "Kingseat"
 ],
 "Waiau Pa": [
  "Waiau Pa"
 ],
 "Clarks Beach": [
  "Clarks Beach"
 ],
 "Glenbrook": [
  "Glenbrook"
 ],
 "Waiuku": [
  "Waiuku"
 ],
 "Awhitu": [
  "Awhitu"
 ],
 "Matakawau": [
  "Matakawau"
 ],
 "Pukekohe": [
  "Pukekohe"
 ],
 "Buckland": [
  "Buckland"
 ],
 "Paerata": [
  "Paerata"
 ],
 "Patumahoe": [
  "Patumahoe"
 ],
 "Ramarama": [
  "Ramarama"
 ],
 "Bombay": [
  "Bombay"
 ],
 "Waiheke Island": [
  "Waiheke Island",
  "Blackpool",
  "Oneroa",
  "Onetangi",
  "Ostend",
  "Palm Beach",
  "Rocky Bay",
  "Surfdale"
 ],
 "Great Barrier Island": [
  "Great Barrier Island",
  "Claris",
  "Medlands",
  "Okiwi",
  "Okupu",
  "Port FitzRoy",
  "Tryphena",
  "Whangaparapara"
 ],
 "Kawau Island": [
  "Kawau Island"
 ],
 "Whangarei": [
  "Whangarei",
  "Avenues",
  "Glenbervie",
  "Horahora",
  "Kamo",
  "Kensington",
  "Mairtown",
  "Maunu",
  "Morningside",
  "Onerahi",
  "Otaika",
  "Otangarei",
  "Parua Bay",
  "Raumanga",
  "Regent",
  "Riverside",
  "Sherwood Rise",
  "Springs Flat",
  "Three Mile Bush",
  "Tikipunga",
  "Whau Valley",
  "Woodhill"
 ],
 "Kerikeri": [
  "Kerikeri"
 ],
 "Waipapa": [
  "Waipapa"
 ],
 "Paihia": [
  "Paihia"
 ],
 "Waitangi": [
  "Waitangi"
 ],
 "Haruru": [
  "Haruru"
 ],
 "Opua": [
  "Opua"
 ],
 "Russell": [
  "Russell"
 ],
 "Kawakawa": [
  "Kawakawa"
 ],
 "Moerewa": [
  "Moerewa"
 ],
 "Kaikohe": [
  "Kaikohe"
 ],
 "Ngawha Springs": [
  "Ngawha Springs"
 ],
 "Okaihau": [
  "Okaihau"
 ],
 "Ohaeawai": [
  "Ohaeawai"
 ],
 "Kaeo": [
  "Kaeo"
 ],
 "Whangaroa": [
  "Whangaroa"
 ],
 "Totara North": [
  "Totara North"
 ],
 "Matauri Bay": [
  "Matauri Bay"
 ],
 "Mangonui": [
  "Mangonui"
 ],
 "Coopers Beach": [
  "Coopers Beach"
 ],
 "Cable Bay": [
  "Cable Bay"
 ],
 "Taipa": [
  "Taipa"
 ],
 "Hihi": [
  "Hihi"
 ],
 "Whatuwhiwhi": [
  "Whatuwhiwhi"
 ],
 "Tokerau Beach": [
  "Tokerau Beach"
 ],
 "Awanui": [
  "Awanui"
 ],
 "Kaitaia": [
  "Kaitaia"
 ],
 "Ahipara": [
  "Ahipara"
 ],
 "Pukenui": [
  "Pukenui"
 ],
 "Houhora": [
  "Houhora"
 ],
 "Ngataki": [
  "Ngataki"
 ],
 "Te Kao": [
  "Te Kao"
 ],
 "Herekino": [
  "Herekino"
 ],
 "Broadwood": [
  "Broadwood"
 ],
 "Panguru": [
  "Panguru"
 ],
 "Kohukohu": [
  "Kohukohu"
 ],
 "Rawene": [
  "Rawene"
 ],
 "Horeke": [
  "Horeke"
 ],
 "Opononi": [
  "Opononi"
 ],
 "Omapere": [
  "Omapere"
 ],
 "Waimamaku": [
  "Waimamaku"
 ],
 "Hikurangi": [
  "Hikurangi"
 ],
 "Whakapara": [
  "Whakapara"
 ],
 "Towai": [
  "Towai"
 ],
 "Ngunguru": [
  "Ngunguru"
 ],
 "Tutukaka": [
  "Tutukaka"
 ],
 "Matapouri": [
  "Matapouri"
 ],
 "Whananaki": [
  "Whananaki"
 ],
 "Oakura": [
  "Oakura"
 ],
 "Whangarei Heads": [
  "Whangarei Heads"
 ],
 "McLeod Bay": [
  "McLeod Bay"
 ],
 "Pataua": [
  "Pataua"
 ],
 "Portland": [
  "Portland"
 ],
 "Oakleigh": [
  "Oakleigh"
 ],
 "Ruakaka": [
  "Ruakaka"
 ],
 "One Tree Point": [
  "One Tree Point"
 ],
 "Marsden Point": [
  "Marsden Point"
 ],
 "Waipu": [
  "Waipu"
 ],
 "Waipu Cove": [
  "Waipu Cove"
 ],
 "Langs Beach": [
  "Langs Beach"
 ],
 "Mangawhai": [
  "Mangawhai"
 ],
 "Mangawhai Heads": [
  "Mangawhai Heads"
 ],
 "Kaiwaka": [
  "Kaiwaka"
 ],
 "Maungaturoto": [
  "Maungaturoto"
 ],
 "Paparoa": [
  "Paparoa"
 ],
 "Matakohe": [
  "Matakohe"
 ],
 "Ruawai": [
  "Ruawai"
 ],
 "Te Kopuru": [
  "Te Kopuru"
 ],
 "Dargaville": [
  "Dargaville"
 ],
 "Baylys Beach": [
  "Baylys Beach"
 ],
 "Tangowahine": [
  "Tangowahine"
 ],
 "Kaihu": [
  "Kaihu"
 ],
 "Tangiteroria": [
  "Tangiteroria"
 ],
 "Maungakaramea": [
  "Maungakaramea"
 ],
 "Waiotira": [
  "Waiotira"
 ],
 "Poroti": [
  "Poroti"
 ],
 "Titoki": [
  "Titoki"
 ],
 "Kokopu": [
  "Kokopu"
 ],
 "Hamilton": [
  "Hamilton",
  "Bader",
  "Beerescourt",
  "Burbush",
  "Chartwell",
  "Chedworth Park",
  "Claudelands",
  "Crawshaw",
  "Deanwell",
  "Dinsdale",
  "Enderley",
  "Fairfield",
  "Fairview Downs",
  "Fitzroy",
  "Flagstaff",
  "Forest Lake",
  "Frankton",
  "Glenview",
  "Grandview Heights",
  "Hamilton Central",
  "Hamilton East",
  "Harrowfield",
  "Hillcrest",
  "Horsham Downs",
  "Huntington",
  "Maeroa",
  "Melville",
  "Nawton",
  "Peacocke",
  "Pukete",
  "Queenwood",
  "Riverlea",
  "Rototuna",
  "Rototuna North",
  "Rotokauri",
  "Ruakura",
  "Silverdale",
  "St Andrews",
  "Te Rapa",
  "Temple View",
  "Western Heights",
  "Whitiora"
 ],
 "Cambridge": [
  "Cambridge"
 ],
 "Karapiro": [
  "Karapiro"
 ],
 "Te Awamutu": [
  "Te Awamutu"
 ],
 "Kihikihi": [
  "Kihikihi"
 ],
 "Pirongia": [
  "Pirongia"
 ],
 "Ohaupo": [
  "Ohaupo"
 ],
 "Ngahinapouri": [
  "Ngahinapouri"
 ],
 "Rukuhia": [
  "Rukuhia"
 ],
 "Tamahere": [
  "Tamahere"
 ],
 "Matangi": [
  "Matangi"
 ],
 "Tauwhare": [
  "Tauwhare"
 ],
 "Newstead": [
  "Newstead"
 ],
 "Eureka": [
  "Eureka"
 ],
 "Gordonton": [
  "Gordonton"
 ],
 "Puketaha": [
  "Puketaha"
 ],
 "Te Kowhai": [
  "Te Kowhai"
 ],
 "Horotiu": [
  "Horotiu"
 ],
 "Whatawhata": [
  "Whatawhata"
 ],
 "Ngaruawahia": [
  "Ngaruawahia"
 ],
 "Taupiri": [
  "Taupiri"
 ],
 "Glen Massey": [
  "Glen Massey"
 ],
 "Waingaro": [
  "Waingaro"
 ],
 "Raglan": [
  "Raglan"
 ],
 "Te Uku": [
  "Te Uku"
 ],
 "Huntly": [
  "Huntly"
 ],
 "Ohinewai": [
  "Ohinewai"
 ],
 "Rangiriri": [
  "Rangiriri"
 ],
 "Te Kauwhata": [
  "Te Kauwhata"
 ],
 "Meremere": [
  "Meremere"
 ],
 "Mercer": [
  "Mercer"
 ],
 "Pokeno": [
  "Pokeno"
 ],
 "Tuakau": [
  "Tuakau"
 ],
 "Onewhero": [
  "Onewhero"
 ],
 "Port Waikato": [
  "Port Waikato"
 ],
 "Pukekawa": [
  "Pukekawa"
 ],
 "Morrinsville": [
  "Morrinsville"
 ],
 "Tatuanui": [
  "Tatuanui"
 ],
 "Waitoa": [
  "Waitoa"
 ],
 "Waharoa": [
  "Waharoa"
 ],
 "Matamata": [
  "Matamata"
 ],
 "Te Poi": [
  "Te Poi"
 ],
 "Walton": [
  "Walton"
 ],
 "Hinuera": [
  "Hinuera"
 ],
 "Te Aroha": [
  "Te Aroha"
 ],
 "Manawaru": [
  "Manawaru"
 ],
 "Paeroa": [
  "Paeroa"
 ],
 "Waikino": [
  "Waikino"
 ],
 "Waihi": [
  "Waihi"
 ],
 "Whiritoa": [
  "Whiritoa"
 ],
 "Ngatea": [
  "Ngatea"
 ],
 "Kerepehi": [
  "Kerepehi"
 ],
 "Turua": [
  "Turua"
 ],
 "Waitakaruru": [
  "Waitakaruru"
 ],
 "Kaiaua": [
  "Kaiaua"
 ],
 "Miranda": [
  "Miranda"
 ],
 "Thames": [
  "Thames"
 ],
 "Te Puru": [
  "Te Puru"
 ],
 "Tapu": [
  "Tapu"
 ],
 "Coromandel": [
  "Coromandel"
 ],
 "Kuaotunu": [
  "Kuaotunu"
 ],
 "Matarangi": [
  "Matarangi"
 ],
 "Whitianga": [
  "Whitianga"
 ],
 "Cooks Beach": [
  "Cooks Beach"
 ],
 "Hahei": [
  "Hahei"
 ],
 "Hot Water Beach": [
  "Hot Water Beach"
 ],
 "Coroglen": [
  "Coroglen"
 ],
 "Tairua": [
  "Tairua"
 ],
 "Pauanui": [
  "Pauanui"
 ],
 "Opoutere": [
  "Opoutere"
 ],
 "Onemana": [
  "Onemana"
 ],
 "Whangamata": [
  "Whangamata"
 ],
 "Tirau": [
  "Tirau"
 ],
 "Putaruru": [
  "Putaruru"
 ],
 "Arapuni": [
  "Arapuni"
 ],
 "Lichfield": [
  "Lichfield"
 ],
 "Tokoroa": [
  "Tokoroa"
 ],
 "Mangakino": [
  "Mangakino"
 ],
 "Whakamaru": [
  "Whakamaru"
 ],
 "Otorohanga": [
  "Otorohanga"
 ],
 "Kawhia": [
  "Kawhia"
 ],
 "Te Kuiti": [
  "Te Kuiti"
 ],
 "Waitomo Caves": [
  "Waitomo Caves"
 ],
 "Piopio": [
  "Piopio"
 ],
 "Aria": [
  "Aria"
 ],
 "Benneydale": [
  "Benneydale"
 ],
 "Marokopa": [
  "Marokopa"
 ],
 "Mokau": [
  "Mokau"
 ],
 "Awakino": [
  "Awakino"
 ],
 "Taupo": [
  "Taupo",
  "Acacia Bay",
  "Hilltop",
  "Nukuhau",
  "Rainbow Point",
  "Richmond Heights",
  "Tauhara",
  "Two Mile Bay",
  "Waipahihi",
  "Wharewaka"
 ],
 "Kinloch": [
  "Kinloch"
 ],
 "Wairakei": [
  "Wairakei"
 ],
 "Waitahanui": [
  "Waitahanui"
 ],
 "Motuoapa": [
  "Motuoapa"
 ],
 "Turangi": [
  "Turangi"
 ],
 "Tokaanu": [
  "Tokaanu"
 ],
 "Kuratau": [
  "Kuratau"
 ],
 "Omori": [
  "Omori"
 ],
 "Pukawa": [
  "Pukawa"
 ],
 "Tauranga": [
  "Tauranga",
  "Tauranga Central",
  "Tauranga South",
  "The Avenues",
  "Judea",
  "Otumoetai",
  "Matua",
  "Bureta",
  "Cherrywood",
  "Bellevue",
  "Brookfield",
  "Bethlehem",
  "Pillans Point",
  "Gate Pa",
  "Merivale",
  "Greerton",
  "Parkvale",
  "Pyes Pa",
  "Tauriko",
  "Ohauiti",
  "Hairini",
  "Maungatapu",
  "Welcome Bay",
  "Poike",
  "Matapihi",
  "Sulphur Point",
  "Mount Maunganui",
  "Omanu",
  "Arataki",
  "Bayfair",
  "Papamoa",
  "Papamoa Beach",
  "Palm Beach"
 ],
 "Te Puke": [
  "Te Puke"
 ],
 "Katikati": [
  "Katikati"
 ],
 "Omokoroa": [
  "Omokoroa"
 ],
 "Waihi Beach": [
  "Waihi Beach"
 ],
 "Athenree": [
  "Athenree"
 ],
 "Bowentown": [
  "Bowentown"
 ],
 "Te Puna": [
  "Te Puna"
 ],
 "Minden": [
  "Minden"
 ],
 "Whakamarama": [
  "Whakamarama"
 ],
 "Aongatete": [
  "Aongatete"
 ],
 "Kauri Point": [
  "Kauri Point"
 ],
 "Tanners Point": [
  "Tanners Point"
 ],
 "Matakana Island": [
  "Matakana Island"
 ],
 "Oropi": [
  "Oropi"
 ],
 "Kaimai": [
  "Kaimai"
 ],
 "Paengaroa": [
  "Paengaroa"
 ],
 "Pongakawa": [
  "Pongakawa"
 ],
 "Maketu": [
  "Maketu"
 ],
 "Pukehina": [
  "Pukehina"
 ],
 "Otamarakau": [
  "Otamarakau"
 ],
 "Rotorua": [
  "Rotorua",
  "Rotorua Central",
  "Glenholme",
  "Springfield",
  "Fenton Park",
  "Victoria",
  "Utuhina",
  "Kuirau",
  "Mangakakahi",
  "Western Heights",
  "Selwyn Heights",
  "Fordlands",
  "Pomare",
  "Sunnybrook",
  "Hillcrest",
  "Ohinemutu",
  "Koutu",
  "Kawaha Point",
  "Fairy Springs",
  "Ngongotaha",
  "Ngongotaha Valley",
  "Whakarewarewa",
  "Ngapuna",
  "Owhata",
  "Lynmore",
  "Holdens Bay",
  "Hannahs Bay",
  "Tihiotonga"
 ],
 "Hamurana": [
  "Hamurana"
 ],
 "Mamaku": [
  "Mamaku"
 ],
 "Kaharoa": [
  "Kaharoa"
 ],
 "Okere Falls": [
  "Okere Falls"
 ],
 "Mourea": [
  "Mourea"
 ],
 "Rotoiti": [
  "Rotoiti"
 ],
 "Rotoehu": [
  "Rotoehu"
 ],
 "Tikitere": [
  "Tikitere"
 ],
 "Lake Tarawera": [
  "Lake Tarawera"
 ],
 "Lake Okareka": [
  "Lake Okareka"
 ],
 "Rerewhakaaitu": [
  "Rerewhakaaitu"
 ],
 "Reporoa": [
  "Reporoa"
 ],
 "Ngakuru": [
  "Ngakuru"
 ],
 "Waikite Valley": [
  "Waikite Valley"
 ],
 "Horohoro": [
  "Horohoro"
 ],
 "Whakatane": [
  "Whakatane",
  "Whakatane Central",
  "Awatapu",
  "Coastlands",
  "Hillcrest",
  "Piripai",
  "Otarawairere",
  "Mokorua"
 ],
 "Ohope": [
  "Ohope"
 ],
 "Edgecumbe": [
  "Edgecumbe"
 ],
 "Te Teko": [
  "Te Teko"
 ],
 "Otakiri": [
  "Otakiri"
 ],
 "Awakeri": [
  "Awakeri"
 ],
 "Thornton": [
  "Thornton"
 ],
 "Poroporo": [
  "Poroporo"
 ],
 "Taneatua": [
  "Taneatua"
 ],
 "Waimana": [
  "Waimana"
 ],
 "Ruatoki": [
  "Ruatoki"
 ],
 "Matata": [
  "Matata"
 ],
 "Pikowai": [
  "Pikowai"
 ],
 "Manawahe": [
  "Manawahe"
 ],
 "Murupara": [
  "Murupara"
 ],
 "Galatea": [
  "Galatea"
 ],
 "Waiohau": [
  "Waiohau"
 ],
 "Te Mahoe": [
  "Te Mahoe"
 ],
 "Minginui": [
  "Minginui"
 ],
 "Te Whaiti": [
  "Te Whaiti"
 ],
 "Ruatahuna": [
  "Ruatahuna"
 ],
 "Kaingaroa": [
  "Kaingaroa"
 ],
 "Kawerau": [
  "Kawerau"
 ],
 "Opotiki": [
  "Opotiki"
 ],
 "Waiotahe": [
  "Waiotahe"
 ],
 "Ohiwa": [
  "Ohiwa"
 ],
 "Omarumutu": [
  "Omarumutu"
 ],
 "Torere": [
  "Torere"
 ],
 "Hawai": [
  "Hawai"
 ],
 "Omaio": [
  "Omaio"
 ],
 "Te Kaha": [
  "Te Kaha"
 ],
 "Whanarua Bay": [
  "Whanarua Bay"
 ],
 "Raukokore": [
  "Raukokore"
 ],
 "Waihau Bay": [
  "Waihau Bay"
 ],
 "Cape Runaway": [
  "Cape Runaway"
 ],
 "Gisborne": [
  "Gisborne",
  "Gisborne Central",
  "Whataupoko",
  "Mangapapa",
  "Te Hapara",
  "Elgin",
  "Awapuni",
  "Riverdale",
  "Lytton West",
  "Kaiti",
  "Outer Kaiti",
  "Tamarau",
  "Makaraka",
  "Matawhero",
  "Wainui",
  "Okitu"
 ],
 "Wainui Beach": [
  "Wainui Beach"
 ],
 "Makorori": [
  "Makorori"
 ],
 "Tatapouri": [
  "Tatapouri"
 ],
 "Whangara": [
  "Whangara"
 ],
 "Manutuke": [
  "Manutuke"
 ],
 "Patutahi": [
  "Patutahi"
 ],
 "Ormond": [
  "Ormond"
 ],
 "Ngatapa": [
  "Ngatapa"
 ],
 "Rere": [
  "Rere"
 ],
 "Waerengaokuri": [
  "Waerengaokuri"
 ],
 "Tiniroto": [
  "Tiniroto"
 ],
 "Te Karaka": [
  "Te Karaka"
 ],
 "Whatatutu": [
  "Whatatutu"
 ],
 "Matawai": [
  "Matawai"
 ],
 "Motu": [
  "Motu"
 ],
 "Tolaga Bay": [
  "Tolaga Bay"
 ],
 "Tokomaru Bay": [
  "Tokomaru Bay"
 ],
 "Waipiro Bay": [
  "Waipiro Bay"
 ],
 "Te Puia Springs": [
  "Te Puia Springs"
 ],
 "Ruatoria": [
  "Ruatoria"
 ],
 "Tikitiki": [
  "Tikitiki"
 ],
 "Rangitukia": [
  "Rangitukia"
 ],
 "Te Araroa": [
  "Te Araroa"
 ],
 "Hicks Bay": [
  "Hicks Bay"
 ],
 "Potaka": [
  "Potaka"
 ],
 "Napier": [
  "Napier",
  "Napier Central",
  "Napier South",
  "Bluff Hill",
  "Hospital Hill",
  "Ahuriri",
  "Westshore",
  "Bay View",
  "Poraiti",
  "Marewa",
  "Onekawa",
  "Pirimai",
  "Tamatea",
  "Greenmeadows",
  "Taradale",
  "Maraenui",
  "Meeanee",
  "Awatoto",
  "Jervoistown",
  "Te Awa"
 ],
 "Hastings": [
  "Hastings",
  "Hastings Central",
  "Mayfair",
  "Raureka",
  "Akina",
  "Parkvale",
  "Mahora",
  "Frimley",
  "Camberley",
  "St Leonards",
  "Tomoana",
  "Havelock North",
  "Flaxmere"
 ],
 "Clive": [
  "Clive"
 ],
 "Whakatu": [
  "Whakatu"
 ],
 "Haumoana": [
  "Haumoana"
 ],
 "Te Awanga": [
  "Te Awanga"
 ],
 "Waimarama": [
  "Waimarama"
 ],
 "Pakipaki": [
  "Pakipaki"
 ],
 "Bridge Pa": [
  "Bridge Pa"
 ],
 "Twyford": [
  "Twyford"
 ],
 "Fernhill": [
  "Fernhill"
 ],
 "Maraekakaho": [
  "Maraekakaho"
 ],
 "Puketapu": [
  "Puketapu"
 ],
 "Rissington": [
  "Rissington"
 ],
 "Patoka": [
  "Patoka"
 ],
 "Puketitiri": [
  "Puketitiri"
 ],
 "Eskdale": [
  "Eskdale"
 ],
 "Tangoio": [
  "Tangoio"
 ],
 "Tutira": [
  "Tutira"
 ],
 "Te Pohue": [
  "Te Pohue"
 ],
 "Putorino": [
  "Putorino"
 ],
 "Mohaka": [
  "Mohaka"
 ],
 "Raupunga": [
  "Raupunga"
 ],
 "Wairoa": [
  "Wairoa"
 ],
 "Frasertown": [
  "Frasertown"
 ],
 "Tuai": [
  "Tuai"
 ],
 "Waikaremoana": [
  "Waikaremoana"
 ],
 "Ruakituri": [
  "Ruakituri"
 ],
 "Whakaki": [
  "Whakaki"
 ],
 "Nuhaka": [
  "Nuhaka"
 ],
 "Morere": [
  "Morere"
 ],
 "Mahia": [
  "Mahia"
 ],
 "Mahia Beach": [
  "Mahia Beach"
 ],
 "Waipawa": [
  "Waipawa"
 ],
 "Waipukurau": [
  "Waipukurau"
 ],
 "Otane": [
  "Otane"
 ],
 "Tikokino": [
  "Tikokino"
 ],
 "Ongaonga": [
  "Ongaonga"
 ],
 "Takapau": [
  "Takapau"
 ],
 "Elsthorpe": [
  "Elsthorpe"
 ],
 "Porangahau": [
  "Porangahau"
 ],
 "Kairakau Beach": [
  "Kairakau Beach"
 ],
 "Hatuma": [
  "Hatuma"
 ],
 "New Plymouth": [
  "New Plymouth",
  "New Plymouth Central",
  "Strandon",
  "Fitzroy",
  "Glen Avon",
  "Merrilands",
  "Highlands Park",
  "Welbourn",
  "Vogeltown",
  "Frankleigh Park",
  "Hurdon",
  "Westown",
  "Marfell",
  "Spotswood",
  "Moturoa",
  "Lynmouth",
  "Blagdon",
  "Brooklands",
  "Hillsborough",
  "Mangorei",
  "Waiwhakaiho",
  "Bell Block",
  "Ferndale"
 ],
 "Waitara": [
  "Waitara"
 ],
 "Inglewood": [
  "Inglewood"
 ],
 "Okato": [
  "Okato"
 ],
 "Urenui": [
  "Urenui"
 ],
 "Onaero": [
  "Onaero"
 ],
 "Tikorangi": [
  "Tikorangi"
 ],
 "Motunui": [
  "Motunui"
 ],
 "Lepperton": [
  "Lepperton"
 ],
 "Egmont Village": [
  "Egmont Village"
 ],
 "Uruti": [
  "Uruti"
 ],
 "Tongaporutu": [
  "Tongaporutu"
 ],
 "Omata": [
  "Omata"
 ],
 "Warea": [
  "Warea"
 ],
 "Pungarehu": [
  "Pungarehu"
 ],
 "Parihaka": [
  "Parihaka"
 ],
 "Rahotu": [
  "Rahotu"
 ],
 "Oaonui": [
  "Oaonui"
 ],
 "Opunake": [
  "Opunake"
 ],
 "Otakeho": [
  "Otakeho"
 ],
 "Manaia": [
  "Manaia"
 ],
 "Kaponga": [
  "Kaponga"
 ],
 "Eltham": [
  "Eltham"
 ],
 "Stratford": [
  "Stratford"
 ],
 "Midhirst": [
  "Midhirst"
 ],
 "Tariki": [
  "Tariki"
 ],
 "Toko": [
  "Toko"
 ],
 "Douglas": [
  "Douglas"
 ],
 "Te Wera": [
  "Te Wera"
 ],
 "Whangamomona": [
  "Whangamomona"
 ],
 "Hawera": [
  "Hawera"
 ],
 "Normanby": [
  "Normanby"
 ],
 "Okaiawa": [
  "Okaiawa"
 ],
 "Matapu": [
  "Matapu"
 ],
 "Kakaramea": [
  "Kakaramea"
 ],
 "Manutahi": [
  "Manutahi"
 ],
 "Patea": [
  "Patea"
 ],
 "Whenuakura": [
  "Whenuakura"
 ],
 "Waverley": [
  "Waverley"
 ],
 "Waitotara": [
  "Waitotara"
 ],
 "Palmerston North": [
  "Palmerston North",
  "Palmerston North Central",
  "West End",
  "Terrace End",
  "Hokowhitu",
  "Awapuni",
  "Takaro",
  "Highbury",
  "Cloverlea",
  "Milson",
  "Kelvin Grove",
  "Roslyn",
  "Westbrook",
  "Aokautere",
  "Fitzherbert",
  "Summerhill",
  "Whakarongo"
 ],
 "Whanganui": [
  "Whanganui",
  "Whanganui Central",
  "Whanganui East",
  "Aramoho",
  "Castlecliff",
  "Gonville",
  "Springvale",
  "St Johns Hill",
  "Durie Hill",
  "Bastia Hill",
  "College Estate",
  "Tawhero",
  "Otamatea",
  "Putiki",
  "Westmere",
  "Kaierau",
  "Wembley Park"
 ],
 "Feilding": [
  "Feilding"
 ],
 "Levin": [
  "Levin"
 ],
 "Marton": [
  "Marton"
 ],
 "Dannevirke": [
  "Dannevirke"
 ],
 "Taumarunui": [
  "Taumarunui"
 ],
 "Foxton": [
  "Foxton"
 ],
 "Foxton Beach": [
  "Foxton Beach"
 ],
 "Bulls": [
  "Bulls"
 ],
 "Taihape": [
  "Taihape"
 ],
 "Ohakune": [
  "Ohakune"
 ],
 "Raetihi": [
  "Raetihi"
 ],
 "Waiouru": [
  "Waiouru"
 ],
 "National Park": [
  "National Park"
 ],
 "Pahiatua": [
  "Pahiatua"
 ],
 "Woodville": [
  "Woodville"
 ],
 "Eketahuna": [
  "Eketahuna"
 ],
 "Norsewood": [
  "Norsewood"
 ],
 "Ormondville": [
  "Ormondville"
 ],
 "Shannon": [
  "Shannon"
 ],
 "Tokomaru": [
  "Tokomaru"
 ],
 "Ashhurst": [
  "Ashhurst"
 ],
 "Sanson": [
  "Sanson"
 ],
 "Rongotea": [
  "Rongotea"
 ],
 "Halcombe": [
  "Halcombe"
 ],
 "Kimbolton": [
  "Kimbolton"
 ],
 "Cheltenham": [
  "Cheltenham"
 ],
 "Colyton": [
  "Colyton"
 ],
 "Awahuri": [
  "Awahuri"
 ],
 "Apiti": [
  "Apiti"
 ],
 "Pohangina": [
  "Pohangina"
 ],
 "Himatangi Beach": [
  "Himatangi Beach"
 ],
 "Tangimoana": [
  "Tangimoana"
 ],
 "Waitarere Beach": [
  "Waitarere Beach"
 ],
 "Hokio Beach": [
  "Hokio Beach"
 ],
 "Waikawa Beach": [
  "Waikawa Beach"
 ],
 "Manakau": [
  "Manakau"
 ],
 "Ohau": [
  "Ohau"
 ],
 "Kuku": [
  "Kuku"
 ],
 "Opiki": [
  "Opiki"
 ],
 "Hunterville": [
  "Hunterville"
 ],
 "Mangaweka": [
  "Mangaweka"
 ],
 "Utiku": [
  "Utiku"
 ],
 "Ohingaiti": [
  "Ohingaiti"
 ],
 "Turakina": [
  "Turakina"
 ],
 "Ratana": [
  "Ratana"
 ],
 "Koitiata": [
  "Koitiata"
 ],
 "Kai Iwi": [
  "Kai Iwi"
 ],
 "Maxwell": [
  "Maxwell"
 ],
 "Fordell": [
  "Fordell"
 ],
 "Upokongaro": [
  "Upokongaro"
 ],
 "Brunswick": [
  "Brunswick"
 ],
 "Mowhanau": [
  "Mowhanau"
 ],
 "Whangaehu": [
  "Whangaehu"
 ],
 "Jerusalem": [
  "Jerusalem"
 ],
 "Ranana": [
  "Ranana"
 ],
 "Koriniti": [
  "Koriniti"
 ],
 "Pipiriki": [
  "Pipiriki"
 ],
 "Owhango": [
  "Owhango"
 ],
 "Manunui": [
  "Manunui"
 ],
 "Kakahi": [
  "Kakahi"
 ],
 "Piriaka": [
  "Piriaka"
 ],
 "Ongarue": [
  "Ongarue"
 ],
 "Waimiha": [
  "Waimiha"
 ],
 "Ohura": [
  "Ohura"
 ],
 "Matiere": [
  "Matiere"
 ],
 "Raurimu": [
  "Raurimu"
 ],
 "Horopito": [
  "Horopito"
 ],
 "Erua": [
  "Erua"
 ],
 "Rangataua": [
  "Rangataua"
 ],
 "Whakapapa Village": [
  "Whakapapa Village"
 ],
 "Pongaroa": [
  "Pongaroa"
 ],
 "Weber": [
  "Weber"
 ],
 "Akitio": [
  "Akitio"
 ],
 "Herbertville": [
  "Herbertville"
 ],
 "Alfredton": [
  "Alfredton"
 ],
 "Mangatainoka": [
  "Mangatainoka"
 ],
 "Longburn": [
  "Longburn"
 ],
 "Linton": [
  "Linton"
 ],
 "Bunnythorpe": [
  "Bunnythorpe"
 ],
 "Wellington City": [
  "Wellington City",
  "Wellington Central",
  "Te Aro",
  "Thorndon",
  "Pipitea",
  "Mount Victoria",
  "Mount Cook",
  "Aro Valley",
  "Kelburn",
  "Northland",
  "Karori",
  "Wilton",
  "Wadestown",
  "Highbury",
  "Brooklyn",
  "Vogeltown",
  "Mornington",
  "Kingston",
  "Happy Valley",
  "Berhampore",
  "Newtown",
  "Melrose",
  "Island Bay",
  "Owhiro Bay",
  "Houghton Bay",
  "Southgate",
  "Lyall Bay",
  "Rongotai",
  "Kilbirnie",
  "Hataitai",
  "Roseneath",
  "Oriental Bay",
  "Evans Bay",
  "Maupuia",
  "Miramar",
  "Strathmore Park",
  "Seatoun",
  "Breaker Bay",
  "Moa Point",
  "Worser Bay",
  "Karaka Bays",
  "Ngaio",
  "Khandallah",
  "Crofton Downs",
  "Broadmeadows",
  "Kaiwharawhara",
  "Ngauranga",
  "Johnsonville",
  "Newlands",
  "Paparangi",
  "Woodridge",
  "Grenada Village",
  "Grenada North",
  "Churton Park",
  "Glenside",
  "Horokiwi",
  "Tawa",
  "Linden",
  "Redwood",
  "Takapu Valley",
  "Makara",
  "Makara Beach",
  "Ohariu"
 ],
 "Lower Hutt": [
  "Lower Hutt",
  "Hutt Central",
  "Petone",
  "Alicetown",
  "Melling",
  "Belmont",
  "Kelson",
  "Maungaraki",
  "Normandale",
  "Tirohanga",
  "Korokoro",
  "Harbour View",
  "Boulcott",
  "Epuni",
  "Waterloo",
  "Woburn",
  "Moera",
  "Waiwhetu",
  "Gracefield",
  "Seaview",
  "Naenae",
  "Avalon",
  "Taita",
  "Fairfield",
  "Stokes Valley",
  "Manor Park",
  "Haywards",
  "Wainuiomata",
  "Arakura",
  "Homedale",
  "Parkway",
  "Eastbourne",
  "Days Bay",
  "Lowry Bay",
  "York Bay",
  "Mahina Bay",
  "Point Howard",
  "Muritai",
  "Sunshine Bay"
 ],
 "Upper Hutt": [
  "Upper Hutt",
  "Upper Hutt Central",
  "Trentham",
  "Heretaunga",
  "Silverstream",
  "Pinehaven",
  "Wallaceville",
  "Elderslea",
  "Ebdentown",
  "Clouston Park",
  "Totara Park",
  "Maoribank",
  "Birchville",
  "Brown Owl",
  "Timberlea",
  "Te Marua",
  "Kaitoke",
  "Akatarawa",
  "Maymorn",
  "Riverstone Terraces",
  "Whitemans Valley",
  "Blue Mountains",
  "Emerald Hill",
  "Mount Marua"
 ],
 "Porirua": [
  "Porirua",
  "Porirua Central",
  "Porirua East",
  "Cannons Creek",
  "Waitangirua",
  "Ranui Heights",
  "Ascot Park",
  "Elsdon",
  "Takapuwahia",
  "Titahi Bay",
  "Kenepuru",
  "Aotea",
  "Whitby",
  "Papakowhai",
  "Paremata",
  "Camborne",
  "Mana",
  "Plimmerton",
  "Karehana Bay",
  "Pukerua Bay",
  "Hongoeka",
  "Pauatahanui",
  "Judgeford"
 ],
 "Paraparaumu": [
  "Paraparaumu",
  "Paraparaumu Beach",
  "Raumati Beach",
  "Raumati South",
  "Otaihanga",
  "Kena Kena"
 ],
 "Waikanae": [
  "Waikanae",
  "Waikanae Beach",
  "Waikanae East"
 ],
 "Otaki": [
  "Otaki",
  "Otaki Beach",
  "Otaki Railway"
 ],
 "Paekakariki": [
  "Paekakariki"
 ],
 "Te Horo": [
  "Te Horo"
 ],
 "Peka Peka": [
  "Peka Peka"
 ],
 "Masterton": [
  "Masterton",
  "Masterton Central",
  "Lansdowne",
  "Solway",
  "Kuripuni",
  "Upper Plain",
  "Douglas Park"
 ],
 "Carterton": [
  "Carterton"
 ],
 "Greytown": [
  "Greytown"
 ],
 "Featherston": [
  "Featherston"
 ],
 "Martinborough": [
  "Martinborough"
 ],
 "Riversdale Beach": [
  "Riversdale Beach"
 ],
 "Castlepoint": [
  "Castlepoint"
 ],
 "Tinui": [
  "Tinui"
 ],
 "Mauriceville": [
  "Mauriceville"
 ],
 "Opaki": [
  "Opaki"
 ],
 "Gladstone": [
  "Gladstone"
 ],
 "Ngawi": [
  "Ngawi"
 ],
 "Lake Ferry": [
  "Lake Ferry"
 ],
 "Pirinoa": [
  "Pirinoa"
 ],
 "Blenheim": [
  "Blenheim",
  "Blenheim Central",
  "Springlands",
  "Redwoodtown",
  "Witherlea",
  "Mayfield",
  "Riversdale",
  "Islington",
  "Burleigh",
  "Whitney Street",
  "Omaka"
 ],
 "Picton": [
  "Picton",
  "Picton Central",
  "Waikawa"
 ],
 "Renwick": [
  "Renwick"
 ],
 "Havelock": [
  "Havelock"
 ],
 "Seddon": [
  "Seddon"
 ],
 "Ward": [
  "Ward"
 ],
 "Rai Valley": [
  "Rai Valley"
 ],
 "Spring Creek": [
  "Spring Creek"
 ],
 "Grovetown": [
  "Grovetown"
 ],
 "Tuamarina": [
  "Tuamarina"
 ],
 "Rapaura": [
  "Rapaura"
 ],
 "Rarangi": [
  "Rarangi"
 ],
 "Fairhall": [
  "Fairhall"
 ],
 "Wairau Valley": [
  "Wairau Valley"
 ],
 "Riverlands": [
  "Riverlands"
 ],
 "Woodbourne": [
  "Woodbourne"
 ],
 "Koromiko": [
  "Koromiko"
 ],
 "Linkwater": [
  "Linkwater"
 ],
 "Anakiwa": [
  "Anakiwa"
 ],
 "Canvastown": [
  "Canvastown"
 ],
 "Okiwi Bay": [
  "Okiwi Bay"
 ],
 "French Pass": [
  "French Pass"
 ],
 "Portage": [
  "Portage"
 ],
 "Ngakuta Bay": [
  "Ngakuta Bay"
 ],
 "Te Mahia": [
  "Te Mahia"
 ],
 "Elaine Bay": [
  "Elaine Bay"
 ],
 "Nelson": [
  "Nelson",
  "Nelson Central",
  "The Wood",
  "The Brook",
  "Britannia Heights",
  "Nelson South",
  "Toi Toi",
  "Washington Valley",
  "Port Nelson",
  "Tahunanui",
  "Bishopdale",
  "Enner Glynn",
  "Ngawhatu",
  "Stoke",
  "Wakatu",
  "Annesbrook",
  "Monaco",
  "Nayland",
  "Atawhai",
  "Marybank",
  "Wakapuaka",
  "Maitai Valley",
  "Beachville",
  "Isel Park",
  "Ranzau"
 ],
 "Hira": [
  "Hira"
 ],
 "Glenduan": [
  "Glenduan"
 ],
 "Todds Valley": [
  "Todds Valley"
 ],
 "Richmond": [
  "Richmond"
 ],
 "Motueka": [
  "Motueka"
 ],
 "Takaka": [
  "Takaka"
 ],
 "Brightwater": [
  "Brightwater"
 ],
 "Wakefield": [
  "Wakefield"
 ],
 "Mapua": [
  "Mapua"
 ],
 "Murchison": [
  "Murchison"
 ],
 "Tapawera": [
  "Tapawera"
 ],
 "Collingwood": [
  "Collingwood"
 ],
 "Riwaka": [
  "Riwaka"
 ],
 "Kaiteriteri": [
  "Kaiteriteri"
 ],
 "Marahau": [
  "Marahau"
 ],
 "Ngatimoti": [
  "Ngatimoti"
 ],
 "Upper Moutere": [
  "Upper Moutere"
 ],
 "Lower Moutere": [
  "Lower Moutere"
 ],
 "Tasman": [
  "Tasman"
 ],
 "Ruby Bay": [
  "Ruby Bay"
 ],
 "Hope": [
  "Hope"
 ],
 "Appleby": [
  "Appleby"
 ],
 "Redwood Valley": [
  "Redwood Valley"
 ],
 "Wai-iti": [
  "Wai-iti"
 ],
 "Foxhill": [
  "Foxhill"
 ],
 "Belgrove": [
  "Belgrove"
 ],
 "Motupiko": [
  "Motupiko"
 ],
 "Korere": [
  "Korere"
 ],
 "Golden Downs": [
  "Golden Downs"
 ],
 "Stanley Brook": [
  "Stanley Brook"
 ],
 "Dovedale": [
  "Dovedale"
 ],
 "St Arnaud": [
  "St Arnaud"
 ],
 "Owen River": [
  "Owen River"
 ],
 "Glenhope": [
  "Glenhope"
 ],
 "Pohara": [
  "Pohara"
 ],
 "Ligar Bay": [
  "Ligar Bay"
 ],
 "Tata Beach": [
  "Tata Beach"
 ],
 "Patons Rock": [
  "Patons Rock"
 ],
 "Onekaka": [
  "Onekaka"
 ],
 "Puponga": [
  "Puponga"
 ],
 "Bainham": [
  "Bainham"
 ],
 "Tarakohe": [
  "Tarakohe"
 ],
 "Westport": [
  "Westport"
 ],
 "Carters Beach": [
  "Carters Beach"
 ],
 "Cape Foulwind": [
  "Cape Foulwind"
 ],
 "Charleston": [
  "Charleston"
 ],
 "Waimangaroa": [
  "Waimangaroa"
 ],
 "Granity": [
  "Granity"
 ],
 "Ngakawau": [
  "Ngakawau"
 ],
 "Hector": [
  "Hector"
 ],
 "Seddonville": [
  "Seddonville"
 ],
 "Mokihinui": [
  "Mokihinui"
 ],
 "Little Wanganui": [
  "Little Wanganui"
 ],
 "Karamea": [
  "Karamea"
 ],
 "Inangahua Junction": [
  "Inangahua Junction"
 ],
 "Reefton": [
  "Reefton"
 ],
 "Springs Junction": [
  "Springs Junction"
 ],
 "Maruia": [
  "Maruia"
 ],
 "Ikamatua": [
  "Ikamatua"
 ],
 "Ahaura": [
  "Ahaura"
 ],
 "Nelson Creek": [
  "Nelson Creek"
 ],
 "Totara Flat": [
  "Totara Flat"
 ],
 "Blackball": [
  "Blackball"
 ],
 "Runanga": [
  "Runanga"
 ],
 "Rapahoe": [
  "Rapahoe"
 ],
 "Barrytown": [
  "Barrytown"
 ],
 "Punakaiki": [
  "Punakaiki"
 ],
 "Greymouth": [
  "Greymouth",
  "Blaketown",
  "Cobden",
  "Karoro",
  "Boddytown",
  "Marsden",
  "Gladstone",
  "South Beach",
  "Paroa",
  "Kaiata"
 ],
 "Dobson": [
  "Dobson"
 ],
 "Taylorville": [
  "Taylorville"
 ],
 "Stillwater": [
  "Stillwater"
 ],
 "Moana": [
  "Moana"
 ],
 "Kumara": [
  "Kumara"
 ],
 "Kumara Junction": [
  "Kumara Junction"
 ],
 "Otira": [
  "Otira"
 ],
 "Hokitika": [
  "Hokitika"
 ],
 "Arahura": [
  "Arahura"
 ],
 "Ross": [
  "Ross"
 ],
 "Ruatapu": [
  "Ruatapu"
 ],
 "Hari Hari": [
  "Hari Hari"
 ],
 "Whataroa": [
  "Whataroa"
 ],
 "Franz Josef": [
  "Franz Josef"
 ],
 "Fox Glacier": [
  "Fox Glacier"
 ],
 "Bruce Bay": [
  "Bruce Bay"
 ],
 "Haast": [
  "Haast"
 ],
 "Jackson Bay": [
  "Jackson Bay"
 ],
 "Okuru": [
  "Okuru"
 ],
 "Oamaru": [
  "Oamaru",
  "Awamoa",
  "Glen Warren",
  "Holmes Hill",
  "Redcastle",
  "South Hill",
  "Weston"
 ],
 "Kakanui": [
  "Kakanui"
 ],
 "Maheno": [
  "Maheno"
 ],
 "Enfield": [
  "Enfield"
 ],
 "Ngapara": [
  "Ngapara"
 ],
 "Tokarahi": [
  "Tokarahi"
 ],
 "Duntroon": [
  "Duntroon"
 ],
 "Kurow": [
  "Kurow"
 ],
 "Otematata": [
  "Otematata"
 ],
 "Omarama": [
  "Omarama"
 ],
 "Georgetown": [
  "Georgetown"
 ],
 "Herbert": [
  "Herbert"
 ],
 "Waianakarua": [
  "Waianakarua"
 ],
 "Hampden": [
  "Hampden"
 ],
 "Moeraki": [
  "Moeraki"
 ],
 "Palmerston": [
  "Palmerston"
 ],
 "Dunback": [
  "Dunback"
 ],
 "Macraes Flat": [
  "Macraes Flat"
 ],
 "Waikouaiti": [
  "Waikouaiti"
 ],
 "Karitane": [
  "Karitane"
 ],
 "Seacliff": [
  "Seacliff"
 ],
 "Warrington": [
  "Warrington"
 ],
 "Waitati": [
  "Waitati"
 ],
 "Purakaunui": [
  "Purakaunui"
 ],
 "Aramoana": [
  "Aramoana"
 ],
 "Dunedin": [
  "Dunedin",
  "Abbotsford",
  "Andersons Bay",
  "Balaclava",
  "Belleknowes",
  "Broad Bay",
  "Brockville",
  "Burnside",
  "Calton Hill",
  "Caversham",
  "City Rise",
  "Company Bay",
  "Concord",
  "Corstorphine",
  "Dalmore",
  "Dunedin Central",
  "Fairfield",
  "Forbury",
  "Glenleith",
  "Green Island",
  "Halfway Bush",
  "Helensburgh",
  "Kaikorai",
  "Kenmure",
  "Kew",
  "Leith Valley",
  "Liberton",
  "Lookout Point",
  "Macandrew Bay",
  "Maia",
  "Maori Hill",
  "Maryhill",
  "Mornington",
  "Mosgiel",
  "Musselburgh",
  "Normanby",
  "North Dunedin",
  "North East Valley",
  "Ocean Grove",
  "Ocean View",
  "Opoho",
  "Pine Hill",
  "Port Chalmers",
  "Portobello",
  "Ravensbourne",
  "Roslyn",
  "Sawyers Bay",
  "Shiel Hill",
  "South Dunedin",
  "St Clair",
  "St Kilda",
  "St Leonards",
  "Sunnyvale",
  "Tainui",
  "Vauxhall",
  "Wakari",
  "Waldronville",
  "Waverley",
  "Woodhaugh"
 ],
 "Careys Bay": [
  "Careys Bay"
 ],
 "Outram": [
  "Outram"
 ],
 "East Taieri": [
  "East Taieri"
 ],
 "Wingatui": [
  "Wingatui"
 ],
 "Allanton": [
  "Allanton"
 ],
 "Momona": [
  "Momona"
 ],
 "Henley": [
  "Henley"
 ],
 "Brighton": [
  "Brighton"
 ],
 "Taieri Mouth": [
  "Taieri Mouth"
 ],
 "Waihola": [
  "Waihola"
 ],
 "Middlemarch": [
  "Middlemarch"
 ],
 "Hyde": [
  "Hyde"
 ],
 "Sutton": [
  "Sutton"
 ],
 "Milton": [
  "Milton"
 ],
 "Waitahuna": [
  "Waitahuna"
 ],
 "Lawrence": [
  "Lawrence"
 ],
 "Beaumont": [
  "Beaumont"
 ],
 "Balclutha": [
  "Balclutha"
 ],
 "Stirling": [
  "Stirling"
 ],
 "Kaitangata": [
  "Kaitangata"
 ],
 "Clydevale": [
  "Clydevale"
 ],
 "Owaka": [
  "Owaka"
 ],
 "Pounawea": [
  "Pounawea"
 ],
 "Kaka Point": [
  "Kaka Point"
 ],
 "Papatowai": [
  "Papatowai"
 ],
 "Clinton": [
  "Clinton"
 ],
 "Waiwera South": [
  "Waiwera South"
 ],
 "Tapanui": [
  "Tapanui"
 ],
 "Heriot": [
  "Heriot"
 ],
 "Ettrick": [
  "Ettrick"
 ],
 "Millers Flat": [
  "Millers Flat"
 ],
 "Roxburgh": [
  "Roxburgh"
 ],
 "Alexandra": [
  "Alexandra"
 ],
 "Clyde": [
  "Clyde"
 ],
 "Earnscleugh": [
  "Earnscleugh"
 ],
 "Chatto Creek": [
  "Chatto Creek"
 ],
 "Omakau": [
  "Omakau"
 ],
 "Ophir": [
  "Ophir"
 ],
 "Lauder": [
  "Lauder"
 ],
 "Becks": [
  "Becks"
 ],
 "St Bathans": [
  "St Bathans"
 ],
 "Oturehua": [
  "Oturehua"
 ],
 "Wedderburn": [
  "Wedderburn"
 ],
 "Naseby": [
  "Naseby"
 ],
 "Ranfurly": [
  "Ranfurly"
 ],
 "Patearoa": [
  "Patearoa"
 ],
 "Waipiata": [
  "Waipiata"
 ],
 "Kyeburn": [
  "Kyeburn"
 ],
 "Poolburn": [
  "Poolburn"
 ],
 "Cromwell": [
  "Cromwell"
 ],
 "Bannockburn": [
  "Bannockburn"
 ],
 "Lowburn": [
  "Lowburn"
 ],
 "Pisa Moorings": [
  "Pisa Moorings"
 ],
 "Tarras": [
  "Tarras"
 ],
 "Luggate": [
  "Luggate"
 ],
 "Wanaka": [
  "Wanaka"
 ],
 "Albert Town": [
  "Albert Town"
 ],
 "Hawea Flat": [
  "Hawea Flat"
 ],
 "Lake Hawea": [
  "Lake Hawea"
 ],
 "Makarora": [
  "Makarora"
 ],
 "Cardrona": [
  "Cardrona"
 ],
 "Arrowtown": [
  "Arrowtown"
 ],
 "Queenstown": [
  "Queenstown",
  "Arthurs Point",
  "Fernhill",
  "Frankton",
  "Hanleys Farm",
  "Jacks Point",
  "Kelvin Heights",
  "Lake Hayes",
  "Lake Hayes Estate",
  "Quail Rise",
  "Queenstown Hill",
  "Shotover Country",
  "Sunshine Bay"
 ],
 "Gibbston": [
  "Gibbston"
 ],
 "Glenorchy": [
  "Glenorchy"
 ],
 "Kingston": [
  "Kingston"
 ],
 "Invercargill": [
  "Invercargill",
  "Appleby",
  "Avenal",
  "Clifton",
  "Georgetown",
  "Gladstone",
  "Glengarry",
  "Grasmere",
  "Hargest",
  "Hawthorndale",
  "Heidelberg",
  "Invercargill Central",
  "Kew",
  "Kingswell",
  "Myross Bush",
  "Newfield",
  "Otatara",
  "Prestonville",
  "Richmond",
  "Rosedale",
  "Strathern",
  "Tisbury",
  "Waikiwi",
  "Waverley",
  "Windsor",
  "Woodend"
 ],
 "Bluff": [
  "Bluff"
 ],
 "Kennington": [
  "Kennington"
 ],
 "Makarewa": [
  "Makarewa"
 ],
 "Lorneville": [
  "Lorneville"
 ],
 "Ryal Bush": [
  "Ryal Bush"
 ],
 "Wallacetown": [
  "Wallacetown"
 ],
 "Waianiwa": [
  "Waianiwa"
 ],
 "Winton": [
  "Winton"
 ],
 "Limehills": [
  "Limehills"
 ],
 "Centre Bush": [
  "Centre Bush"
 ],
 "Dipton": [
  "Dipton"
 ],
 "Lumsden": [
  "Lumsden"
 ],
 "Mossburn": [
  "Mossburn"
 ],
 "Athol": [
  "Athol"
 ],
 "Garston": [
  "Garston"
 ],
 "Balfour": [
  "Balfour"
 ],
 "Riversdale": [
  "Riversdale"
 ],
 "Waikaia": [
  "Waikaia"
 ],
 "Waikaka": [
  "Waikaka"
 ],
 "Mandeville": [
  "Mandeville"
 ],
 "Gore": [
  "Gore",
  "East Gore"
 ],
 "Mataura": [
  "Mataura"
 ],
 "Pukerau": [
  "Pukerau"
 ],
 "Edendale": [
  "Edendale"
 ],
 "Wyndham": [
  "Wyndham"
 ],
 "Woodlands": [
  "Woodlands"
 ],
 "Dacre": [
  "Dacre"
 ],
 "Mokotua": [
  "Mokotua"
 ],
 "Gorge Road": [
  "Gorge Road"
 ],
 "Tokanui": [
  "Tokanui"
 ],
 "Fortrose": [
  "Fortrose"
 ],
 "Waikawa": [
  "Waikawa"
 ],
 "Curio Bay": [
  "Curio Bay"
 ],
 "Otautau": [
  "Otautau"
 ],
 "Nightcaps": [
  "Nightcaps"
 ],
 "Ohai": [
  "Ohai"
 ],
 "Drummond": [
  "Drummond"
 ],
 "Browns": [
  "Browns"
 ],
 "Thornbury": [
  "Thornbury"
 ],
 "Riverton": [
  "Riverton"
 ],
 "Colac Bay": [
  "Colac Bay"
 ],
 "Orepuki": [
  "Orepuki"
 ],
 "Tuatapere": [
  "Tuatapere"
 ],
 "Clifden": [
  "Clifden"
 ],
 "Blackmount": [
  "Blackmount"
 ],
 "Manapouri": [
  "Manapouri"
 ],
 "Te Anau": [
  "Te Anau"
 ],
 "Milford Sound": [
  "Milford Sound"
 ],
 "Oban": [
  "Oban"
 ]
};

// Fold the nationwide towns into DEMO.towns so every existing picker goes
// nationwide without changing its call sites. Loads after demo.js.
if (typeof DEMO !== 'undefined' && DEMO.towns) Object.assign(DEMO.towns, NZ_TOWNS);

const NZLoc = {
  isLaunched(name, region) {
    if (!name) return false;
    if (region) return NZ_LAUNCHED.has(`${name}|${region}`);
    // No region to hand? Launched only if every region using this name is.
    const hits = [...NZ_LAUNCHED].filter((k) => k.slice(0, k.indexOf('|')) === name);
    return hits.length > 0;
  },
  // <optgroup> markup for a suburb <select>, grouped by region then town.
  options(list, selectedId) {
    const byRegion = {};
    for (const s of list) (byRegion[s.region] ??= []).push(s);
    return Object.keys(byRegion).sort().map((region) => {
      const opts = byRegion[region]
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => `<option value="${s.id}" ${String(s.id) === String(selectedId) ? 'selected' : ''}>${s.name}</option>`)
        .join('');
      return `<optgroup label="${region}">${opts}</optgroup>`;
    }).join('');
  },
};
