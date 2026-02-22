/**
 * List chat IDs where the bot has received updates (groups, private).
 * Run when the bot is STOPPED, then send a message to the bot from each chat, then run again.
 * Or run right after starting the bot once — may show recent chats from the queue.
 * Usage: node scripts/listBotChats.js
 */
import 'dotenv/config';

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN not set in .env');
  process.exit(1);
}

const url = `https://api.telegram.org/bot${token}/getUpdates?limit=100`;
const res = await fetch(url);
const data = await res.json();
if (!data.ok) {
  console.error('API error:', data.description);
  process.exit(1);
}

const chats = new Map();
function add(chat) {
  if (!chat || !chat.id) return;
  const key = String(chat.id);
  if (chats.has(key)) return;
  chats.set(key, {
    id: chat.id,
    type: chat.type || '?',
    title: chat.title || chat.username || chat.first_name || '(no name)'
  });
}

for (const u of data.result || []) {
  if (u.message?.chat) add(u.message.chat);
  if (u.channel_post?.chat) add(u.channel_post.chat);
  if (u.my_chat_member?.chat) add(u.my_chat_member.chat);
}

if (chats.size === 0) {
  console.log('No chats in recent updates. Stop the bot, send a message to the bot from a chat (or in a group where the bot is), then run this script again.');
  process.exit(0);
}

console.log('Chats where the bot has received updates:\n');
for (const [, c] of chats) {
  console.log(`  ${c.id}  (${c.type})  ${c.title}`);
}
console.log('\nUse the id (e.g. -1001234567890) as MORNING_GROUP_CHAT_ID for daily morning messages.');
