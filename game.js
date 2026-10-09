/* Naija Vanguard — game code.
   Fictional setting: the Jackals are an invented masked outlaw gang. */
(function () {
'use strict';

var DEFAULT_CONFIG = {
  playerSpeed: 2.7, playerHP: 100, fireCooldown: 8, bulletSpeed: 8,
  bulletDamage: 10, bulletDamagePerWave: 2,
  enemyBaseHP: 18, enemyHPPerWave: 5,
  enemyBaseSpeed: 1.05, enemySpeedPerWave: 0.09, enemyMaxSpeedBonus: 0.9,
  enemiesBaseCount: 3, enemiesPerWave: 2,
  medkitChance: 0.16, medkitHeal: 25,
  contactDamage: 10, contactCooldownFrames: 35,
  scorePerKill: 10, waveBonus: 50,
  respawnFrames: 180, lives: 3, levelWaves: 5,
  weapons: [
    { name: 'Rifle',    cooldown: 8,  damage: 10, dmgPerWave: 2, bulletSpeed: 8,  pellets: 1, spread: 0.06, infinite: true,  color: '#e0a100' },
    { name: 'SMG',      cooldown: 4,  damage: 6,  dmgPerWave: 1, bulletSpeed: 8,  pellets: 1, spread: 0.15, startAmmo: 120, maxAmmo: 360, color: '#3b82f6' },
    { name: 'Shotgun',  cooldown: 26, damage: 8,  dmgPerWave: 1, bulletSpeed: 7,  pellets: 6, spread: 0.5,  startAmmo: 30,  maxAmmo: 90,  color: '#d64545' },
    { name: 'Marksman', cooldown: 34, damage: 45, dmgPerWave: 5, bulletSpeed: 14, pellets: 1, spread: 0.01, startAmmo: 20,  maxAmmo: 60,  color: '#8b5cf6' }
  ],
  difficulties: [
    { name: 'Easy',   enemyHpMult: 0.7,  enemySpeedMult: 0.85, enemyCountMult: 0.75, lives: 5 },
    { name: 'Normal', enemyHpMult: 1,    enemySpeedMult: 1,    enemyCountMult: 1,    lives: 3 },
    { name: 'Hard',   enemyHpMult: 1.45, enemySpeedMult: 1.15, enemyCountMult: 1.3,  lives: 2 }
  ],
  maps: [
    { name: 'Town square', tint: '#141a21', walls: [
      { x: 120, y: 80,  w: 150, h: 80 },
      { x: 380, y: 100, w: 110, h: 70 },
      { x: 660, y: 70,  w: 140, h: 90 },
      { x: 170, y: 340, w: 130, h: 100 },
      { x: 540, y: 360, w: 160, h: 90 },
      { x: 800, y: 300, w: 80,  h: 120 } ] },
    { name: 'Market district', tint: '#1b1611', walls: [
      { x: 80,  y: 90,  w: 100, h: 140 },
      { x: 250, y: 60,  w: 90,  h: 90 },
      { x: 250, y: 330, w: 200, h: 70 },
      { x: 500, y: 150, w: 90,  h: 200 },
      { x: 660, y: 80,  w: 150, h: 80 },
      { x: 700, y: 360, w: 120, h: 90 } ] },
    { name: 'Riverside', tint: '#0f1a1e', walls: [
      { x: 60,  y: 200, w: 200, h: 60 },
      { x: 350, y: 80,  w: 80,  h: 160 },
      { x: 350, y: 360, w: 80,  h: 130 },
      { x: 530, y: 200, w: 220, h: 60 },
      { x: 820, y: 90,  w: 70,  h: 140 },
      { x: 820, y: 330, w: 70,  h: 140 } ] }
  ],
  playerColors: ['#2f9e63', '#3b82f6', '#8b5cf6', '#e0a100'],
  enemyTypes: [
    { name: 'raider', color: '#d64545', hpMult: 1,   speedMult: 1,   size: 11 },
    { name: 'brute',  color: '#b91c1c', hpMult: 2.2, speedMult: 0.7, size: 15 }
  ],
  customWaves: []
};

function loadConfig() {
  try {
    var s = localStorage.getItem('naijaConfig');
    if (s) {
      var o = JSON.parse(s);
      return Object.assign(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), o);
    }
  } catch (e) { /* fall through to defaults */ }
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}
var cfg = loadConfig();

var W = 960, H = 540;
var B = [], curMap = null, mapIdx = 0;
function applyMap(i) {
  mapIdx = i;
  curMap = cfg.maps[i % cfg.maps.length];
  B = curMap.walls;
}

var $ = function (id) { return document.getElementById(id); };
var cv = $('cv'), ctx = cv.getContext('2d');
cv.width = W; cv.height = H;
if (!ctx.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); return this; };
}

var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
var d2 = function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
var GEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

var mode = 'menu';           // menu | solo | coop | host | client | over
var peer = null, conns = [], myConn = null;
var myId = 'P1', myName = 'Defender';
var players = {}, enemies = [], bullets = [], pk = [], parts = [], tracers = [];
var eid = 1, wave = 1, waveBreak = 0, frame = 0, bannerT = 0, over = false;
var scoreboard = {};
var keys = {}, mouse = { x: W / 2, y: H / 2, down: false };
var touch = { active: false, id: -1, sx: 0, sy: 0, cx: 0, cy: 0 };
var guestCount = 0, diff = null, crateTimer = 0;

