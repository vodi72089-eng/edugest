/**
 * Génère tous les assets du logo officiel EduGest à partir de l'image fournie
 * par le client (upload/pasted_image_1789426911183.png).
 *
 *  - Fond noir → transparent (rampe d'alpha douce, bords anti-aliasés)
 *  - public/edugest-logo.png       : logo complet (emblème + « EDUC GEST »)
 *  - public/edugest-logo-mark.png  : emblème seul (favicon, badges)
 *  - public/edugest-logo-pdf.jpg   : version JPG sur fond blanc (reçus PDF)
 *  - desktop/splash-logo.png       : splash de l'appli bureau
 *  - desktop/icon.png              : icône de l'exécutable Windows (1024²)
 */
const sharp = require('sharp');
const fs = require('fs');

const SRC = 'upload/pasted_image_1789426911183.png';
const LOW = 28;   // dist < LOW  → totalement transparent
const HIGH = 90;  // dist > HIGH → totalement opaque

async function loadEmblem() {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;

  // 1) Fond noir → transparent (rampe)
  for (let i = 0; i < W * H; i++) {
    const o = i * C;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const dist = Math.sqrt(r * r + g * g + b * b);
    const t = Math.min(1, Math.max(0, (dist - LOW) / (HIGH - LOW)));
    data[o + 3] = Math.round(t * 255);
  }

  // 1bis) Nettoyage des artefacts : les taches sombres sur l'or des lauriers
  // sont ramenées vers l'or plat dominant (rendu vectoriel net).
  const isGold = (r, g, b) => r > 70 && r > 1.45 * b && g > 0.3 * r && g < 1.1 * r;
  const lums = [];
  for (let i = 0; i < W * H; i++) {
    const o = i * C;
    if (data[o + 3] > 200 && isGold(data[o], data[o + 1], data[o + 2])) {
      lums.push(0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]);
    }
  }
  lums.sort((a, b) => a - b);
  const q = p => lums.length ? lums[Math.min(lums.length - 1, Math.floor(p * lums.length))] : 0;
  const lumRef = q(0.88) || 1;
  let gr = 0, gg = 0, gb = 0, gn = 0;
  for (let i = 0; i < W * H; i++) {
    const o = i * C;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    if (data[o + 3] > 200 && isGold(r, g, b)) {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum >= lumRef * 0.9) { gr += r; gg += g; gb += b; gn++; }
    }
  }
  if (gn) {
    gr = Math.round(gr / gn); gg = Math.round(gg / gn); gb = Math.round(gb / gn);
    console.log('or plat de référence:', { r: gr, g: gg, b: gb }, `(${gn} px)`);
    for (let i = 0; i < W * H; i++) {
      const o = i * C;
      const r = data[o], g = data[o + 1], b = data[o + 2];
      if (data[o + 3] > 60 && isGold(r, g, b)) {
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const ratio = lum / lumRef;
        if (ratio < 0.9) {
          const k = Math.min(0.97, ((0.9 - ratio) / 0.9) * 1.8);
          data[o] = Math.round(r + (gr - r) * k);
          data[o + 1] = Math.round(g + (gg - g) * k);
          data[o + 2] = Math.round(b + (gb - b) * k);
        }
      }
    }
  }

  // 2) Échantillonner le bleu du livre (pour le lettrage « EDUC GEST »)
  let br = 0, bg = 0, bb = 0, n = 0;
  for (let i = 0; i < W * H; i += 7) {
    const o = i * C;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    if (b > 110 && b - r > 55 && g > 35 && g < 115 && data[o + 3] > 200) {
      br += r; bg += g; bb += b; n++;
    }
  }
  const blue = n ? { r: Math.round(br / n), g: Math.round(bg / n), b: Math.round(bb / n) } : { r: 30, g: 58, b: 138 };
  console.log('bleu échantillonné:', blue, `(${n} px)`);

  // 3) Rognage sur la boîte englobante du contenu
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * C + 3] > 12) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const pad = 6;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  console.log('emblème rogné:', cw, 'x', ch);

  const emblem = await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: minX, top: minY, width: cw, height: ch })
    .png()
    .toBuffer();

  return { emblem, cw, ch, blue };
}

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

async function makeFull(emblem, cw, ch, blue) {
  // Logo complet : emblème en haut + « EDUC GEST » en dessous (bleu du livre)
  const W = 1000;
  const emblemW = 620;
  const emblemH = Math.round((ch / cw) * emblemW);
  const textH = 132, gap = 26, padT = 30, padB = 40;
  const H = padT + emblemH + gap + textH + padB;

  const hex = '#' + [blue.r, blue.g, blue.b].map(v => v.toString(16).padStart(2, '0')).join('');
  const textSvg = Buffer.from(`<svg width="${W}" height="${textH}" xmlns="http://www.w3.org/2000/svg">
    <text x="${W / 2}" y="${textH * 0.72}" text-anchor="middle"
      font-family="DejaVu Sans" font-weight="bold" font-size="104"
      letter-spacing="14" fill="${hex}">${esc('EDUC GEST')}</text>
  </svg>`);

  const emblemLayer = await sharp(emblem).resize({ width: emblemW }).toBuffer();
  const emblemMeta = await sharp(emblemLayer).metadata();

  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: emblemLayer, left: Math.round((W - emblemMeta.width) / 2), top: padT },
      { input: textSvg, left: 0, top: padT + emblemH + gap },
    ])
    .png()
    .toBuffer();
}

(async () => {
  const { emblem, cw, ch, blue } = await loadEmblem();

  // public/edugest-logo.png — logo complet
  const full = await makeFull(emblem, cw, ch, blue);
  fs.writeFileSync('public/edugest-logo.png', await sharp(full).png({ compressionLevel: 9 }).toBuffer());

  // public/edugest-logo-mark.png — emblème seul, carré
  fs.writeFileSync('public/edugest-logo-mark.png',
    await sharp({ create: { width: 640, height: 640, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp(emblem).resize({ width: 600, height: 600, fit: 'inside' }).toBuffer() }])
      .png({ compressionLevel: 9 }).toBuffer());

  // public/edugest-logo-pdf.jpg — reçu PDF : fond blanc
  fs.writeFileSync('public/edugest-logo-pdf.jpg',
    await sharp(full).flatten({ background: '#ffffff' }).resize({ width: 800 }).jpeg({ quality: 92 }).toBuffer());

  // desktop/splash-logo.png — splash bureau (log complet)
  fs.writeFileSync('desktop/splash-logo.png', await sharp(full).resize({ width: 760 }).png({ compressionLevel: 9 }).toBuffer());

  // desktop/icon.png — icône exécutable 1024² (emblème seul centré)
  fs.writeFileSync('desktop/icon.png',
    await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp(emblem).resize({ width: 840, height: 840, fit: 'inside' }).toBuffer(),
                    left: Math.round((1024 - 840) / 2) + Math.round((840 - Math.min(840, Math.round((ch / cw) * 840))) / 2), top: Math.round((1024 - Math.min(840, Math.round((ch / cw) * 840))) / 2) }])
      .png({ compressionLevel: 9 }).toBuffer());

  // Aperçu de contrôle
  fs.writeFileSync('/tmp/logo-full-preview.png', await sharp(full).flatten({ background: '#ffffff' }).png().toBuffer());
  fs.writeFileSync('/tmp/logo-mark-preview.png', await sharp(emblem).flatten({ background: '#0a0f0d' }).png().toBuffer());
  console.log('OK — assets générés');
})().catch(e => { console.error(e); process.exit(1); });
