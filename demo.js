// Demo data so the portals work standalone (no server / database needed).
// When the real API is live these screens can be switched to fetch instead.
const DEMO = {
  DAYS: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  SLOTS: [
    { key: 'am', label: 'Morning', time: '8am – 12pm' },
    { key: 'lunch', label: 'Midday', time: '12pm – 2pm' },
    { key: 'pm', label: 'Afternoon', time: '2pm – 6pm' },
  ],

  suburbs: [
    'Riccarton', 'Papanui', 'Fendalton', 'Linwood', 'Sumner',
    'Halswell', 'Rolleston', 'Lincoln', 'Rangiora', 'Kaiapoi',
  ],

  // Towns and the suburbs within them (for the location picker).
  towns: {
    Christchurch: [
      'Riccarton', 'Papanui', 'Fendalton', 'Merivale', 'Ilam', 'Addington',
      'St Albans', 'Sydenham', 'Linwood', 'Sumner', 'Halswell', 'Cashmere', 'Hornby',
    ],
    Selwyn: ['Rolleston', 'Lincoln', 'Prebbleton', 'West Melton'],
    Waimakariri: ['Rangiora', 'Kaiapoi', 'Woodend', 'Pegasus'],
  },

  services: [
    { slug: 'regular', name: 'Regular house clean' },
    { slug: 'one-off', name: 'One-off clean' },
    { slug: 'deep', name: 'Deep clean' },
    { slug: 'end-of-tenancy', name: 'End of tenancy' },
    { slug: 'oven', name: 'Oven clean' },
    { slug: 'carpet', name: 'Carpet clean' },
  ],

  cleaners: [
    {
      id: 'c1', name: "Aroha's Home Care", areas: ['Riccarton', 'Fendalton', 'Papanui'],
      services: ['regular', 'deep', 'end-of-tenancy'], rate: 38, rating: 4.9, reviews: 27,
      badges: { id: true, police: true, insurance: true }, featured: true,
      availability: [
        { day: 0, slot: 'am' }, { day: 0, slot: 'pm' }, { day: 2, slot: 'am' },
        { day: 4, slot: 'lunch' }, { day: 5, slot: 'am' },
      ],
    },
    {
      id: 'c2', name: 'Sam the Cleaner', areas: ['Riccarton', 'Halswell'],
      services: ['regular', 'one-off', 'oven'], rate: 35, rating: 4.6, reviews: 12,
      badges: { id: true, police: false, insurance: true }, featured: false,
      availability: [
        { day: 0, slot: 'am' }, { day: 1, slot: 'am' }, { day: 3, slot: 'pm' },
        { day: 5, slot: 'lunch' },
      ],
    },
    {
      id: 'c3', name: 'Sparkle by Mei', areas: ['Rolleston', 'Lincoln'],
      services: ['regular', 'deep', 'carpet'], rate: 40, rating: 4.8, reviews: 8,
      badges: { id: true, police: true, insurance: false }, featured: false,
      availability: [
        { day: 2, slot: 'pm' }, { day: 4, slot: 'am' }, { day: 5, slot: 'am' },
        { day: 6, slot: 'lunch' },
      ],
    },
    {
      id: 'c4', name: 'Fresh Nest', areas: ['Papanui', 'Fendalton', 'Riccarton'],
      services: ['regular', 'deep'], rate: 33, rating: 4.7, reviews: 19,
      badges: { id: true, police: true, insurance: true }, featured: false,
      availability: [
        { day: 0, slot: 'lunch' }, { day: 1, slot: 'pm' }, { day: 3, slot: 'am' },
        { day: 5, slot: 'pm' },
      ],
    },
    {
      id: 'c5', name: 'Tidy Tui', areas: ['Halswell', 'Lincoln'],
      services: ['regular', 'one-off', 'carpet'], rate: 30, rating: 4.4, reviews: 6,
      badges: { id: true, police: false, insurance: false }, featured: false,
      availability: [
        { day: 2, slot: 'am' }, { day: 4, slot: 'pm' }, { day: 6, slot: 'am' },
      ],
    },
  ],

  // The logged-in demo maid (mirrors "Aroha's Home Care").
  maidProfile: {
    businessName: "Aroha's Home Care",
    fullName: 'Aroha Ngata',
    bio: 'Friendly, thorough home cleaner with 8 years experience. I love turning a busy household into a calm, fresh space.',
    baseSuburb: 'Riccarton',
    areas: ['Riccarton', 'Fendalton', 'Papanui'],
    services: ['regular', 'deep', 'end-of-tenancy'],
    rate: 38,
    yearsExperience: 8,
    rating: 4.9,
    reviews: 27,
    listingStatus: 'active',
    matchesUsed: 2,          // trial: free until the 3rd successful match
    matchesTarget: 3,
    tier: 'trial',
    badges: { id: true, police: true, insurance: true },
    availability: [
      { day: 0, slot: 'am' }, { day: 0, slot: 'pm' }, { day: 2, slot: 'am' },
      { day: 4, slot: 'lunch' }, { day: 5, slot: 'am' },
    ],
  },

  enquiriesForMaid: [
    {
      id: 'e1', customer: 'Hannah Wells', suburb: 'Riccarton', service: 'Regular house clean',
      preferred: 'Mon morning', frequency: 'Fortnightly', status: 'new',
      message: 'Hi! After a regular fortnightly clean for a 3-bedroom home. Is Monday morning workable?',
    },
    {
      id: 'e2', customer: 'David Lim', suburb: 'Fendalton', service: 'Deep clean',
      preferred: 'Fri midday', frequency: 'One-off', status: 'new',
      message: 'Looking for a one-off deep clean before guests arrive. How much for roughly 3 hours?',
    },
    {
      id: 'e3', customer: 'Priya Sharma', suburb: 'Papanui', service: 'End of tenancy',
      preferred: 'Sat morning', frequency: 'One-off', status: 'responded',
      message: 'Moving out end of month, need an end-of-tenancy clean. Are you available Saturdays?',
    },
  ],

  reviewsForMaid: [
    {
      author: 'Hannah W.', overall: 5,
      scores: { cleanliness: 5, value: 5, punctuality: 5 },
      comment: 'Spotless every time and always right on time. Wouldn’t go anywhere else.',
    },
    {
      author: 'Tom B.', overall: 5,
      scores: { cleanliness: 5, value: 4, punctuality: 5 },
      comment: 'Fantastic deep clean, the kitchen looked brand new.',
    },
    {
      author: 'Grace M.', overall: 4,
      scores: { cleanliness: 5, value: 4, punctuality: 4 },
      comment: 'Really thorough. Ran a few minutes late but messaged ahead.',
    },
  ],

  // The logged-in demo customer.
  customerProfile: {
    fullName: 'Alex Taylor',
    email: 'alex@example.com',
    defaultSuburb: 'Riccarton',
    address: '12 Kauri Street, Riccarton',
    notes: 'Please knock rather than ring the doorbell (baby napping).',
  },

  customerEnquiries: [
    { id: 'ce1', cleaner: "Aroha's Home Care", service: 'Regular house clean', when: 'Mon morning', status: 'accepted' },
    { id: 'ce2', cleaner: 'Fresh Nest', service: 'Deep clean', when: 'Wed morning', status: 'new' },
  ],

  savedCleaners: ['c1', 'c4'],

  conversations: [
    {
      id: 'conv1', with: "Aroha's Home Care", cleanerId: 'c1', unread: 0,
      messages: [
        { from: 'them', body: 'Hi Alex! Happy to take on a fortnightly Monday clean. Shall we start next week?', at: 'Mon 9:14am' },
        { from: 'me', body: 'That’s perfect, thank you! 9am works for us.', at: 'Mon 9:20am' },
        { from: 'them', body: 'Locked in. See you Monday 9am 🙂', at: 'Mon 9:22am' },
      ],
    },
    {
      id: 'conv2', with: 'Fresh Nest', cleanerId: 'c4', unread: 1,
      messages: [
        { from: 'me', body: 'Hi, would you be free for a deep clean on Wednesday morning?', at: 'Tue 4:01pm' },
        { from: 'them', body: 'Hi Alex, yes I can do Wednesday 8am. Roughly how many bedrooms?', at: 'Tue 4:35pm' },
      ],
    },
  ],
};

// Relevance scoring shared by the customer "find a cleaner" demo (mirrors the
// server: availability overlap 50%, price closeness 30%, rating 20%).
DEMO.scoreCleaner = function (cleaner, { suburb, service, desiredRate, slots }) {
  if (suburb && !cleaner.areas.includes(suburb)) return null;
  if (service && !cleaner.services.includes(service)) return null;

  const sel = slots || [];
  const matched = sel.filter((s) =>
    cleaner.availability.some((a) => a.day === s.day && a.slot === s.slot)
  );
  const availScore = sel.length ? matched.length / sel.length : 0.6;

  let priceScore;
  if (desiredRate == null) priceScore = 0.5;
  else if (cleaner.rate <= desiredRate) priceScore = 1;
  else priceScore = Math.max(0, 1 - (cleaner.rate - desiredRate) / desiredRate);

  const ratingScore = cleaner.rating / 5;
  const score = Math.round(100 * (0.5 * availScore + 0.3 * priceScore + 0.2 * ratingScore));
  return {
    ...cleaner,
    matched,
    matchedCount: matched.length,
    requestedCount: sel.length,
    score,
    tier: score >= 75 ? 'great' : score >= 50 ? 'good' : 'low',
  };
};

window.DEMO = DEMO;
