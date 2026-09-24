// The cleaning cost estimator on /cleaning-cost-calculator.
//
// Every number here is derived from two things: rates cleaners actually
// advertise on Match Maid, and how long a clean of a given size takes. Both are
// stated on the page rather than hidden in the script, because the entire point
// of the page - and of the product - is that the pricing is not a mystery.
//
// It deliberately produces a RANGE, never a single figure. A calculator that
// says "$127" invites someone to treat it as a quote, then feel misled when a
// cleaner says $150 for a house they have actually seen. A range with the
// working shown sets an expectation instead of making a promise.
(function () {
  // Hours for a home in reasonable order. Fitted to the table on
  // /house-cleaning-prices so the two pages cannot drift apart:
  //   1 bed / 1 bath -> 1.8h    3 bed / 2 bath -> 3.05h    4 bed / 2 bath -> 3.5h
  var BASE_HOURS = 1.0, PER_BEDROOM = 0.45, PER_BATHROOM = 0.35;

  // A maintained home takes less time than one being reset. This is the single
  // biggest lever on what a household actually pays, which is why it is a
  // control on the calculator rather than a footnote.
  var FREQUENCY = {
    weekly: { mult: 0.85, label: 'a week', visitsPerMonth: 4.33 },
    fortnightly: { mult: 1.0, label: 'a fortnight', visitsPerMonth: 2.17 },
    monthly: { mult: 1.15, label: 'a month', visitsPerMonth: 1 },
    'one-off': { mult: 1.4, label: 'one-off', visitsPerMonth: 0 },
  };

  // Rate bands are what cleaners on Match Maid advertise, as at September 2026.
  // `hours` is how much longer the job is than a regular clean of the same home.
  var CLEAN = {
    regular: { low: 35, high: 50, hours: 1, name: 'regular clean' },
    deep: { low: 50, high: 65, hours: 2.2, name: 'deep clean' },
    'end-of-tenancy': { low: 50, high: 65, hours: 2.4, name: 'end of tenancy clean' },
  };

  var $ = function (id) { return document.getElementById(id); };
  var form = $('calc');
  if (!form) return;

  var out = $('calcOut');
  var freqRow = $('calcFreqRow');

  var round5 = function (n) { return Math.round(n / 5) * 5; };
  var money = function (n) { return '$' + round5(n).toLocaleString('en-NZ'); };
  // One decimal place, but never "3.0 hours".
  var hrs = function (n) { return (Math.round(n * 2) / 2).toFixed(1).replace(/\.0$/, ''); };

  function estimate() {
    var beds = Number($('calcBeds').value);
    var baths = Number($('calcBaths').value);
    var type = $('calcType').value;
    var freq = $('calcFreq').value;
    var clean = CLEAN[type] || CLEAN.regular;

    // An end-of-tenancy clean happens once, by definition. Rather than let the
    // frequency control produce "a bond clean every week", it is hidden and
    // forced - a disabled control people cannot see is not confusing.
    var oneOffOnly = type === 'end-of-tenancy';
    freqRow.hidden = oneOffOnly;
    if (oneOffOnly) freq = 'one-off';
    var f = FREQUENCY[freq] || FREQUENCY.fortnightly;

    var hours = (BASE_HOURS + PER_BEDROOM * beds + PER_BATHROOM * baths) * clean.hours * f.mult;
    var low = hours * clean.low;
    var high = hours * clean.high;

    var visitLine = f.visitsPerMonth
      ? 'about ' + money(low) + ' to ' + money(high) + ' each visit'
      : 'about ' + money(low) + ' to ' + money(high) + ' for the job';

    var monthly = f.visitsPerMonth
      ? '<p class="calc-monthly">Roughly ' + money(low * f.visitsPerMonth) + ' to ' +
        money(high * f.visitsPerMonth) + ' a month, at one clean ' + f.label + '.</p>'
      : '';

    out.innerHTML =
      '<p class="calc-hours">' + hrs(hours) + ' hours</p>' +
      '<p class="calc-range">' + visitLine + '</p>' +
      monthly +
      '<p class="calc-working">A ' + beds + '-bedroom, ' + baths + '-bathroom home, ' +
      clean.name + '. Based on cleaners charging $' + clean.low + ' to $' + clean.high +
      ' an hour for this clean on Match Maid.</p>' +
      '<a class="btn solid" href="/browse?service=' + type + '">See cleaners in this range</a>';
  }

  form.addEventListener('input', estimate);
  form.addEventListener('change', estimate);
  form.addEventListener('submit', function (e) { e.preventDefault(); estimate(); });
  estimate();
})();
