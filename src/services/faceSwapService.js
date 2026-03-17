/**
 * Face swap via OpenAI images.edit (gpt-image-1, input_fidelity=high).
 * Combines a meme template image with Vlad's face photo into a side-by-side
 * composite, then prompts the model to replace the character's face.
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import OpenAI, { toFile } from 'openai';

const FACE_DIR = path.join(process.cwd(), 'data', 'faceswap');
const VLAD_FACE = path.join(FACE_DIR, 'vlad_face.jpg');

/**
 * Combine meme template (left) and Vlad's face (right) into one image.
 * The composite lets gpt-image-1 see both faces in a single high-fidelity pass.
 */
async function buildComposite(templatePath) {
  const leftBuf = await sharp(templatePath).resize({ width: 512 }).jpeg().toBuffer();
  const rightBuf = await sharp(VLAD_FACE).resize({ width: 512 }).jpeg().toBuffer();

  const leftMeta = await sharp(leftBuf).metadata();
  const rightMeta = await sharp(rightBuf).metadata();
  const h = Math.max(leftMeta.height, rightMeta.height);

  const leftFit = await sharp(leftBuf).resize({ width: 512, height: h, fit: 'contain', background: '#000' }).toBuffer();
  const rightFit = await sharp(rightBuf).resize({ width: 512, height: h, fit: 'contain', background: '#000' }).toBuffer();

  return sharp({
    create: { width: 1024, height: h, channels: 3, background: '#000' }
  })
    .composite([
      { input: leftFit, left: 0, top: 0 },
      { input: rightFit, left: 512, top: 0 }
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Generate a face-swapped meme image.
 * @param {string} templatePath - absolute path to the meme template image
 * @param {string} faceSwapPrompt - prompt describing the swap
 * @returns {Promise<Buffer|null>} JPEG buffer or null on failure
 */
export async function swapFace(templatePath, faceSwapPrompt) {
  if (!fs.existsSync(templatePath)) {
    console.error('FaceSwap: template not found:', templatePath);
    return null;
  }
  if (!fs.existsSync(VLAD_FACE)) {
    console.error('FaceSwap: vlad_face.jpg not found at', VLAD_FACE);
    return null;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('FaceSwap: OPENAI_API_KEY not set');
    return null;
  }

  try {
    const composite = await buildComposite(templatePath);
    const file = await toFile(composite, 'composite.jpg', { type: 'image/jpeg' });

    const openai = new OpenAI({ apiKey });
    const result = await openai.images.edit({
      model: 'gpt-image-1',
      image: file,
      prompt: faceSwapPrompt,
      quality: 'medium',
      size: '1024x1024'
    });

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      console.error('FaceSwap: empty b64 in response');
      return null;
    }
    return Buffer.from(b64, 'base64');
  } catch (err) {
    console.error('FaceSwap failed:', err.message);
    return null;
  }
}
