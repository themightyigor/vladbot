/**
 * Daily scheduled message: sends a Vladosik-style parody of a legendary meme.
 * Cycles through 3 meme templates in order: Меченый → Ельцин → Деньги → repeat.
 * Used by scripts/sendMorning.js (Railway Cron). Set MORNING_GROUP_CHAT_ID to enable.
 */

import fs from 'fs';
import path from 'path';
import { getReply } from '../ai/openaiService.js';
import { swapFace } from '../services/faceSwapService.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_DIR = process.env.MORNING_STATE_DIR?.trim() || DATA_DIR;
const STATE_FILE = path.join(STATE_DIR, 'morning_state.json');
const TEMPLATES_DIR = path.join(DATA_DIR, 'faceswap', 'templates');

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (_) {}
  return { lastSentDate: null, lastMemeIndex: -1 };
}

function saveState(state) {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('Morning state save failed:', err.message);
  }
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

const VLAD_CONTEXT = `Контекст личности Владосика для переделки мема:
- Работает на заводе Полипласт, вечные смены, переработки, нищая зарплата.
- Ездит на жиге (жигули), мечтает о Ниве, но денег нет.
- Ипотека, кредиты, карта Магнита в минус.
- Жена Катя, малой (ребёнок), пивточка, кромвелька (пиво).
- Раф на кокосовом за 280 рублей — дорого и дифиченто.
- Знакомые (можно упомянуть одного-двух, не всех): Никита (zемский, сытый), Вася (торч), Игорь (айтишник), Ростик, Андрей (ВТБ), Сергей (полипласт).
- Стиль: мат, лесенка (короткие фразы по строкам), тупой но уверенный, приземлённый юмор.`;

const MEME_TEMPLATES = [
  {
    id: 'mecheny',
    signature: 'Сидорович от Владосика228',
    templateImage: path.join(TEMPLATES_DIR, 'mecheny.jpg'),
    faceSwapPrompt: 'This is a composite image. On the left is a screenshot of the character Sidorovich from the game S.T.A.L.K.E.R. On the right is a photo of a real person. Replace Sidorovich\'s face with the face of the person on the right. Keep the original scene, lighting, and composition from the left image. The result should look like the person on the right IS Sidorovich, sitting in his bunker.',
    prompt: `Переиначь знаменитый монолог Сидоровича из S.T.A.L.K.E.R. на манер Владосика.

Оригинал:
«Короче, Меченый, я тебя спас и в благородство играть не буду: выполнишь для меня пару заданий — и мы в расчёте. Заодно посмотрим, как быстро у тебя башка после амнезии прояснится. А по твоей теме постараюсь разузнать. Хрен его знает, на кой ляд тебе этот Стрелок сдался, но я в чужие дела не лезу, хочешь убить — значит есть за что…»

Задача:
- Сохрани структуру и ритм оригинала максимально близко.
- Замени имена, локации и ситуации на реалии Владосика: завод/Полипласт, Магнит, жига, ипотека, смена, зарплата, кромвелька и т.д.
- Вместо «Меченый» обращайся к одному из знакомых Влада (выбери случайного).
- Вместо «Стрелок» подставь что-то из быта Влада (ипотека, зарплата, кредит и т.д.).
- Текст должен быть смешным, с матом, в стиле Владосика.
- Пиши монолог целиком, без заголовков, пояснений и подписей. Только текст пародии.`
  },
  {
    id: 'elcin',
    signature: 'Ельцин от Владосика228',
    templateImage: path.join(TEMPLATES_DIR, 'elcin.jpg'),
    faceSwapPrompt: 'This is a composite image. On the left is a photo of Boris Yeltsin during his 1999 New Year resignation speech on TV. On the right is a photo of a real person. Replace Yeltsin\'s face with the face of the person on the right. Keep the original scene — the formal TV address setting, suit, and somber atmosphere. The result should look like the person on the right is giving the presidential address.',
    prompt: `Переиначь новогоднее обращение Ельцина 1999 года на манер Владосика, как будто Владосик торжественно увольняется с завода (или из Магнита, или из семейного чата).

Оригинал (ключевые фразы):
«Дорогие друзья! Дорогие мои! Сегодня я в последний раз обращаюсь к вам с новогодним приветствием… Я хочу попросить у вас прощения. За то, что многие наши с вами мечты не сбылись. И то, что нам казалось просто, оказалось мучительно тяжело… Я устал. Я ухожу. Я сделал всё, что мог.»

Задача:
- Сохрани пафосную интонацию и структуру оригинала — торжественное прощание.
- Замени политический контекст на быт Владосика: завод/Полипласт, смены, зарплата, жига, ипотека, Магнит, кромвелька.
- Пусть Владосик просит прощения за бытовые провалы (не починил жигу, не закрыл ипотеку, проебал аванс).
- Финал: «Я устал. Я ухожу» — но в контексте завода/смены/чата.
- Текст должен быть смешным за счёт контраста пафоса и нищеты.
- С матом, в стиле Владосика.
- Пиши монолог целиком, без заголовков, пояснений и подписей. Только текст пародии.`
  },
  {
    id: 'dengi',
    signature: 'Михал Палыч от Владосика228',
    templateImage: path.join(TEMPLATES_DIR, 'dengi.jpg'),
    faceSwapPrompt: 'This is a composite image. On the left is a meme image of a man talking on the phone, associated with the famous Russian prank call "Ну как там с деньгами". On the right is a photo of a real person. Replace the man\'s face on the left with the face of the person on the right. Keep the phone, pose, and overall composition. The result should look like the person on the right is making the phone call.',
    prompt: `Переиначь легендарный телефонный пранк «Ну как там с деньгами?» (Михаил Палыч Терентьев) на манер Владосика.

Оригинал (ключевые фразы):
— Ну как там с деньгами?
— С какими деньгами?!
— Которые я вложил в капитал прожиточного минимума.
— Пидорас ёбаный!
— Чё с деньгами, я спрашиваю?
— А чтобы я приехал тебе моську набил нахуй.
— А с деньгами как вопрос обстоит?

Задача:
- Сохрани формат диалога (два собеседника через тире).
- Один из них — Владосик, который звонит в бухгалтерию Полипласта / HR / начальнику и допрашивает про свои деньги.
- Вместо «капитал прожиточного минимума» подставь что-то из реалий Влада: аванс, сверхурочные, премия, ипотечный вычет, возврат за кромвельку и т.д.
- Второй собеседник отвечает как в оригинале — непонимание, раздражение, угрозы.
- Владосик упорно возвращается к одному вопросу, как в оригинале.
- С матом, в стиле Владосика.
- Пиши диалог целиком, без заголовков, пояснений и подписей. Только текст пародии.`
  }
];

