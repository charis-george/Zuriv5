const QRCode = require('qrcode');

const ZURI_ORANGE = '#ffbd59';

/**
 * Build a PNG data URL for a URL-encoded QR with a centered Zuri brand mark
 * (orange plate — no letter). Uses error correction H so the center can be covered.
 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label || 'operation'} timed out after ${ms}ms`)), ms);
    })
  ]);
}

async function qrToBrandedDataUrl(qrUrl, options = {}) {
  const width = options.width || 500;
  const margin = options.margin != null ? options.margin : 1;
  const timeoutMs = options.timeoutMs || 12000;

  const pngBuffer = await withTimeout(
    QRCode.toBuffer(qrUrl, {
      errorCorrectionLevel: 'H',
      type: 'png',
      width,
      margin,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    }),
    timeoutMs,
    'QR encode'
  );

  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    return QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width,
      margin,
      color: { dark: '#000000', light: '#FFFFFF' }
    });
  }

  try {
    const meta = await sharp(pngBuffer).metadata();
    const w = meta.width || width;
    const logoBox = Math.round(w * 0.24);
    const pad = Math.round(logoBox * 0.14);
    const plateSize = logoBox + pad * 2;

    let logoInner;
    const logoUrl = process.env.ZURI_QR_LOGO_URL;
    if (logoUrl && typeof logoUrl === 'string' && logoUrl.trim()) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(logoUrl.trim(), { signal: controller.signal });
        if (!res.ok) throw new Error(`logo fetch ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        logoInner = await sharp(buf)
          .resize(logoBox, logoBox, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .png()
          .toBuffer();
      } finally {
        clearTimeout(t);
      }
    } else {
      // Orange brand plate only — no letter Z
      const r = Math.round(logoBox * 0.2);
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${logoBox}" height="${logoBox}" viewBox="0 0 ${logoBox} ${logoBox}">
  <rect width="100%" height="100%" rx="${r}" fill="${ZURI_ORANGE}"/>
</svg>`;
      logoInner = await sharp(Buffer.from(svg)).png().toBuffer();
    }

    const whitePlate = await sharp({
      create: {
        width: plateSize,
        height: plateSize,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite([{ input: logoInner, left: pad, top: pad }])
      .png()
      .toBuffer();

    const left = Math.floor((w - plateSize) / 2);
    const top = Math.floor((w - plateSize) / 2);

    const out = await sharp(pngBuffer)
      .composite([{ input: whitePlate, left, top }])
      .png()
      .toBuffer();

    return `data:image/png;base64,${out.toString('base64')}`;
  } catch (err) {
    console.warn('[ZURI] Branded QR fallback (plain QR):', err && err.message ? err.message : err);
    return QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width,
      margin,
      color: { dark: '#000000', light: '#FFFFFF' }
    });
  }
}

module.exports = { qrToBrandedDataUrl };
