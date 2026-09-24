// The lowest hourly rate a listing may advertise, per country, and the reason
// in the words customers and cleaners are actually shown.
//
// Its own module because two things need it and only one of them can import
// server.js: importing server.js starts an HTTP server, so a maintenance script
// that wanted the floor used to have no choice but to restate the number. Two
// copies of a price floor is one copy too many - they drift, and the day they
// drift the site rejects a rate it is simultaneously advertising as allowed.
export const COUNTRY_FLOORS = {
  // The adult minimum wage, not a round number we picked. A listing under it is
  // a typo or a test value rather than an offer - nobody can legally be
  // employed at it - and while it shows it sorts to the top of every
  // cheapest-first search and drags the directory's perceived price down.
  NZ: 23.95,
  // Higher on purpose: A$20/hr is below the Australian casual minimum wage, so
  // it cannot be the floor for an Australian listing the way it is for a NZ one.
  AU: 30,
};

// Said to the person whose rate was rejected, so it reads as a reason rather
// than a rule. Kept beside the number it explains.
export const COUNTRY_FLOOR_WHY = {
  NZ: 'New Zealand’s adult minimum wage is $23.95 an hour',
  AU: 'the Australian casual minimum wage is above A$30 an hour once casual loading is counted',
};