/* ---------- helpers ---------- */
function banner(t) { var b = $('bn'); b.textContent = t; b.style.display = 'block'; bannerT = 100; }
function burst(x, y, c) {
  for (var i = 0; i < 6; i++) {
    var a = Math.random() * 6.283, s = 1 + Math.random() * 2;
    parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 20, c: c });
  }
}
function mkPlayer(id, name, color, x, y, ctl, lives) {
  return { id: id, name: name, color: color, x: x, y: y, tx: x, ty: y,
    r: 12, hp: cfg.playerHP, max: cfg.playerHP, lives: (lives == null ? cfg.lives : lives),
    aim: 0, fire: false, cd: 0, hurt: 0, respawn: 0, dead: false, ctl: ctl || 'mouse', flash: 0,
    weapons: [0], wcur: 0, wcurReq: 0, ammo: {} };
}
function colorFor(id) { var n = parseInt(id.slice(1), 10) || 0; return cfg.playerColors[n % cfg.playerColors.length]; }
function collide(p) {
  p.x = clamp(p.x, p.r, W - p.r); p.y = clamp(p.y, p.r, H - p.r);
  for (var i = 0; i < B.length; i++) {
    var b = B[i], nx = Math.max(b.x, Math.min(p.x, b.x + b.w)), ny = Math.max(b.y, Math.min(p.y, b.y + b.h));
    var dx = p.x - nx, dy = p.y - ny, dd = dx * dx + dy * dy;
    if (dd < p.r * p.r) { var d = Math.sqrt(dd) || 0.01; p.x += dx / d * (p.r - d); p.y += dy / d * (p.r - d); }
  }
}
function resetGame() {
  players = {}; enemies = []; bullets = []; pk = []; parts = []; tracers = [];
  eid = 1; wave = 1; waveBreak = 0; frame = 0; scoreboard = {}; over = false; guestCount = 0; crateTimer = 0;
  cfg = loadConfig();
  applyMap(0);
}
function currentDiff() {
  var i = parseInt(($('diffSel') || { value: '1' }).value, 10) || 0;
  return (cfg.difficulties && cfg.difficulties[i]) ||
         { name: 'Normal', enemyHpMult: 1, enemySpeedMult: 1, enemyCountMult: 1, lives: cfg.lives };
}
function publicPlayers() {
  return Object.values(players).map(function (p) {
    return { id: p.id, name: p.name, color: p.color, x: Math.round(p.x), y: Math.round(p.y) };
  });
}

/* ---------- weapons ---------- */
function weaponOf(p) { return cfg.weapons[p.wcur] || cfg.weapons[0]; }
function ammoOf(p, i) { return p.ammo[i] | 0; }
function giveWeapon(p, idx) {
  idx = idx | 0;
  if (p.weapons.indexOf(idx) < 0) {
    p.weapons.push(idx);
    var w = cfg.weapons[idx];
    if (!w.infinite) p.ammo[idx] = w.startAmmo;
  }
  p.wcur = idx;
  if (mode === 'host') broadcast({ t: 'msg', txt: p.name + ' picked up the ' + cfg.weapons[idx].name });
  else if (p.id === myId) banner(cfg.weapons[idx].name + ' acquired — key ' + (idx + 1));
}
function requestWeapon(i) {
  var me = players[myId];
  if (!me || over) return;
  if (mode === 'client') { if (me.weapons.indexOf(i) >= 0) { me.wcur = i; me.wcurReq = i; } }
  else if (me.weapons.indexOf(i) >= 0) me.wcur = i;
}
function cycleWeapon() {
  var me = players[myId];
  if (!me || !me.weapons.length) return;
  var i = me.weapons.indexOf(me.wcur);
  requestWeapon(me.weapons[(i + 1) % me.weapons.length]);
}
function spawnCrate() {
  for (var t = 0; t < 12; t++) {
    var x = 60 + Math.random() * (W - 120), y = 60 + Math.random() * (H - 120), ok = true;
    for (var i = 0; i < B.length; i++) {
      var b = B[i];
      if (x > b.x - 20 && x < b.x + b.w + 20 && y > b.y - 20 && y < b.y + b.h + 20) { ok = false; break; }
    }
    if (ok) { pk.push({ x: x, y: y, ph: 0, kind: 'wpn' }); return; }
  }
}

