/**
 * Convert MP3 buffer to OGG Opus buffer for Telegram voice messages.
 * Uses ffmpeg-static (bundled binary) + fluent-ffmpeg.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';

const ffmpegPath = await import('ffmpeg-static').then((m) => m.default);
ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * @param {Buffer} mp3Buffer - MP3 audio buffer
 * @returns {Promise<Buffer>} OGG Opus audio buffer
 */
export function mp3ToOggOpus(mp3Buffer) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vladbot-'));
  const inputPath = path.join(tmpDir, 'input.mp3');
  const outputPath = path.join(tmpDir, 'output.ogg');

  try {
    fs.writeFileSync(inputPath, mp3Buffer);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('libopus')
        .audioBitrate(64)
        .toFormat('ogg')
        .on('error', (err) => {
          try {
            fs.rmSync(tmpDir, { recursive: true });
          } catch (_) {}
          reject(err);
        })
        .on('end', () => {
          try {
            const oggBuffer = fs.readFileSync(outputPath);
            fs.rmSync(tmpDir, { recursive: true });
            resolve(oggBuffer);
          } catch (err) {
            try {
              fs.rmSync(tmpDir, { recursive: true });
            } catch (_) {}
            reject(err);
          }
        })
        .save(outputPath);
    });
  } catch (err) {
    try {
      fs.rmSync(tmpDir, { recursive: true });
    } catch (_) {}
    throw err;
  }
}
