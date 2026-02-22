/**
 * One-off: extract Vlad's phrases in political context from conversation.json
 * Run: node scripts/extractPoliticalPhrases.js
 */
import fs from 'fs';

const data = JSON.parse(fs.readFileSync('data/conversation.json', 'utf8'));
const polit = /украин|росси|войн|орк|ватник|мобик|вторжен|сво\b|власть|путин|нато|донбасс|крым|нацист|фашист|захват|агресс|полит|срач|завод|реальность|мобилизац|призыв|контрактник/i;
const vlad = new Set(['Владислав Тимохин', 'Влад']);
const texts = [];
for (let i = 0; i < data.length; i++) {
  const m = data[i];
  if (!vlad.has(m.author)) continue;
  const t = (m.text || '').replace(/^\d{1,2}:\d{2}\s+Влад\s*/i, '').replace(/^\d{1,2}:\d{2}\s+Владислав Тимохин\s*/i, '').trim();
  if (!t || t.length < 10) continue;
  const prev = (data[i - 1] && data[i - 1].text) || '';
  const next = (data[i + 1] && data[i + 1].text) || '';
  if (polit.test(t) || polit.test(prev) || polit.test(next)) texts.push(t);
}
const words = {};
texts.forEach((t) => {
  t.split(/\s+/).filter((w) => w.length > 2).forEach((w) => {
    const x = w.toLowerCase().replace(/[^а-яёa-z0-9]/gi, '');
    if (x.length > 2) words[x] = (words[x] || 0) + 1;
  });
});
const top = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 50).map((e) => e[0]);
console.log('Frequent words:', top.join(', '));
const shortPhrases = [];
const skip = /^(in reply|photo not|video not|sticker not|ислав|тимохин|\d{1,2}:\d{2}|#)/i;
texts.forEach((t) => {
  const parts = t.split(/[.!?]\s+|\n+/);
  parts.forEach((p) => {
    let s = p.trim().replace(/^Владислав Тимохин\s+/i, '').replace(/^\d{1,2}:\d{2}\s+Влад\s*/i, '');
    if (skip.test(s) || s.length < 15 || s.length > 95) return;
    if (!polit.test(s)) return;
    shortPhrases.push(s);
  });
});
const uniq = [...new Set(shortPhrases)].filter((x) => !/not included|exporting settings/i.test(x)).slice(0, 40);
console.log('Sample phrases:\n', uniq.join('\n'));
