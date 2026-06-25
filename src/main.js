import { Game } from './game.js';

const canvas = document.getElementById('scene');
const game = new Game(canvas);
window.__game = game; // debug handle

// Headless gameplay driver (verification only): ?bot in the URL auto-starts and
// pilots the player so screenshots capture real combat. Never active in normal play.
if (location.search.includes('bot')) {
  game.start();
  const inp = game.input;
  let f = 0;
  const bot = () => {
    f++;
    inp.keys.add('KeyW');
    if (f % 160 < 80) inp.keys.add('KeyD'); else inp.keys.delete('KeyD');
    if (f % 220 === 0) inp.keys.add('ShiftLeft'); else inp.keys.delete('ShiftLeft');
    inp.mouseDX = Math.sin(f * 0.012) * 7;
    inp.lmb = true;
    inp.lmbPressedThisFrame = f % 26 === 0;
    requestAnimationFrame(bot);
  };
  requestAnimationFrame(bot);
}