/* ---------- waves & levels ---------- */
function spawnWaveHost(w) {
  var count, typeIdx = Math.floor((w - 1) / 2) % cfg.enemyTypes.length, hpMult = 1, spMult = 1;
  var cw = cfg.customWaves[w - 1];
  if (cw) {
    count = cw.count; typeIdx = cw.type || 0;
    hpMult = cw.hpMult || 1; spMult = cw.speedMult || 1;
  } else {
    count = cfg.enemiesBaseCount + cfg.enemiesPerWave * w;
  }
  var dm = diff || { enemyHpMult: 1, enemySpeedMult: 1, enemyCountMult: 1 };
  count = Math.ceil(count * dm.enemyCountMult);
  var t = cfg.enemyTypes[typeIdx] || cfg.enemyTypes[0];
  for (var i = 0; i < count; i++) {
    var s = (Math.random() * 4) | 0, x, y;
    if (s === 0) { x = -20; y = Math.random() * H; }
    else if (s === 1) { x = W + 20; y = Math.random() * H; }
    else if (s === 2) { y = -20; x = Math.random() * W; }
    else { y = H + 20; x = Math.random() * W; }
    var hp = Math.round((cfg.enemyBaseHP + w * cfg.enemyHPPerWave) * hpMult * dm.enemyHpMult);
    enemies.push({ id: eid++, x: x, y: y, tx: x, ty: y, r: t.size, hp: hp, max: hp,
      sp: (cfg.enemyBaseSpeed + Math.min(cfg.enemyMaxSpeedBonus, w * cfg.enemySpeedPerWave)) * t.speedMult * spMult * dm.enemySpeedMult * (0.9 + Math.random() * 0.3),
      type: typeIdx, flash: 0 });
  }
  banner('Wave ' + w + ' — hold the line');
}

/* ---------- local input ---------- */
function keyMove(p) {
  var mx = 0, my = 0;
  if (p.ctl === 'mouse') {
    if (keys.a || keys.arrowleft) mx -= 1;
    if (keys.d || keys.arrowright) mx += 1;
    if (keys.w || keys.arrowup) my -= 1;
    if (keys.s || keys.arrowdown) my += 1;
  }
  if (p.ctl === 'wasd') {
    if (keys.a) mx -= 1;
    if (keys.d) mx += 1;
    if (keys.w) my -= 1;
    if (keys.s) my += 1;
  }
  if (p.ctl === 'arrows') {
    if (keys.arrowleft) mx -= 1;
    if (keys.arrowright) mx += 1;
    if (keys.arrowup) my -= 1;
    if (keys.arrowdown) my += 1;
  }
  if (touch.active && p.ctl === 'mouse') {
    mx = (touch.cx - touch.sx) / 30; my = (touch.cy - touch.sy) / 30;
    var l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
  }
  var ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
  return { x: mx, y: my };
}
function autoAim(p) {
  var best = null, bd = 1e9;
  for (var i = 0; i < enemies.length; i++) {
    var dd = d2(p.x, p.y, enemies[i].x, enemies[i].y);
    if (dd < bd) { bd = dd; best = enemies[i]; }
  }
  if (best) p.aim = Math.atan2(best.y - p.y, best.x - p.x);
}
function localInput(p) {
  var mv = keyMove(p);
  p.x += mv.x * cfg.playerSpeed; p.y += mv.y * cfg.playerSpeed;
  collide(p);
  if (p.ctl === 'mouse') {
    if (touch.active) { autoAim(p); p.fire = true; }
    else { p.aim = Math.atan2(mouse.y - p.y, mouse.x - p.x); p.fire = mouse.down; }
  } else { autoAim(p); p.fire = enemies.length > 0; }
}

