/**
 * Analyze Vlad's behavior when invited somewhere (отдых, поездки, тусовки) and his attitude to money.
 * Run: node scripts/analyzeVladInvitesAndMoney.js
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

// Context: someone invites / suggests to go somewhere or do something together
const inviteInText = /поехали|поедем|приезжай|приезжай|звать|позвать|зовут|в гости|на дачу|на рыбалку|отдых|тусить|встреча|сборы|собраться|погнали|гости|в субботу|в воскресенье|на выходных|на неделе|приезд|приехать|катайся|кататься|поездк|вылазк|на природу|на шашлык|на пикник|на озеро|в лес|на дачу|Лосево|рыбалк|охот|в баню|бухать|выпить|встретимся|встретиться|отдохнуть|отдыхать|потусоваться|затусить/i;

// Vlad's messages when prev or next message contains invite context
const vladInviteReplies = [];
for (let i = 0; i < data.length; i++) {
  const m = data[i];
  if (!vladAuthors.has(m.author)) continue;
  const t = strip(m.text || '');
  if (!t || t.length < 3) continue;
  if (/^Photo Not included|^Video file Not included/i.test(t)) continue;
  const prev = (data[i - 1] && data[i - 1].text) || '';
  const next = (data[i + 1] && data[i + 1].text) || '';
  if (inviteInText.test(t) || inviteInText.test(prev) || inviteInText.test(next)) {
    vladInviteReplies.push({ text: t, prev: prev.slice(0, 200), next: next.slice(0, 120) });
  }
}

// Money-related: Vlad's messages
const moneyInText = /деньги|денег|денег нет|нет денег|зп\b|зарплат|ипотек|кредит|бабки|бабла|рублей|тысяч|лям|по карману|не по карману|150к|лишних|нищ|бюджет|трат|потратил|проебал|проебали|заработал|платят|заплатить|стоит|цена|дорого|дёшево|не потянуть|потянуть/i;
const vladMoneyMessages = [];
for (let i = 0; i < data.length; i++) {
  const m = data[i];
  if (!vladAuthors.has(m.author)) continue;
  const t = strip(m.text || '');
  if (!t || t.length < 5) continue;
  if (!moneyInText.test(t)) continue;
  if (/^Photo Not included|^Video file Not included/i.test(t)) continue;
  vladMoneyMessages.push(t);
}

// Extract patterns for invites: refusal, delay, condition, agree, excuse (money/health/work)
const invitePatterns = {
  refuse: [],
  delay: [],
  condition: [],
  agree: [],
  excuseMoney: [],
  excuseHealthWork: [],
  short: []
};
const reRefuse = /не могу|не поеду|не приеду|не получится|не смогу|не судьба|отказываюсь|нахуй надо|не надо|не хочу|похуй|заебал/i;
const reDelay = /подумаю|позже|чуть позже|надо подумать|щас занят|пока занят|не знаю|хз|мб|может быть|посмотрим|увидим/i;
const reCondition = /если |если бы|когда |только если|лишь бы|лишь бы|при условии/i;
const reAgree = /поехали|погнали|окей|ок|давай|го|приеду|буду|приду|договорились|найс|отлично|збс|норм|будем/i;
const reExcuseMoney = /денег нет|нет денег|не по карману|деньги нужны|зп |зарплат|кредит|ипотек|150к|лишних нет|бюджет|не потянуть|денег не хватает|нищ|пятизначн/i;
const reExcuseHealth = /нога|спина|здоровь|болит|больн|врач|не могу из-за|нагрузк|терпил|отпуск/i;

function categorizeInvite(text) {
  const lines = text.split(/\n+/).map((l) => strip(l).trim()).filter((l) => l.length > 2);
  lines.forEach((l) => {
    if (reRefuse.test(l)) invitePatterns.refuse.push(l);
    if (reDelay.test(l)) invitePatterns.delay.push(l);
    if (reCondition.test(l)) invitePatterns.condition.push(l);
    if (reAgree.test(l)) invitePatterns.agree.push(l);
    if (reExcuseMoney.test(l)) invitePatterns.excuseMoney.push(l);
    if (reExcuseHealth.test(l)) invitePatterns.excuseHealthWork.push(l);
    if (l.length <= 25 && /^(ну|да|хз|мб|ок|окей|не|ага|угу|пф)$/i.test(l.replace(/[^а-яёa-z]/gi, ''))) invitePatterns.short.push(l);
  });
}
vladInviteReplies.forEach(({ text }) => categorizeInvite(text));

function dedupeSample(arr, max = 30) {
  const seen = new Set();
  return arr.filter((x) => {
    const k = x.slice(0, 70).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, max);
}

// Money: categories
const moneyPatterns = { lack: [], envy: [], work: [], refuse: [], cynical: [] };
const reLack = /денег нет|нет денег|не по карману|лишних нет|150к|не хватает|нищ|пятизначн|не потянуть|выбора нет/i;
const reEnvy = /у них|у вас|у айтишников|изимод|сыт|не как я|реальность/i;
const reWork = /зп|зарплат|работа|завод|кредит|ипотек|платят|смена/i;
const reRefuseMoney = /не поеду из-за денег|денег на поездку|дорого|не потяну/i;
const reCynical = /похуй|всем похуй|презираю|терпил|подставили/i;
vladMoneyMessages.forEach((t) => {
  if (reLack.test(t)) moneyPatterns.lack.push(t);
  if (reEnvy.test(t)) moneyPatterns.envy.push(t);
  if (reWork.test(t)) moneyPatterns.work.push(t);
  if (reRefuseMoney.test(t)) moneyPatterns.refuse.push(t);
  if (reCynical.test(t)) moneyPatterns.cynical.push(t);
});

const report = [];
report.push('# Влад: приглашения отдохнуть и отношение к деньгам');
report.push('');
report.push(`Сообщений Влада в контексте приглашений (поездки, тусовки, отдых): **${vladInviteReplies.length}**`);
report.push(`Сообщений Влада про деньги/зп/кредиты: **${vladMoneyMessages.length}**`);
report.push('');
report.push('## 1. Когда зовут куда-то отдохнуть');
report.push('');
report.push('### 1.1 Отказ / не хочу');
dedupeSample(invitePatterns.refuse).forEach((l) => report.push(`- ${l}`));
report.push('');
report.push('### 1.2 Откладывание / неуверенность (подумаю, хз, мб, позже)');
dedupeSample(invitePatterns.delay).forEach((l) => report.push(`- ${l}`));
report.push('');
report.push('### 1.3 Условия (если, когда, только если)');
dedupeSample(invitePatterns.condition).forEach((l) => report.push(`- ${l}`));
report.push('');
report.push('### 1.4 Согласие (поехали, погнали, ок, буду)');
dedupeSample(invitePatterns.agree).forEach((l) => report.push(`- ${l}`));
report.push('');
report.push('### 1.5 Отмазка деньгами (денег нет, не по карману, зп)');
dedupeSample(invitePatterns.excuseMoney).forEach((l) => report.push(`- ${l}`));
report.push('');
report.push('### 1.6 Отмазка здоровьем/работой (нога, спина, завод, терпила)');
dedupeSample(invitePatterns.excuseHealthWork).forEach((l) => report.push(`- ${l}`));
report.push('');
report.push('### 1.7 Примеры полных реплик Влада в контексте приглашений');
vladInviteReplies.slice(0, 40).forEach(({ text }) => {
  const one = text.split(/\n+/)[0]?.trim() || text.slice(0, 150);
  if (one.length > 15) report.push(`- ${one}`);
});
report.push('');
report.push('## 2. Отношение к деньгам');
report.push('');
report.push('### 2.1 Нехватка денег (нет денег, не по карману, 150к, нищая зп)');
dedupeSample(moneyPatterns.lack).forEach((l) => report.push(`- ${l.slice(0, 180)}${l.length > 180 ? '…' : ''}`));
report.push('');
report.push('### 2.2 Сравнение с другими (у них изимод, реальность, не как я)');
dedupeSample(moneyPatterns.envy).forEach((l) => report.push(`- ${l.slice(0, 180)}${l.length > 180 ? '…' : ''}`));
report.push('');
report.push('### 2.3 Работа, зп, кредит, завод');
dedupeSample(moneyPatterns.work).forEach((l) => report.push(`- ${l.slice(0, 180)}${l.length > 180 ? '…' : ''}`));
report.push('');
report.push('### 2.4 Отказ из-за денег (дорого, не потянуть поездку)');
dedupeSample(moneyPatterns.refuse).forEach((l) => report.push(`- ${l.slice(0, 180)}${l.length > 180 ? '…' : ''}`));
report.push('');
report.push('### 2.5 Цинизм (похуй, терпила, подставили)');
dedupeSample(moneyPatterns.cynical).forEach((l) => report.push(`- ${l.slice(0, 180)}${l.length > 180 ? '…' : ''}`));
report.push('');
report.push('## 3. Выводы');
report.push('');
report.push('### Черты Влада при приглашениях отдохнуть');
report.push('- **Тяжёлый на подъём**: часто не «да», а «подумаю», «хз», «мб», «посмотрим», «чуть позже».');
report.push('- **Отмазки деньгами**: «денег нет», «нет 150к лишних», «не по карману», «пятизначная нищая зп» — частая причина отказа или условия.');
report.push('- **Отмазки здоровьем/работой**: нога, спина, завод, смена, терпила, отпуск — вторая линия оправданий.');
report.push('- **Условия**: «если…», «когда будет возможность», «только если» — редко сразу «погнали».');
report.push('- **Короткие реакции**: «ну», «хз», «ок», «мб» — уход от конкретики.');
report.push('- **Иногда соглашается**: «поехали», «погнали», «окей», «буду» — когда тема заходит или без отмазок.');
report.push('');
report.push('### Отношение к деньгам');
report.push('- **Постоянная нехватка**: «денег нет», «не по карману», «150к лишних нет», «нищая зп», «выбора нет».');
report.push('- **Сравнение с окружением**: «у них изимод», «реальность» (ожидание vs реальность), «я не айтишник», «не как они» — оправдание через контраст.');
report.push('- **Работа и кредиты**: зп, завод, смена, кредитная нагрузка, ипотека — деньги всегда привязаны к ограничениям.');
report.push('- **Цинизм**: «похуй», «терпила», «все подставили», «только на себя надеяться» — деньги как причина страданий.');
report.push('');

fs.writeFileSync('data/vlad_invites_and_money_analysis.md', report.join('\n'), 'utf8');
console.log('Written data/vlad_invites_and_money_analysis.md');
console.log('Invite context messages:', vladInviteReplies.length);
console.log('Money messages:', vladMoneyMessages.length);
