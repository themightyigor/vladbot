/**
 * Analyze Vlad's behavior in disputes: traits, patterns, typical words/phrases.
 * Run: node scripts/analyzeVladDisputes.js
 */
import fs from 'fs';

const data = JSON.parse(fs.readFileSync('data/conversation.json', 'utf8'));
const vladAuthors = new Set(['Владислав Тимохин', 'Влад']);

function strip(t) {
  return (t || '')
    .replace(/^\d{1,2}:\d{2}\s+Влад\s*/i, '')
    .replace(/^\d{1,2}:\d{2}\s+Владислав Тимохин\s*/i, '')
    .replace(/In reply to this message\s*/gi, '')
    .replace(/\s*Владислав Тимохин\s*/gi, ' ')
    .replace(/\s*ислав Тимохин\s*/gi, ' ')
    .replace(/\s*Влад\s+/gi, ' ')
    .replace(/\b(Photo|Video file|Sticker) Not included[^.\n]*/gi, '')
    .trim();
}

// Dispute context: politics, conflict, disagreement, insults, escalation
const disputeInMessage = /орк|ватник|мобик|сво\b|завод|войн|украин|росси|вторжен|полит|реальность|похуй|нахуй|конч|заебал|отстань|пиздец|несоглас|не соглас|хуй тебе|иди нахуй|да пошёл|заебись|разъеб|пиздеж|терпил|нытик|база|умнича|доказыва|спор|спорить|обосрал|обоссал|подставил|предател/i;
const disputeInContext = /орк|ватник|мобик|сво\b|завод|войн|украин|ростик|никита|вася|деньги|ипотек|зарплат|работа|зп\b|реальность|полит|вторжен/i;

const vladDisputeMessages = [];
for (let i = 0; i < data.length; i++) {
  const m = data[i];
  if (!vladAuthors.has(m.author)) continue;
  const t = strip(m.text || '');
  if (!t || t.length < 5) continue;
  if (/^Photo Not included|^Video file Not included|^Sticker Not included/i.test(t)) continue;
  const prev = (data[i - 1] && data[i - 1].text) || '';
  const next = (data[i + 1] && data[i + 1].text) || '';
  const inVlad = disputeInMessage.test(t);
  const inContext = disputeInContext.test(prev) || disputeInContext.test(next);
  if (inVlad || inContext) vladDisputeMessages.push({ text: t, prev: prev.slice(0, 120), next: next.slice(0, 120) });
}

// Words (excluding common stopwords and artifacts)
const stop = new Set('и в на не по что как это то всё уже там тебе тебя ему его мне меня кто где когда какой какая какие который которая которые из за от для при до без под над или как так же только ещё уже же ли ни бы вот там тут'.split(/\s+/));
const skipWord = /^(not|included|change|data|exporting|settings|to|download|photo|video|kb|тимохин|ислав|владислав)$|^\d{4,}$/i;
const words = {};
vladDisputeMessages.forEach(({ text }) => {
  const clean = strip(text);
  clean.split(/\s+/).forEach((w) => {
    const x = w.replace(/[^а-яёa-z0-9*]/gi, '').toLowerCase();
    if (x.length >= 2 && x.length <= 20 && !stop.has(x) && !skipWord.test(x)) words[x] = (words[x] || 0) + 1;
  });
});
const topWords = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 80);

