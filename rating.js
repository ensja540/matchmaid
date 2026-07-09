// Star-rating badge shown beside a cleaner's name once they have reviews.
// Nothing renders for an unrated cleaner — an empty row of stars reads worse
// than no stars at all.
//
// The stars are one greyed row with a gold row clipped over it, so a 4.3 shows
// as 4.3 stars' worth of gold rather than snapping to a whole or half star.
window.Rating = (function () {
  function badge(rating, reviews) {
    const r = Number(rating) || 0;
    const n = Number(reviews) || 0;
    if (n < 1 || r <= 0) return '';
    const pct = Math.max(0, Math.min(100, (r / 5) * 100));
    const label = `${r.toFixed(1)} out of 5 from ${n} review${n === 1 ? '' : 's'}`;
    return (
      `<span class="rating-badge" title="${label}" aria-label="${label}">` +
      `<span class="rating-stars" aria-hidden="true"><i style="width:${pct}%"></i></span>` +
      `<span class="rating-num">${r.toFixed(1)}</span>` +
      `<span class="rating-out">/5</span>` +
      `<span class="rating-count">(${n})</span>` +
      `</span>`
    );
  }
  return { badge };
})();
