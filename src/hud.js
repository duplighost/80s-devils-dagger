import { formatTime } from './util.js';

// Thin wrapper over the DOM overlay: stat readouts, combo, flashes, toasts and
// the title/death/pause screens.
export class HUD {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'), boot: $('boot'),
      title: $('title'), death: $('death'), pause: $('pause'),
      timer: $('timer'), combo: $('combo'), mult: $('mult'),
      kills: $('kills'), accuracy: $('accuracy'), score: $('score'),
      odFill: $('od-fill'), odLabel: $('od-label'),
      gems: $('gems'), gemFill: $('gem-fill'), pips: $('level-pips'),
      crosshair: $('crosshair'), toast: $('toast'),
      boss: $('boss'), bossFill: $('boss-fill'), bossLabel: $('boss-label'),
      dmg: $('damage-flash'), lowhp: $('lowhp'),
      bestTime: $('best-time'),
      dTime: $('death-time'), dKills: $('death-kills'), dGems: $('death-gems'),
      dAcc: $('death-acc'), dLevel: $('death-level'), dVerdict: $('death-verdict'), dBest: $('death-best'),
      dScore: $('death-score'),
    };
    this.pipEls = Array.from(this.el.pips.querySelectorAll('.pip'));
    this._comboTimer = 0;
    this._dmgTimer = 0;
  }

  hideBoot() { this.el.boot?.classList.add('hidden'); }

  showTitle() { this.el.title.classList.remove('hidden'); }
  hideTitle() { this.el.title.classList.add('hidden'); }
  showHud() { this.el.hud.classList.remove('hidden'); }
  hideHud() { this.el.hud.classList.add('hidden'); }
  showPause() { this.el.pause.classList.remove('hidden'); }
  hidePause() { this.el.pause.classList.add('hidden'); }

  setBest(seconds) { this.el.bestTime.textContent = formatTime(seconds); }

  setTimer(seconds) {
    const f = formatTime(seconds);
    const [a, b] = f.split('.');
    this.el.timer.innerHTML = `${a}<span class="ms">.${b}</span>`;
  }
  setKills(n) { this.el.kills.textContent = n; }
  setAccuracy(pct) { this.el.accuracy.textContent = `${Math.round(pct)}%`; }
  setScore(n) { this.el.score.textContent = n.toLocaleString('en-US'); }

  setMult(m) {
    const el = this.el.mult;
    if (m > 1) {
      el.textContent = `×${m}`;
      el.classList.add('show', 'bump');
      el.classList.toggle('hot', m >= 6);
      setTimeout(() => el.classList.remove('bump'), 80);
    } else {
      el.classList.remove('show');
    }
  }

  setOverdrive(frac, ready) {
    this.el.odFill.style.width = `${Math.min(1, frac) * 100}%`;
    this.el.odFill.classList.toggle('ready', ready);
    this.el.odLabel.classList.toggle('ready', ready);
    this.el.odLabel.textContent = ready ? '▲ NEON BOMB [Q]' : 'OVERDRIVE';
  }

  bombFlash() {
    this.el.dmg.classList.add('bomb');
    setTimeout(() => this.el.dmg.classList.remove('bomb'), 140);
  }
  setGems(count, fillPct) {
    this.el.gems.textContent = count;
    this.el.gemFill.style.width = `${Math.min(100, fillPct)}%`;
  }
  setLevel(level) {
    this.pipEls.forEach((p, i) => {
      p.classList.toggle('on', i < level);
      p.classList.toggle('max', level >= this.pipEls.length && i < level);
    });
  }

  combo(n) {
    const c = this.el.combo;
    if (n >= 3) {
      c.textContent = `${n}× COMBO`;
      c.classList.add('show', 'bump');
      setTimeout(() => c.classList.remove('bump'), 90);
    } else {
      c.classList.remove('show');
    }
  }

  crosshairFire() {
    const c = this.el.crosshair;
    c.classList.remove('fire'); void c.offsetWidth; c.classList.add('fire');
  }

  damage() {
    this.el.dmg.classList.add('hit');
    setTimeout(() => this.el.dmg.classList.remove('hit'), 90);
  }
  lowHp(on) { this.el.lowhp.classList.toggle('on', on); }

  toast(text) {
    const t = this.el.toast;
    t.textContent = text;
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  }

  showBoss(name) { if (name) this.el.bossLabel.textContent = name; this.el.boss.classList.remove('hidden'); this.setBoss(1); }
  hideBoss() { this.el.boss.classList.add('hidden'); }
  setBoss(frac) { this.el.bossFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`; }

  showDeath(stats) {
    this.el.dTime.textContent = formatTime(stats.time);
    this.el.dScore.textContent = (stats.score || 0).toLocaleString('en-US');
    this.el.dKills.textContent = stats.kills;
    this.el.dGems.textContent = stats.gems;
    this.el.dAcc.textContent = `${Math.round(stats.accuracy)}%`;
    this.el.dLevel.textContent = stats.level;
    this.el.dVerdict.textContent = stats.verdict;
    if (stats.newBest) {
      this.el.dBest.textContent = '★ NEW BEST ★';
      this.el.dBest.classList.add('new');
    } else {
      this.el.dBest.textContent = `BEST  ${formatTime(stats.best)}`;
      this.el.dBest.classList.remove('new');
    }
    this.el.death.classList.remove('hidden');
  }
  hideDeath() { this.el.death.classList.add('hidden'); }
}