// Short phrases (one line = one phrase in ladder style)
const phrases = [];
const skip = /^(in reply|photo not|video not|sticker not|ислав|тимохин|\d{1,2}:\d{2}|#|https?:\/)/i;
vladDisputeMessages.forEach(({ text }) => {
  const lines = text.split(/\n+/).map((l) => strip(l).trim()).filter((l) => l.length >= 6 && l.length <= 120);
  lines.forEach((p) => {
    if (skip.test(p) || /not included|exporting settings|тимохин|ислав тимохин/i.test(p)) return;
    phrases.push(p);
  });
});
const phraseFreq = {};
phrases.forEach((p) => { phraseFreq[p] = (phraseFreq[p] || 0) + 1; });
const topPhrases = Object.entries(phraseFreq).sort((a, b) => b[1] - a[1]).slice(0, 60);

// Pattern categories (heuristic)
const categories = {
  dismissal: [],   // похуй, отстань, да и похуй, не суть
  insult: [],      // конч, урод, обосрался
  selfVictim: [], // я из реальности, меня подставили, терпила
  politics: [],   // орки, ватники, сво, завод
  comparison: [], // я не никита, у меня не изимод
  shortReaction: [] // ага, пф, ну, да ну нахуй
};
const reDismissal = /похуй|отстань|не суть|заебал|всем похуй|да и похуй|да ну нахуй/i;
const reInsult = /конч|урод|твар|ебанат|обосрал|обоссал|дебил|придурок/i;
const reSelfVictim = /реальност|терпил|подставил|надеяться только на себя|я не никита|у меня не|денег нет|нет денег|не по карману/i;
const rePolitics = /орк|ватник|мобик|сво\b|завод|войн|украин|вторжен|зона войны/i;
const reComparison = /я не никита|я не вася|не как игорь|не айтишник|у меня не изимод|не на халяву/i;
const reShort = /^(ну|да|ага|пф|угу|хз|мб|окей|не|да ну|лады|понял)$/i;

vladDisputeMessages.forEach(({ text }) => {
  const lines = text.split(/\n+/).map((l) => strip(l).trim()).filter((l) => l && !/тимохин|ислав тимохин|not included/i.test(l));
  lines.forEach((l) => {
    if (reDismissal.test(l)) categories.dismissal.push(l);
    if (reInsult.test(l)) categories.insult.push(l);
    if (reSelfVictim.test(l)) categories.selfVictim.push(l);
    if (rePolitics.test(l)) categories.politics.push(l);
    if (reComparison.test(l)) categories.comparison.push(l);
    if (l.length <= 25 && reShort.test(l.replace(/[^а-яёa-z]/gi, ''))) categories.shortReaction.push(l);
  });
});

// Dedupe and sample per category
function sample(arr, max = 25) {
  const seen = new Set();
  return arr.filter((x) => {
    const k = x.slice(0, 60).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, max);
}

// Output report
const report = [];
report.push('# Анализ споров Влада в переписках');
report.push('');
report.push(`Всего сообщений Влада в контексте спора/конфликта/политики: **${vladDisputeMessages.length}**`);
report.push('');
report.push('## 1. Частые слова в спорах');
report.push('');
report.push(topWords.map(([w, c]) => `**${w}** (${c})`).join(', '));
report.push('');
report.push('## 2. Повторяющиеся фразы и реплики (типичные формулировки)');
report.push('');
topPhrases.slice(0, 35).forEach(([p, c]) => report.push(`- ${c > 1 ? `(${c}) ` : ''}${p}`));
report.push('');
report.push('## 3. Паттерны поведения по категориям');
report.push('');
report.push('### 3.1 Отмахивание / снисходительность (похуй, отстань, не суть)');
sample(categories.dismissal).forEach((l) => report.push(`- ${l}`));
report.push('');
report.push('### 3.2 Оскорбления / жёсткий тон (конч, урод, обосрался)');
sample(categories.insult).forEach((l) => report.push(`- ${l}`));
report.push('');
report.push('### 3.3 Самооправдание / «я пострадавший» (реальность, терпила, подставили)');
sample(categories.selfVictim).forEach((l) => report.push(`- ${l}`));
report.push('');
report.push('### 3.4 Политика / война / завод (орки, ватники, сво)');
sample(categories.politics).forEach((l) => report.push(`- ${l}`));
report.push('');
report.push('### 3.5 Сравнение с другими (я не Никита, у меня не изимод)');
sample(categories.comparison).forEach((l) => report.push(`- ${l}`));
report.push('');
report.push('## 4. Краткие выводы (черты в споре)');
report.push('');
report.push('- **Лесенка** в спорах сохраняется: короткие фразы с новой строки.');
report.push('- **Отмахивание**: «похуй», «да и похуй», «не суть», «заебал» — уход от аргументации.');
report.push('- **Переход на личности**: конч, уроды, обосрались, ебанаты — при обострении.');
report.push('- **Жертва**: «я из реальности», «меня подставили», «терпила», «только на себя надеяться».');
report.push('- **Политический сленг**: орки, ватники, мобики, сво, завод, зона войны — провокация, без развёрнутой аргументации.');
report.push('- **Сравнение с окружением**: «я не Никита», «у меня не изимод», «не как Игорь» — оправдание через контраст.');
report.push('- **Короткие реакции**: «ну», «ага», «пф», «да ну нахуй» — сбивание пафоса собеседника.');
report.push('');

fs.writeFileSync('data/vlad_disputes_analysis.md', report.join('\n'), 'utf8');
console.log('Written data/vlad_disputes_analysis.md');
console.log('Vlad dispute messages:', vladDisputeMessages.length);
console.log('Top 20 words:', topWords.slice(0, 20).map(([w]) => w).join(', '));