/* ---------- host simulation (solo / co-op / online host) ---------- */
function hostUpdate() {
  frame++;
  var ps = Object.values(players);

  ps.forEach(function (p) {
    if (p.dead) return;
    if (p.respawn > 0) {
      p.respawn--;
      if (p.respawn === 0) { p.hp = p.max; p.x = W / 2; p.y = H / 2; burst(p.x, p.y, p.color); }
      return;
    }
    if (p.local) localInput(p);
    if (p.cd > 0) p.cd--;
    if (p.hurt > 0) p.hurt--;
    var w = weaponOf(p);
    if (p.fire && p.cd <= 0) {
      var hasAmmo = w.infinite || ammoOf(p, p.wcur) > 0;
      if (!hasAmmo && p.weapons.indexOf(0) >= 0 && p.wcur !== 0) { p.wcur = 0; w = weaponOf(p); hasAmmo = true; }
      if (hasAmmo) {
        p.cd = w.cooldown;
        if (!w.infinite) p.ammo[p.wcur] = ammoOf(p, p.wcur) - 1;
        var dmg = w.damage + wave * w.dmgPerWave;
        for (var pl = 0; pl < w.pellets; pl++) {
          var a = p.aim + (Math.random() - 0.5) * 2 * w.spread;
          bullets.push({ x: p.x + Math.cos(p.aim) * 20, y: p.y + Math.sin(p.aim) * 20,
            vx: Math.cos(a) * w.bulletSpeed, vy: Math.sin(a) * w.bulletSpeed,
            life: 60, dmg: dmg, owner: p.id });
        }
      }
    }
  });

  // bullets
  for (var k = bullets.length - 1; k >= 0; k--) {
    var bl = bullets[k];
    bl.x += bl.vx; bl.y += bl.vy; bl.life--;
    var dead = bl.life <= 0 || bl.x < -10 || bl.x > W + 10 || bl.y < -10 || bl.y > H + 10;
    if (!dead) for (var m = 0; m < B.length; m++) {
      var bb = B[m];
      if (bl.x > bb.x && bl.x < bb.x + bb.w && bl.y > bb.y && bl.y < bb.y + bb.h) { dead = true; break; }
    }
    if (!dead) for (var n = enemies.length - 1; n >= 0; n--) {
      var en = enemies[n];
      if (d2(en.x, en.y, bl.x, bl.y) < (en.r + 3) * (en.r + 3)) {
        en.hp -= bl.dmg; en.flash = 6; dead = true;
        if (en.hp <= 0) {
          var t = cfg.enemyTypes[en.type] || cfg.enemyTypes[0];
          enemies.splice(n, 1);
          scoreboard[bl.owner] = (scoreboard[bl.owner] || 0) + cfg.scorePerKill;
          burst(en.x, en.y, t.color);
          var killer = players[bl.owner];
          if (Math.random() < cfg.medkitChance) {
            pk.push({ x: en.x, y: en.y, ph: 0, kind: 'med' });
          } else if (killer && Math.random() < 0.25) {
            var owned = killer.weapons.filter(function (i) { return !cfg.weapons[i].infinite; });
            if (owned.length) {
              var wi = owned[(Math.random() * owned.length) | 0], wdef = cfg.weapons[wi];
              pk.push({ x: en.x, y: en.y, ph: 0, kind: 'ammo', widx: wi, amt: Math.ceil(wdef.maxAmmo * 0.25) });
            }
          }
        }
        break;
      }
    }
    if (dead) bullets.splice(k, 1);
  }

  // enemies
  enemies.forEach(function (e) {
    var tgt = null, td = 1e9;
    ps.forEach(function (p) {
      if (p.dead || p.respawn > 0) return;
      var dd = d2(e.x, e.y, p.x, p.y);
      if (dd < td) { td = dd; tgt = p; }
    });
    if (tgt) {
      var a = Math.atan2(tgt.y - e.y, tgt.x - e.x);
      e.x += Math.cos(a) * e.sp; e.y += Math.sin(a) * e.sp;
    }
    if (e.flash > 0) e.flash--;
  });
  for (var u = 0; u < enemies.length; u++) for (var v = u + 1; v < enemies.length; v++) {
    var e1 = enemies[u], e2 = enemies[v], sx = e2.x - e1.x, sy = e2.y - e1.y, sd = Math.hypot(sx, sy);
    if (sd > 0 && sd < e1.r + e2.r + 2) {
      var ov = (e1.r + e2.r + 2 - sd) / 2;
      e1.x -= sx / sd * ov; e1.y -= sy / sd * ov; e2.x += sx / sd * ov; e2.y += sy / sd * ov;
    }
  }

  // contact damage
  ps.forEach(function (p) {
    if (p.dead || p.respawn > 0) return;
    enemies.forEach(function (e) {
      var cd = Math.hypot(e.x - p.x, e.y - p.y);
      if (cd < e.r + p.r) {
        if (p.hurt <= 0) { p.hp -= cfg.contactDamage; p.hurt = cfg.contactCooldownFrames; burst(p.x, p.y, '#f66'); }
        e.x -= (e.x - p.x) / (cd || 1) * 3; e.y -= (e.y - p.y) / (cd || 1) * 3;
      }
    });
  });

  // pickups
  for (var q = pk.length - 1; q >= 0; q--) {
    var pkt = pk[q]; pkt.ph += 0.08;
    for (var r = 0; r < ps.length; r++) {
      var pl2 = ps[r];
      if (pl2.dead || pl2.respawn > 0 || d2(pl2.x, pl2.y, pkt.x, pkt.y) >= 20 * 20) continue;
      if (pkt.kind === 'med') {
        pl2.hp = Math.min(pl2.max, pl2.hp + cfg.medkitHeal); burst(pkt.x, pkt.y, '#2f9e63'); pk.splice(q, 1); break;
      } else if (pkt.kind === 'ammo') {
        var wd = cfg.weapons[pkt.widx];
        pl2.ammo[pkt.widx] = Math.min(wd.maxAmmo, ammoOf(pl2, pkt.widx) + pkt.amt);
        burst(pkt.x, pkt.y, wd.color); pk.splice(q, 1); break;
      } else if (pkt.kind === 'wpn') {
        var next = -1;
        for (var wi2 = 0; wi2 < cfg.weapons.length; wi2++) if (pl2.weapons.indexOf(wi2) < 0) { next = wi2; break; }
        if (next >= 0) giveWeapon(pl2, next);
        else {
          pl2.weapons.forEach(function (i) {
            var w2 = cfg.weapons[i];
            if (!w2.infinite) pl2.ammo[i] = Math.min(w2.maxAmmo, ammoOf(pl2, i) + Math.ceil(w2.maxAmmo * 0.3));
          });
          if (pl2.id === myId) banner('All weapons owned — ammo restocked');
        }
        burst(pkt.x, pkt.y, '#8b5cf6'); pk.splice(q, 1); break;
      }
    }
  }

  // deaths & respawns
  ps.forEach(function (p) {
    if (p.dead || p.respawn > 0 || p.hp > 0) return;
    if (mode === 'host') {           // online: infinite respawns
      p.respawn = cfg.respawnFrames;
      broadcast({ t: 'msg', txt: p.name + ' is down — respawning' });
      if (p.id === myId) { broadcast({ t: 'end' }); endRoom('You went down. Room closed.'); }
    } else {
      p.lives--;
      if (p.lives > 0) { p.respawn = cfg.respawnFrames; burst(p.x, p.y, p.color); }
      else {
        p.dead = true; burst(p.x, p.y, p.color);
        if (ps.every(function (x) { return x.dead; })) {
          gameOver('The town fell on wave ' + wave + '. Score ' + (scoreboard[p.id] || 0) + '.');
        }
      }
    }
  });

  // wave / level logic
  if (enemies.length === 0 && waveBreak === 0) {
    waveBreak = 120;
    ps.forEach(function (p) { if (!p.dead) scoreboard[p.id] = (scoreboard[p.id] || 0) + cfg.waveBonus; });
    banner('Wave ' + wave + ' cleared!');
  }
  if (waveBreak > 0 && --waveBreak === 0) {
    wave++;
    if ((wave - 1) % cfg.levelWaves === 0) {
      applyMap(Math.floor((wave - 1) / cfg.levelWaves));
      spawnCrate();
      banner('Level ' + (mapIdx + 1) + ' — ' + curMap.name);
    }
    spawnWaveHost(wave);
  }

  for (var t = parts.length - 1; t >= 0; t--) {
    var pt = parts[t]; pt.x += pt.vx; pt.y += pt.vy; pt.vx *= 0.92; pt.vy *= 0.92;
    if (--pt.life <= 0) parts.splice(t, 1);
  }

  if (mode === 'host' && frame % 5 === 0) sendSnap();
  updateHUD();
}

