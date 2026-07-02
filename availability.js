// Cleaner availability calendar: load, edit and save the weekly AM/Lunch/PM grid.
const user = Session.require('cleaner');

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOTS = [
  { key: 'am', label: 'Morning', time: '8am – 12pm' },
  { key: 'lunch', label: 'Midday', time: '12pm – 2pm' },
  { key: 'pm', label: 'Afternoon', time: '2pm – 6pm' },
];

let selected = []; // [{day, slot}]

document.getElementById('who').textContent = `Hi, ${user.fullName.split(' ')[0]}`;
document.getElementById('logout').addEventListener('click', () => {
  Session.clear();
  location.href = '/';
});

const cal = document.getElementById('cal');
const saveBtn = document.getElementById('saveBtn');
const saveMsg = document.getElementById('saveMsg');

init();
async function init() {
  try {
    const res = await fetch(`/api/availability?userId=${encodeURIComponent(user.id)}`);
    if (res.ok) {
      const data = await res.json();
      selected = data.slots || [];
    }
  } catch {
    /* start empty */
  }
  cal.innerHTML = calendarHTML(selected);
  wireCalendar(cal, selected);
}

function calendarHTML(sel) {
  const isSel = (day, slot) => sel.some((s) => s.day === day && s.slot === slot);
  let html = '<div class="cal-grid">';
  html += '<div class="cal-corner"></div>';
  DAYS.forEach((d) => (html += `<div class="cal-day">${d}</div>`));
  SLOTS.forEach((slot) => {
    html += `<div class="cal-slot"><strong>${slot.label}</strong><span>${slot.time}</span></div>`;
    DAYS.forEach((_, day) => {
      html += `<button type="button" class="cal-cell ${isSel(day, slot.key) ? 'on' : ''}"
        data-day="${day}" data-slot="${slot.key}" aria-pressed="${isSel(day, slot.key)}"></button>`;
    });
  });
  html += '</div>';
  return html;
}

function wireCalendar(container, sel) {
  container.querySelectorAll('.cal-cell').forEach((cell) =>
    cell.addEventListener('click', () => {
      const day = Number(cell.dataset.day);
      const slot = cell.dataset.slot;
      const i = sel.findIndex((s) => s.day === day && s.slot === slot);
      const on = i < 0;
      if (on) sel.push({ day, slot });
      else sel.splice(i, 1);
      cell.classList.toggle('on', on);
      cell.setAttribute('aria-pressed', String(on));
      saveMsg.textContent = 'Unsaved changes';
      saveMsg.className = 'save-msg pending';
    })
  );
}

saveBtn.addEventListener('click', async () => {
  saveMsg.textContent = 'Saving…';
  saveMsg.className = 'save-msg';
  try {
    const res = await fetch('/api/availability', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, slots: selected }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    saveMsg.textContent = `Saved. ${data.saved} slot${data.saved === 1 ? '' : 's'} set.`;
    saveMsg.className = 'save-msg ok';
  } catch (err) {
    saveMsg.textContent = err.message || 'Could not save.';
    saveMsg.className = 'save-msg error';
  }
});
