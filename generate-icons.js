import fs from 'fs';
import { Resvg } from '@resvg/resvg-js';

const pwaIconSvg = fs.readFileSync('./public/pwa-icon.svg', 'utf8');
const pwaMaskableSvg = fs.readFileSync('./public/pwa-maskable.svg', 'utf8');

function render(svg, width, height) {
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: width,
    },
  });
  return resvg.render().asPng();
}

console.log('Generating PWA icons...');

fs.writeFileSync('./public/pwa-512x512.png', render(pwaIconSvg, 512, 512));
fs.writeFileSync('./public/pwa-192x192.png', render(pwaIconSvg, 192, 192));
fs.writeFileSync('./public/apple-touch-icon.png', render(pwaIconSvg, 180, 180));
fs.writeFileSync('./public/pwa-maskable-512x512.png', render(pwaMaskableSvg, 512, 512));
fs.writeFileSync('./public/AKGLOG.png', render(pwaIconSvg, 192, 192));
fs.copyFileSync('./public/pwa-icon.svg', './public/icon.svg');

console.log('PWA icons generated successfully!');