/* ---------- online host plumbing ---------- */
function genCode() { var c = ''; for (var i = 0; i < 4; i++) c += GEN[(Math.random() * GEN.length) | 0]; return c; }
function broadcast(m) { conns.forEach(function (c) { if (c.open) c.send(m); }); }
function sendTo(c, m) { if (c.open) c.send(m); }
function sendSnap() {
  broadcast({
    t: 'snap', wave: wave, map: mapIdx,
    pl: Object.values(players).map(function (p) {
      return [p.id, Math.round(p.x), Math.round(p.y), Math.round(p.hp), +p.aim.toFixed(2), p.fire ? 1 : 0, p.respawn > 0 ? 1 : 0, p.name, p.wcur, p.weapons,
        cfg.weapons.map(function (w, i) { return w.infinite ? -1 : ammoOf(p, i); })];
    }),
    en: enemies.map(function (e) { return [e.id, Math.round(e.x), Math.round(e.y), Math.round(e.hp), e.type]; }),
    pk: pk.map(function (p) { return [Math.round(p.x), Math.round(p.y), p.kind, p.widx || 0, p.amt || 0]; }),
    sc: scoreboard
  });
}
function hostOnline() {
  if (typeof Peer === 'undefined') { alert('Multiplayer library failed to load. Check internet, or try local co-op.'); return; }
  myName = ($('pname').value || 'Host').slice(0, 12);
  resetGame();
  diff = currentDiff();
  var code = genCode();
  peer = new Peer('naija-vg-' + code);
  peer.on('open', function () {
    $('roomCode').textContent = code;
    $('hostWait').style.display = 'flex';
  });
  peer.on('error', function (e) {
    if (e.type === 'unavailable-id') { peer.destroy(); hostOnline(); }
    else alert('Network error: ' + e.type);
  });
  peer.on('connection', function (conn) {
    conn.on('open', function () {
      guestCount++;
      conns.push(conn);
      var id = 'G' + guestCount;
      conn.pid = id;
      players[id] = mkPlayer(id, 'Guest' + guestCount, colorFor(id), W / 2 + (Math.random() * 80 - 40), H / 2, 'remote', 3);
      players[id].local = false;
      scoreboard[id] = 0;
      giveWeapon(players[id], 0);
      sendTo(conn, { t: 'init', you: id, players: publicPlayers(), wave: wave });
      conn.on('data', function (d) {
        if (d.t === 'hello') { players[id].name = String(d.name || 'Guest').slice(0, 12); broadcast({ t: 'msg', txt: players[id].name + ' joined the fight' }); }
        if (d.t === 'st') {
          var p = players[id];
          if (!p || p.dead) return;
          p.x = clamp(d.x, p.r, W - p.r); p.y = clamp(d.y, p.r, H - p.r); p.aim = d.aim; p.fire = !!d.fire;
          if (p.weapons.indexOf(d.wcur | 0) >= 0) p.wcur = d.wcur | 0;
        }
      });
      conn.on('close', function () {
        conns = conns.filter(function (c) { return c !== conn; });
        if (players[id]) { broadcast({ t: 'msg', txt: players[id].name + ' left' }); delete players[id]; delete scoreboard[id]; }
      });
    });
  });
  mode = 'host'; myId = 'H1';
  players.H1 = mkPlayer('H1', myName, cfg.playerColors[0], W / 2, H / 2, 'mouse', diff.lives);
  players.H1.local = true; scoreboard.H1 = 0;
  $('ov').style.display = 'none';
  spawnWaveHost(1);
}

