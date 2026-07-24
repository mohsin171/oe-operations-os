// Simple availability engine: next open weekday slots (Mon-Fri, 9-5, hourly).
// Real Google/Outlook calendar sync attaches at client onboarding.
export function nextSlots(n = 8) {
  const slots = [];
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 3); // min notice
  let guard = 0;
  while (slots.length < n && guard++ < 400) {
    d.setHours(d.getHours() + 1);
    const day = d.getDay(), hr = d.getHours();
    if (day >= 1 && day <= 5 && hr >= 9 && hr <= 16) slots.push(new Date(d).toISOString());
    if (hr >= 16) { d.setHours(9); d.setDate(d.getDate() + 1); }
  }
  return slots;
}