async function generateMemeParodia(memeIndex) {
  const meme = MEME_TEMPLATES[memeIndex];
  const fullPrompt = `${VLAD_CONTEXT}\n\n${meme.prompt}`;
  return getReply(fullPrompt, [], { username: '', interlocutorName: null });
}

export async function sendMorningMessage(telegram) {
  const chatId = process.env.MORNING_GROUP_CHAT_ID?.trim();
  if (!chatId) {
    console.log('Morning skipped: MORNING_GROUP_CHAT_ID not set');
    return;
  }

  const state = loadState();
  const today = todayStr();
  if (state.lastSentDate === today) {
    console.log('Morning skipped: already sent today', today);
    return;
  }

  const nextIndex = ((state.lastMemeIndex ?? -1) + 1) % MEME_TEMPLATES.length;
  const meme = MEME_TEMPLATES[nextIndex];

  let text;
  try {
    text = await generateMemeParodia(nextIndex);
  } catch (err) {
    console.error('Morning meme generate failed:', err.message);
    return;
  }
  if (!text || !text.trim()) {
    console.log('Morning skipped: empty text from generator');
    return;
  }

  let imageBuffer = null;
  try {
    imageBuffer = await swapFace(meme.templateImage, meme.faceSwapPrompt);
  } catch (err) {
    console.error('Morning face swap failed (will send text-only):', err.message);
  }

  const messageToSend = `${escapeHtml(text.trim())}\n\n<i>${escapeHtml(meme.signature)}</i>`;
  try {
    if (imageBuffer) {
      await telegram.sendPhoto(chatId, { source: imageBuffer }, {
        caption: messageToSend,
        parse_mode: 'HTML'
      });
    } else {
      await telegram.sendMessage(chatId, messageToSend, { parse_mode: 'HTML' });
    }
    saveState({ lastSentDate: today, lastMemeIndex: nextIndex });
    console.log(`Morning meme sent: ${meme.id} (index ${nextIndex}), image: ${!!imageBuffer}`, today);
  } catch (err) {
    if (imageBuffer && err.message?.includes('caption')) {
      console.log('Caption too long for photo, sending separately');
      try {
        await telegram.sendPhoto(chatId, { source: imageBuffer });
        await telegram.sendMessage(chatId, messageToSend, { parse_mode: 'HTML' });
        saveState({ lastSentDate: today, lastMemeIndex: nextIndex });
        console.log(`Morning meme sent (split): ${meme.id} (index ${nextIndex})`, today);
      } catch (err2) {
        console.error('Morning message send failed (split):', err2.message);
      }
    } else {
      console.error('Morning message send failed:', err.message);
    }
  }
}
