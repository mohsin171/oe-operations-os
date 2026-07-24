// The daily briefing: a short, plain-English read of the pipeline for a partner opening
// the dashboard in the morning. Built from the real numbers so it is always accurate and
// costs nothing to render. Reads like a human summarised the board.
const money = (n) => '$' + Number(n || 0).toLocaleString('en-US');

export function buildBriefing(stats) {
  if (!stats || stats.empty) return 'No leads in the pipeline yet. Import a list or connect a source to begin.';

  const parts = [];
  const hot = stats.hotWaiting || 0;
  const hotValue = stats.byStage?.hot?.value || 0;

  if (hot > 0) {
    parts.push(
      `${hot} hot ${hot === 1 ? 'lead is' : 'leads are'} ready for a partner` +
      (hotValue ? `, worth ${money(hotValue)} in potential work` : '') + '.'
    );
  } else {
    parts.push('No hot leads waiting right now.');
  }

  if (stats.dueNow > 0) {
    parts.push(`${stats.dueNow} follow-up ${stats.dueNow === 1 ? 'message is' : 'messages are'} due to send.`);
  }

  const stuckN = (stats.stuck || []).length;
  if (stuckN > 0) {
    parts.push(`${stuckN} ${stuckN === 1 ? 'lead has' : 'leads have'} gone quiet and may need a human touch.`);
  }

  if (stats.weightedValue) {
    parts.push(`Weighted pipeline forecast is ${money(stats.weightedValue)} across everything open.`);
  }

  return parts.join(' ');
}