/* ---------- online client ---------- */
function joinOnline(code) {
  if (typeof Peer === 'undefined') { alert('Multiplayer library failed to load. Check internet.'); return; }
  myName = ($('pname').value || 'Guest').slice(0, 12);
  peer = new Peer();
  peer.on('open', function () {
    myConn = peer.connect('naija-vg-' + code, { reliable: true });
    myConn.on('open', function () {
      myConn.send({ t: 'hello', name: myName });
      mode = 'client';
      $('ov').style.display = 'none';
      banner('Connected — good luck out there');
    });
    myConn.on('data', onHostData);
    myConn.on('close', function () {
      if (mode === 'client') { alert('Disconnected from host.'); location.reload(); }
    });
  });
  peer.on('error', function (e) { alert('Could not reach room "' + code + '" (' + e.type + ').'); location.reload(); });
}
function onHostData(d) {
  if (d.t === 'init') {
    myId = d.you;
    players = {};
    d.players.forEach(function (pp) {
      var isMe = pp.id === myId;
      players[pp.id] = mkPlayer(pp.id, pp.name, pp.color, pp.x, pp.y, isMe ? 'mouse' : 'remote', 3);
      players[pp.id].local = isMe;
      players[pp.id].weapons = [0];
      scoreboard[pp.id] = 0;
    });
    wave = d.wave;
    $('wavenum').textContent = wave;
  } else if (d.t === 'snap') {
    applySnap(d);
  } else if (d.t === 'msg') {
    banner(d.txt);
  } else if (d.t === 'end') {
    endRoom('The host went down — room closed. Refresh to play again.');
  }
}
function applySnap(d) {
  wave = d.wave; scoreboard = d.sc || scoreboard;
  if (d.map != null && d.map !== mapIdx) applyMap(d.map);
  var seen = {};
  d.en.forEach(function (a) {
    seen[a[0]] = 1;
    var e = null;
    for (var i = 0; i < enemies.length; i++) if (enemies[i].id === a[0]) { e = enemies[i]; break; }
    if (!e) { e = { id: a[0], x: a[1], y: a[2], tx: a[1], ty: a[2], hp: a[3], max: a[3], type: a[4], r: (cfg.enemyTypes[a[4]] || cfg.enemyTypes[0]).size, sp: 0, flash: 0 }; enemies.push(e); }
    else { e.tx = a[1]; e.ty = a[2]; e.hp = a[3]; }
  });
  enemies = enemies.filter(function (e) { return seen[e.id]; });
  var pseen = {};
  d.pl.forEach(function (a) {
    var id = a[0]; pseen[id] = 1;
    var p = players[id];
    if (!p) { p = mkPlayer(id, a[7] || id, colorFor(id), a[1], a[2], id === myId ? 'mouse' : 'remote', 3); p.local = id === myId; players[id] = p; }
    if (id !== myId) { p.tx = a[1]; p.ty = a[2]; }
    p.hp = a[3]; p.aim = a[4]; p.fire = !!a[5]; p.respawn = a[6] ? 1 : 0;
    if (a[7]) p.name = a[7];
    p.wcur = a[8] | 0; p.weapons = a[9] || [0];
    p.ammo = {};
    (a[10] || []).forEach(function (v, i) { if (v >= 0) p.ammo[i] = v; });
  });
  Object.keys(players).forEach(function (id) { if (!pseen[id] && id !== myId) delete players[id]; });
  pk = d.pk.map(function (a) { return { x: a[0], y: a[1], ph: Math.random() * 6, kind: a[2], widx: a[3], amt: a[4] }; });
}
function clientUpdate() {
  frame++;
  var me = players[myId];
  if (me) {
    if (me.respawn > 0) { me.fire = false; }
    else {
      localInput(me);
      if (me.cd > 0) me.cd--;
      var w = weaponOf(me);
      if (me.fire && me.cd <= 0) {
        me.cd = w.cooldown;
        tracers.push({ x: me.x + Math.cos(me.aim) * 22, y: me.y + Math.sin(me.aim) * 22, a: me.aim, life: 10 });
      }
    }
  }
  Object.values(players).forEach(function (p) {
    if (p.id === myId || !p.tx) return;
    p.x += (p.tx - p.x) * 0.2; p.y += (p.ty - p.y) * 0.2;
  });
  enemies.forEach(function (e) { e.x += (e.tx - e.x) * 0.2; e.y += (e.ty - e.y) * 0.2; if (e.flash > 0) e.flash--; });
  for (var t = tracers.length - 1; t >= 0; t--) if (--tracers[t].life <= 0) tracers.splice(t, 1);
  pk.forEach(function (p) { p.ph += 0.08; });
  if (me && myConn && myConn.open && frame % 5 === 0) {
    myConn.send({ t: 'st', x: Math.round(me.x), y: Math.round(me.y), aim: +me.aim.toFixed(2), fire: me.fire, wcur: me.wcurReq | 0 });
  }
  updateHUD();
}

