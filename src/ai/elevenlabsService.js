/**
 * ElevenLabs Text-to-Speech: convert text to audio (MP3) using a voice_id.
 * Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env to enable.
 */

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

/**
 * @param {string} text - Text to speak
 * @param {string} voiceId - ElevenLabs voice ID (from dashboard or API)
 * @returns {Promise<Buffer>} MP3 audio buffer
 */
export async function getSpeech(text, voiceId) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || !voiceId) {
    throw new Error('ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID must be set');
  }

  const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
  const speed = Math.min(1.2, Math.max(0.5, Number(process.env.ELEVENLABS_SPEED) || 1));
  const url = `${ELEVENLABS_BASE}/text-to-speech/${encodeURIComponent(voiceId)}`;

  const body = {
    text: text.slice(0, 5000),
    model_id: modelId
  };
  if (speed !== 1) {
    body.voice_settings = { speed };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${errText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export function isElevenLabsConfigured() {
  const key = process.env.ELEVENLABS_API_KEY;
  const voice = process.env.ELEVENLABS_VOICE_ID;
  return !!(key && voice && key.trim() && voice.trim());
}