/* ---------- drawing ---------- */
function draw() {
  ctx.fillStyle = (curMap && curMap.tint) || '#141a21';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.beginPath();
  for (var x = 48; x < W; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (var y = 48; y < H; y += 48) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  var i;
  for (i = 0; i < B.length; i++) {
    var b = B[i];
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.stroke();
  }
  for (i = 0; i < pk.length; i++) {
    var pkt = pk[i];
    if (pkt.kind === 'med') {
      var rr = 7 + Math.sin(pkt.ph) * 1.5;
      ctx.fillStyle = '#2f9e63'; ctx.beginPath(); ctx.arc(pkt.x, pkt.y, rr, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#0e1116'; ctx.fillRect(pkt.x - 4, pkt.y - 1.5, 8, 3); ctx.fillRect(pkt.x - 1.5, pkt.y - 4, 3, 8);
    } else if (pkt.kind === 'ammo') {
      var wc = (cfg.weapons[pkt.widx] || {}).color || '#3b82f6';
      ctx.fillStyle = wc; ctx.beginPath(); ctx.arc(pkt.x, pkt.y, 6 + Math.sin(pkt.ph) * 1.2, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#e8eaed'; ctx.beginPath(); ctx.arc(pkt.x, pkt.y, 2.2, 0, 6.283); ctx.fill();
    } else {
      ctx.fillStyle = '#8b5cf6';
      ctx.beginPath(); ctx.roundRect(pkt.x - 9, pkt.y - 9 + Math.sin(pkt.ph) * 1.5, 18, 18, 4); ctx.fill();
      ctx.fillStyle = '#e8eaed'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('W', pkt.x, pkt.y + 4 + Math.sin(pkt.ph) * 1.5);
    }
  }
  ctx.strokeStyle = '#e0a100'; ctx.lineWidth = 2;
  var blist = mode === 'client' ? [] : bullets;
  ctx.beginPath();
  for (i = 0; i < blist.length; i++) { var bl = blist[i]; ctx.moveTo(bl.x, bl.y); ctx.lineTo(bl.x - bl.vx * 1.6, bl.y - bl.vy * 1.6); }
  for (i = 0; i < tracers.length; i++) { var tr = tracers[i]; ctx.moveTo(tr.x, tr.y); ctx.lineTo(tr.x + Math.cos(tr.a) * 14, tr.y + Math.sin(tr.a) * 14); }
  ctx.stroke();
  for (i = 0; i < enemies.length; i++) {
    var e = enemies[i], t = cfg.enemyTypes[e.type] || cfg.enemyTypes[0];
    var a = 0, tgt = players[myId];
    if (tgt) a = Math.atan2(tgt.y - e.y, tgt.x - e.x);
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(a);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, e.r * 0.6, e.r, e.r * 0.4, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#3a4351'; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, 6.283); ctx.fill();
    ctx.fillStyle = t.color; ctx.fillRect(-e.r, -e.r * 0.7, e.r * 2, e.r * 0.6);
    ctx.fillRect(-e.r - 3, -e.r * 0.35, 3.5, 3.5);
    ctx.fillStyle = '#e8eaed';
    ctx.beginPath(); ctx.arc(e.r * 0.3, e.r * 0.22, 1.8, 0, 6.283); ctx.arc(e.r * 0.75, e.r * 0.22, 1.8, 0, 6.283); ctx.fill();
    if (e.flash > 0) { ctx.globalAlpha = 0.45; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.restore();
    if (e.hp < e.max) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(e.x - 11, e.y - e.r - 8, 22, 3);
      ctx.fillStyle = t.color; ctx.fillRect(e.x - 11, e.y - e.r - 8, 22 * Math.max(0, e.hp) / e.max, 3);
    }
  }
  Object.values(players).forEach(function (p) {
    if (p.dead) return;
    ctx.save(); ctx.translate(p.x, p.y);
    if (p.respawn > 0) ctx.globalAlpha = 0.35;
    ctx.rotate(p.aim);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 8, 13, 5, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-p.r, -3.5, p.r * 2, 7);
    ctx.fillStyle = '#1c2530'; ctx.beginPath(); ctx.arc(6, 0, 5, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#1c2530'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(9, 2); ctx.lineTo(23, 2); ctx.stroke();
    if (p.fire) { ctx.fillStyle = '#e0a100'; ctx.beginPath(); ctx.arc(25, 2, 3, 0, 6.283); ctx.fill(); }
    ctx.restore();
    if (mode === 'host' || mode === 'client') {
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p.name, p.x, p.y - p.r - 12);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(p.x - 14, p.y - p.r - 9, 28, 3);
      ctx.fillStyle = '#2f9e63'; ctx.fillRect(p.x - 14, p.y - p.r - 9, 28 * Math.max(0, p.hp) / p.max, 3);
    }
  });
  for (i = 0; i < parts.length; i++) {
    var pt = parts[i];
    ctx.globalAlpha = pt.life / 20; ctx.fillStyle = pt.c; ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
  var me2 = players[myId];
  if (me2 && me2.hurt > 24) {
    ctx.globalAlpha = (me2.hurt - 24) / 20; ctx.strokeStyle = '#d64545'; ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, W, H); ctx.globalAlpha = 1;
  }
  if (bannerT > 0 && --bannerT === 0) $('bn').style.display = 'none';
}

/* ---------- HUD ---------- */
function updateHUD() {
  var me = players[myId];
  $('wavenum').textContent = wave;
  $('score').textContent = me ? (scoreboard[myId] || 0) : 0;
  $('lives').textContent = me ? (mode === 'host' || mode === 'client' ? String.fromCharCode(8734) : me.lives) : 0;
  if (me) {
    var hf = $('hpfill');
    hf.style.width = Math.max(0, me.hp) + '%';
    hf.style.background = me.hp > 50 ? '#2f9e63' : (me.hp > 25 ? '#e0a100' : '#d64545');
    var w = weaponOf(me);
    $('wpn').textContent = w.name;
    var am = $('ammo');
    if (w.infinite) { am.textContent = String.fromCharCode(8734); am.style.color = ''; }
    else {
      var left = ammoOf(me, me.wcur);
      am.textContent = left;
      am.style.color = left === 0 ? '#d64545' : (left <= (w.startAmmo || 30) * 0.25 ? '#e0a100' : '');
    }
  }
  var dn = $('down');
  if (me && me.respawn > 0) { dn.style.display = 'block'; dn.textContent = 'You are down — back in ' + Math.ceil(me.respawn / 60) + 's'; }
  else dn.style.display = 'none';
  if (frame % 20 === 0 && (mode === 'host' || mode === 'client')) {
    var rows = Object.keys(scoreboard).sort(function (a, b) { return scoreboard[b] - scoreboard[a]; }).slice(0, 5);
    $('board').innerHTML = rows.map(function (id) {
      var nm = players[id] ? players[id].name : id;
      return '<div>' + nm + ' — <b style="color:#e8eaed">' + (scoreboard[id] || 0) + '</b></div>';
    }).join('');
  }
}

/* ---------- game over ---------- */
function gameOver(text) {
  over = true; mode = 'over';
  $('overTitle').textContent = 'Mission report';
  $('overText').textContent = text;
  $('over').style.display = 'flex';
}
function endRoom(text) {
  over = true; mode = 'over';
  if (peer) peer.destroy();
  $('overTitle').textContent = 'Room closed';
  $('overText').textContent = text;
  $('over').style.display = 'flex';
}

/* ---------- input wiring ---------- */
window.addEventListener('keydown', function (e) {
  var k = e.key.toLowerCase();
  keys[k] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) >= 0) e.preventDefault();
  if (mode === 'menu' || over) return;
  var n = parseInt(k, 10);
  if (n >= 1 && n <= cfg.weapons.length) requestWeapon(n - 1);
  if (k === 'q') cycleWeapon();
  if (players.P2 && ['7', '8', '9', '0'].indexOf(k) >= 0) {
    var wi = parseInt(k, 10) - 7;
    if (players.P2.weapons.indexOf(wi) >= 0) players.P2.wcur = wi;
  }
});
window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
function toGame(cx, cy) {
  var r = cv.getBoundingClientRect();
  return { x: (cx - r.left) * W / r.width, y: (cy - r.top) * H / r.height };
}
cv.addEventListener('mousemove', function (e) { var p = toGame(e.clientX, e.clientY); mouse.x = p.x; mouse.y = p.y; });
cv.addEventListener('mousedown', function () { mouse.down = true; });
window.addEventListener('mouseup', function () { mouse.down = false; });
cv.addEventListener('touchstart', function (e) {
  e.preventDefault(); var t0 = e.changedTouches[0];
  touch.active = true; touch.id = t0.identifier;
  var p = toGame(t0.clientX, t0.clientY);
  touch.sx = p.x; touch.sy = p.y; touch.cx = p.x; touch.cy = p.y;
}, { passive: false });
cv.addEventListener('touchmove', function (e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === touch.id) {
      var p = toGame(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
      touch.cx = p.x; touch.cy = p.y;
    }
  }
}, { passive: false });
function endTouch(e) {
  for (var i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === touch.id) touch.active = false;
}
cv.addEventListener('touchend', endTouch);
cv.addEventListener('touchcancel', endTouch);

/* ---------- menu wiring ---------- */
function hideMenu() { $('ov').style.display = 'none'; }
function setupLocal(n) {
  resetGame();
  diff = currentDiff();
  players.P1 = mkPlayer('P1', ($('pname').value || 'Defender').slice(0, 12), cfg.playerColors[0], W / 2 - 40, H / 2, n === 2 ? 'wasd' : 'mouse', diff.lives);
  players.P1.local = true; scoreboard.P1 = 0; myId = 'P1';
  if (n === 2) {
    players.P2 = mkPlayer('P2', 'Player 2', cfg.playerColors[1], W / 2 + 40, H / 2, 'arrows', diff.lives);
    players.P2.local = true; scoreboard.P2 = 0;
  }
}
$('btnSolo').onclick = function () { hideMenu(); setupLocal(1); mode = 'solo'; spawnWaveHost(1); };
$('btnCoop').onclick = function () { hideMenu(); setupLocal(2); mode = 'coop'; spawnWaveHost(1); };
$('btnHost').onclick = function () { hostOnline(); };
$('btnJoin').onclick = function () {
  var code = $('joinCode').value.trim().toUpperCase();
  if (code.length !== 4) { alert('Enter the 4-letter room code.'); return; }
  joinOnline(code);
};
$('joinCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('btnJoin').click(); });
$('btnAdmin').onclick = function () { window.open('admin.html', '_blank'); };
$('btnSwap').onclick = function () { cycleWeapon(); };
$('btnCopy').onclick = function () {
  var c = $('roomCode').textContent;
  if (navigator.clipboard) navigator.clipboard.writeText(c);
  banner('Code copied: ' + c);
};
$('btnCloseRoom').onclick = function () { endRoom('You closed the room.'); };
$('btnAgain').onclick = function () { location.reload(); };
window.addEventListener('beforeunload', function () { if (peer) peer.destroy(); });

/* ---------- main loop ---------- */
function loop() {
  requestAnimationFrame(loop);
  if (over) { draw(); return; }
  if (mode === 'solo' || mode === 'coop' || mode === 'host') hostUpdate();
  else if (mode === 'client') clientUpdate();
  draw();
}
applyMap(0);
loop();
})();
