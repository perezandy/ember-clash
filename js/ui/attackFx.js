// Attack FX layer: canvas particle effects over the battlefield.
// UI module: consumes `fx` events from the EventBus and reads the sprite
// anchor elements; it never imports game code.
//
// Events: bus 'fx' { side: 'player'|'enemy', kind, tier: 0-4 }
//   kind: 'slash' (blade swoosh), 'blunt' (shockwave), 'fire' | 'ice' |
//   'lightning' (tier-scaled intensity), 'heal'.
export class AttackFx {
  constructor(canvas, battlefield) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.battlefield = battlefield;
    this.clips = [];
    this.shake = null;
    this.raf = null;
    this.lastT = 0;
  }

  resize() {
    const r = this.battlefield.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.dpr = dpr;
  }

  // Anchor points: the caster's hand and the target's chest, in canvas px.
  anchors(side) {
    const br = this.battlefield.getBoundingClientRect();
    const id = side === 'player' ? 'player-sprite' : 'enemy-sprite';
    const other = side === 'player' ? 'enemy-sprite' : 'player-sprite';
    const a = document.getElementById(id).getBoundingClientRect();
    const o = document.getElementById(other).getBoundingClientRect();
    const px = (r, fx, fy) => ({
      x: (r.left - br.left + r.width * fx) / br.width * this.w,
      y: (r.top - br.top + r.height * fy) / br.height * this.h,
    });
    const from = side === 'player' ? px(a, 0.85, 0.4) : px(a, 0.15, 0.4);
    const to = side === 'player' ? px(o, 0.5, 0.45) : px(o, 0.5, 0.45);
    return { from, to };
  }

  play(d) {
    if (!d || !d.kind) return;
    if (this.w === undefined) this.resize();
    // The engine emits 'player'/'enemy' (basic attacks) and 'p'/'e' (skills);
    // normalize so the caster/target sprites resolve on the correct side.
    const isPlayer = d.side === 'player' || d.side === 'p';
    const side = isPlayer ? 'player' : 'enemy';
    const { from, to } = this.anchors(side);
    const scale = isPlayer ? 1 : 0.7;
    const t0 = performance.now();
    const clip = this.makeClip(d.kind, d.tier, from, to, scale);
    if (!clip) return;
    this.clips.push({ ...clip, t0 });
    if (clip.shake) this.shake = { amp: clip.shake, t0, dur: 260 };
    this.startLoop();
  }

  startLoop() {
    if (this.raf) return;
    const loop = (t) => {
      try {
        this.render(t);
      } catch (e) {
        // A draw error must not kill the FX layer for the rest of the fight.
        this.raf = null;
        this.clips = [];
        this.shake = null;
        const { ctx } = this;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.w, this.h);
        return;
      }
      const idle =
        this.clips.length === 0 &&
        (!this.shake || t - this.shake.t0 > this.shake.dur);
      if (idle) {
        this.raf = null;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.w, this.h);
        return;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  render(t) {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (this.shake && t - this.shake.t0 <= this.shake.dur) {
      const k = 1 - (t - this.shake.t0) / this.shake.dur;
      ctx.translate(
        (Math.random() * 2 - 1) * this.shake.amp * k,
        (Math.random() * 2 - 1) * this.shake.amp * k
      );
    }
    for (const c of this.clips) c.draw((t - c.t0) / c.dur, ctx);
    this.clips = this.clips.filter((c) => t - c.t0 < c.dur);
  }

  // ---------------------------------------------------------------- effects
  // Each maker returns { dur, draw(p), shake }. p is 0..1 progress.
  rnd(seed) {
    let s = seed >>> 0;
    return () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  makeClip(kind, tier, from, to, scale) {
    switch (kind) {
      case 'slash': return this.slash(from, to, tier, scale);
      case 'blunt': return this.blunt(from, to, tier, scale);
      case 'fire': return this.fire(from, to, tier, scale);
      case 'ice': return this.ice(from, to, tier, scale);
      case 'lightning': return this.lightning(from, to, tier, scale);
      case 'heal': return this.heal(from, scale);
      default: return null;
    }
  }

  // --- Blade air swoosh: three staggered arced streaks sweep to target ---
  slash(from, to, tier = 0, scale = 1) {
    const dur = 320;
    const s = (0.5 + 0.125 * tier) * scale; // tier 4 = full size, tier 0 = ~half
    const streaks = [0, 70, 140].map((off, i) => ({
      off,
      bow: (i - 1) * 0.35 + (Math.random() - 0.5) * 0.15,
      len: 0.42 + Math.random() * 0.1,
    }));
    const impact = 0.55;
    return {
      dur,
      shake: 2 * s,
      draw(p, ctx) {
        if (p > 1) return;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy);
        const nx = -dy / len, ny = dx / len;
        const mid = { x: from.x + dx * 0.5, y: from.y + dy * 0.5 };
        for (const st of streaks) {
          const t = (p * dur - st.off) / 180; // per-streak progress
          if (t < 0 || t > 1) continue;
          const sweep = 0.15 + t * 0.85;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i <= 14; i++) {
            const u = Math.max(0, sweep - st.len) + (st.len * i) / 14;
            if (u > sweep) break;
            const bx = from.x + dx * u + nx * st.bow * len * 0.18 * Math.sin(Math.PI * u);
            const by = from.y + dy * u + ny * st.bow * len * 0.18 * Math.sin(Math.PI * u);
            const a = Math.sin(Math.PI * (i / 14));
            ctx.strokeStyle = `rgba(220, 240, 255, ${0.75 * a})`;
            ctx.lineWidth = (10 - i * 0.35) * s;
            ctx.beginPath();
            ctx.arc(bx, by, (34 - i * 1.9) * s, Math.atan2(ny, nx) - 1.15, Math.atan2(ny, nx) + 1.15);
            ctx.stroke();
          }
          ctx.restore();
        }
        // Impact flash at the target.
        const f = (p - impact) / 0.3;
        if (f > 0 && f < 1) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(to.x, to.y, 0, to.x, to.y, 46 * s);
          g.addColorStop(0, `rgba(235, 245, 255, ${0.8 * (1 - f)})`);
          g.addColorStop(1, 'rgba(235, 245, 255, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(to.x, to.y, 46 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      },
    };
  }

  // --- Blunt: my pick — a radial shockwave burst with dust + cracks ---
  blunt(from, to, tier, scale) {
    const dur = 420;
    const ts = (0.5 + 0.125 * tier) * scale; // tier 4 = full size, tier 0 = ~half
    const rnd = this.rnd(7 + tier);
    const dust = Array.from({ length: 14 + tier * 6 }, () => ({
      a: rnd() * Math.PI * 2,
      sp: (40 + rnd() * 90) * ts,
      r: (2 + rnd() * 4) * ts,
      drift: (rnd() - 0.5) * 20 * ts,
    }));
    const cracks = Array.from({ length: 5 + tier }, () => ({
      a: rnd() * Math.PI * 2,
      len: (20 + rnd() * 46) * ts,
      w: (1 + rnd() * 2) * ts,
    }));
    const impact = 0.35;
    return {
      dur,
      shake: (4 + tier * 2) * ts,
      draw(p, ctx) {
        if (p > 1) return;
        const f = Math.max(0, (p - impact) / (1 - impact));
        if (f <= 0) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // Expanding shock rings.
        for (const [k, alpha] of [[0, 0.85], [0.22, 0.45]]) {
          const r = (12 + 95 * f) * (1 - k * 0.35) * (1 + tier * 0.08) * scale;
          ctx.strokeStyle = `rgba(255, 236, 200, ${alpha * (1 - f)})`;
          ctx.lineWidth = (6 - 4 * f) * scale;
          ctx.beginPath();
          ctx.arc(to.x, to.y, Math.max(1, r), 0, Math.PI * 2);
          ctx.stroke();
        }
        // Core flash.
        const g = ctx.createRadialGradient(to.x, to.y, 0, to.x, to.y, 60 * ts);
        g.addColorStop(0, `rgba(255, 240, 210, ${0.85 * (1 - f * 1.4)})`);
        g.addColorStop(1, 'rgba(255, 240, 210, 0)');
        if (f < 0.72) {
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(to.x, to.y, 60 * ts, 0, Math.PI * 2);
          ctx.fill();
        }
        // Dust particles (radial + gravity).
        for (const d of dust) {
          const dist = d.sp * f * ts;
          const x = to.x + Math.cos(d.a) * dist + d.drift * f;
          const y = to.y + Math.sin(d.a) * dist * 0.8 + 40 * f * f;
          ctx.fillStyle = `rgba(210, 190, 160, ${0.7 * (1 - f)})`;
          ctx.beginPath();
          ctx.arc(x, y, d.r * (1 - f * 0.5) * ts, 0, Math.PI * 2);
          ctx.fill();
        }
        // Ground cracks.
        for (const c of cracks) {
          const a = (1 - f) * 0.9;
          ctx.strokeStyle = `rgba(255, 220, 170, ${a})`;
          ctx.lineWidth = c.w * ts;
          const grow = 0.35 + 0.65 * Math.min(1, f * 2);
          ctx.beginPath();
          ctx.moveTo(to.x + Math.cos(c.a) * 8, to.y + Math.sin(c.a) * 8);
          ctx.lineTo(to.x + Math.cos(c.a) * c.len * grow, to.y + Math.sin(c.a) * c.len * grow * 0.7);
          ctx.stroke();
        }
        ctx.restore();
      },
    };
  }

  // --- Fire: a fireball crossing the screen; hotter + bigger per tier ---
  fire(from, to, tier, scale) {
    const dur = 640;
    const ts = (0.5 + 0.125 * tier) * scale; // tier 4 = full size, tier 0 = ~half
    const rnd = this.rnd(101 + tier);
    const n = 16 + tier * 16;
    const parts = Array.from({ length: n }, () => ({
      o: (rnd() - 0.5) * 0.16, // vertical offset along the path
      sp: 0.85 + rnd() * 0.3, // travel speed variance
      r: (4 + rnd() * 9) * (0.8 + tier * 0.15) * ts,
      wob: rnd() * Math.PI * 2,
    }));
    const burst = Array.from({ length: 14 + tier * 12 }, () => ({
      a: rnd() * Math.PI * 2,
      sp: (50 + rnd() * 130) * ts,
      r: (3 + rnd() * 7) * ts,
    }));
    const impact = 0.58;
    // Whiter core as the tier climbs (T1 deep orange -> T5 white-hot).
    const coreA = 0.25 + tier * 0.16;
    return {
      dur,
      shake: (2 + tier) * scale,
      draw(p, ctx) {
        if (p > 1) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // Travel phase.
        if (p < impact + 0.12) {
          for (const pt of parts) {
            const t = p * pt.sp;
            if (t > 1) continue;
            const x = from.x + (to.x - from.x) * t;
            const y =
              from.y +
              (to.y - from.y) * t +
              pt.o * (to.y - from.y) +
              Math.sin(p * 14 + pt.wob) * 6 * ts;
            const fade = t > 0.85 ? (1 - t) / 0.15 : 1;
            const r = pt.r * (0.75 + 0.25 * Math.sin(p * 20 + pt.wob)) * ts;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(255, 255, ${Math.round(180 + coreA * 120)}, ${0.9 * fade})`);
            g.addColorStop(0.45, `rgba(255, ${150 + tier * 20}, 40, ${0.75 * fade})`);
            g.addColorStop(1, 'rgba(200, 40, 10, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // Impact burst.
        const f = (p - impact) / (1 - impact);
        if (f > 0 && f < 1) {
          // Explosion glow, bigger and whiter on higher tiers.
          const R = (46 + tier * 26) * f * 1.6 * ts;
          const g = ctx.createRadialGradient(to.x, to.y, 0, to.x, to.y, Math.max(1, R));
          g.addColorStop(0, `rgba(255, 255, ${Math.round(140 + coreA * 140)}, ${0.95 * (1 - f)})`);
          g.addColorStop(0.4, `rgba(255, ${120 + tier * 25}, 30, ${0.8 * (1 - f)})`);
          g.addColorStop(1, 'rgba(180, 30, 5, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(to.x, to.y, Math.max(1, R), 0, Math.PI * 2);
          ctx.fill();
          for (const b of burst) {
            const dist = b.sp * f * (1 + tier * 0.12) * ts;
            const x = to.x + Math.cos(b.a) * dist;
            const y = to.y + Math.sin(b.a) * dist * 0.8 + 30 * f * f;
            const g2 = ctx.createRadialGradient(x, y, 0, x, y, b.r * (1 - f * 0.6) * ts);
            g2.addColorStop(0, `rgba(255, 220, 120, ${0.85 * (1 - f)})`);
            g2.addColorStop(1, 'rgba(255, 90, 20, 0)');
            ctx.fillStyle = g2;
            ctx.beginPath();
            ctx.arc(x, y, Math.max(0.5, b.r * (1 - f * 0.6) * ts), 0, Math.PI * 2);
            ctx.fill();
          }
          // Tier 4+: an outer shock ring; tier 5: a full-canvas heat flash.
          if (tier >= 3) {
            const rr = (60 + 130 * f) * ts;
            ctx.strokeStyle = `rgba(255, 190, 90, ${0.5 * (1 - f)})`;
            ctx.lineWidth = (5 - 3 * f) * ts;
            ctx.beginPath();
            ctx.arc(to.x, to.y, Math.max(1, rr), 0, Math.PI * 2);
            ctx.stroke();
          }
          if (tier >= 4 && f < 0.4) {
            ctx.fillStyle = `rgba(255, 120, 40, ${(0.4 - f) * 0.45 * scale})`;
            ctx.fillRect(-20, -20, this.w + 40, this.h + 40);
          }
        }
        ctx.restore();
      },
    };
  }

  // --- Ice: snowflakes/crystals crossing the screen; sharper per tier ---
  snowflake(ctx, x, y, r, rot, alpha, arms = 6) {
    ctx.strokeStyle = `rgba(190, 230, 255, ${alpha})`;
    ctx.lineWidth = Math.max(1, r * 0.14);
    for (let i = 0; i < arms; i++) {
      const a = rot + (i / arms) * Math.PI * 2;
      const bx = x + Math.cos(a) * r;
      const by = y + Math.sin(a) * r;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(bx, by);
      // side ticks on longer flakes
      if (r > 7) {
        const ma = a + Math.PI / 2;
        const mx = x + Math.cos(a) * r * 0.6;
        const my = y + Math.sin(a) * r * 0.6;
        ctx.moveTo(mx - Math.cos(ma) * r * 0.22, my - Math.sin(ma) * r * 0.22);
        ctx.lineTo(mx + Math.cos(ma) * r * 0.22, my + Math.sin(ma) * r * 0.22);
      }
      ctx.stroke();
    }
  }

  ice(from, to, tier, scale) {
    const dur = 640;
    const ts = (0.5 + 0.125 * tier) * scale; // tier 4 = full size, tier 0 = ~half
    const flake = this.snowflake; // bind before the closure (this = clip there)
    const rnd = this.rnd(300 + tier);
    const n = 12 + tier * 10;
    const flakes = Array.from({ length: n }, () => ({
      o: (rnd() - 0.5) * 0.2,
      sp: 0.85 + rnd() * 0.3,
      r: (5 + rnd() * 8) * (0.8 + tier * 0.18) * ts,
      rot: rnd() * Math.PI,
      spin: (rnd() - 0.5) * 6,
    }));
    const shards = Array.from({ length: 10 + tier * 8 }, () => ({
      a: rnd() * Math.PI * 2,
      sp: (60 + rnd() * 120) * ts,
      s: (3 + rnd() * 6) * ts,
      rot: rnd() * Math.PI,
    }));
    const impact = 0.58;
    return {
      dur,
      shake: (2 + tier * 0.8) * ts,
      draw(p, ctx) {
        if (p > 1) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        if (p < impact + 0.12) {
          for (const f of flakes) {
            const t = p * f.sp;
            if (t > 1) continue;
            const x = from.x + (to.x - from.x) * t;
            const y =
              from.y + (to.y - from.y) * t + f.o * (to.y - from.y) + Math.sin(t * 9 + f.rot) * 7 * ts;
            const fade = t > 0.85 ? (1 - t) / 0.15 : 1;
            flake(ctx, x, y, f.r * ts, f.rot + t * f.spin, 0.85 * fade);
          }
        }
        const f = (p - impact) / (1 - impact);
        if (f > 0 && f < 1) {
          // Frost burst glow.
          const R = (40 + tier * 24) * f * 1.5 * ts;
          const g = ctx.createRadialGradient(to.x, to.y, 0, to.x, to.y, Math.max(1, R));
          g.addColorStop(0, `rgba(230, 250, 255, ${0.9 * (1 - f)})`);
          g.addColorStop(0.5, `rgba(150, 210, 255, ${0.65 * (1 - f)})`);
          g.addColorStop(1, 'rgba(120, 180, 255, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(to.x, to.y, Math.max(1, R), 0, Math.PI * 2);
          ctx.fill();
          // Shattering crystal shards.
          for (const s of shards) {
            const dist = s.sp * f * (1 + tier * 0.1) * ts;
            const x = to.x + Math.cos(s.a) * dist;
            const y = to.y + Math.sin(s.a) * dist * 0.8 + 44 * f * f;
            const sz = s.s * (1 - f * 0.5) * ts;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(s.rot + f * 4);
            ctx.fillStyle = `rgba(200, 235, 255, ${0.85 * (1 - f)})`;
            ctx.beginPath();
            ctx.moveTo(0, -sz);
            ctx.lineTo(sz * 0.6, sz * 0.5);
            ctx.lineTo(-sz * 0.6, sz * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
          // Crystalline ring: 8 short arc segments.
          const rr = (30 + 90 * f) * ts;
          ctx.strokeStyle = `rgba(200, 240, 255, ${0.6 * (1 - f)})`;
          ctx.lineWidth = 2.5 * ts;
          for (let i = 0; i < 8; i++) {
            const a0 = (i / 8) * Math.PI * 2 + f * 0.4;
            ctx.beginPath();
            ctx.arc(to.x, to.y, Math.max(1, rr), a0, a0 + Math.PI / 6);
            ctx.stroke();
          }
          if (tier >= 4 && f < 0.4) {
            ctx.fillStyle = `rgba(150, 210, 255, ${(0.4 - f) * 0.4 * scale})`;
            ctx.fillRect(-20, -20, this.w + 40, this.h + 40);
          }
        }
        ctx.restore();
      },
    };
  }

  // --- Lightning: jagged bolts from the sky; more bolts/brightness per tier ---
  lightning(from, to, tier, scale) {
    const dur = 400;
    const ts = (0.5 + 0.125 * tier) * scale; // tier 4 = full size, tier 0 = ~half
    const rnd = this.rnd(500 + tier);
    const bolts = 1 + Math.floor(tier / 2);
    const defs = Array.from({ length: bolts }, (_, i) => ({
      ox: (i - (bolts - 1) / 2) * 46 * ts,
      pts: Array.from({ length: 9 }, (_, j) => ({
        u: j / 8,
        jx: (rnd() - 0.5) * (26 + tier * 14) * ts,
        jy: (rnd() - 0.5) * (18 + tier * 8) * ts,
      })),
      branches: tier >= 2
        ? Array.from({ length: 1 + Math.floor(tier / 2) }, () => ({
            u: 0.25 + rnd() * 0.5,
            len: (20 + rnd() * 50) * ts,
            a: (rnd() - 0.5) * 2.2 + (rnd() > 0.5 ? 0 : Math.PI),
          }))
        : [],
      flick: rnd() * Math.PI * 2,
    }));
    return {
      dur,
      shake: (3 + tier * 1.6) * ts,
      draw(p, ctx) {
        if (p > 1) return;
        const flicker = 0.75 + 0.25 * Math.sin(p * 40);
        const alpha = (0.55 + tier * 0.1) * (1 - Math.max(0, (p - 0.55) / 0.45));
        if (alpha <= 0) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // Top anchor above the target, bottom at the target.
        const top = { x: to.x, y: -10 };
        const point = (b) => {
          const base = {
            x: top.x + (b.u * (to.x - top.x)) + b.jx * (0.6 + b.u * 0.4),
            y: top.y + b.u * (to.y - top.y) + b.jy * (0.6 + b.u * 0.4),
          };
          return base;
        };
        for (const b of defs) {
          const path = [
            { x: top.x + b.ox, y: top.y },
            ...b.pts.map((pt) => {
              const q = point({ ...pt, jx: pt.jx + b.ox * 0.5, jy: pt.jy });
              return q;
            }),
            { x: to.x + b.ox, y: to.y },
          ];
          // Wide glow pass, then bright core.
          for (const [w, a] of [
            [(9 + tier * 2.4) * ts, alpha * 0.28 * flicker],
            [(3 + tier * 0.8) * ts, alpha * 0.85 * flicker],
          ]) {
            ctx.strokeStyle =
              w > 5
                ? `rgba(140, 170, 255, ${a})`
                : `rgba(${200 + tier * 13}, ${225 + tier * 6}, 255, ${a})`;
            ctx.lineWidth = w;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(path[0].x, path[0].y);
            for (const q of path.slice(1)) ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
          // Branches.
          for (const br of b.branches) {
            const base = point({ u: br.u, jx: b.ox * 0.4, jy: 0 });
            const ex = base.x + Math.cos(br.a) * br.len * (1 + tier * 0.1) * ts * 0.8;
            const ey = base.y + Math.abs(Math.sin(br.a)) * br.len * 0.6 * ts;
            ctx.strokeStyle = `rgba(190, 215, 255, ${alpha * 0.6 * flicker})`;
            ctx.lineWidth = (2 + tier * 0.5) * ts;
            ctx.beginPath();
            ctx.moveTo(base.x, base.y);
            ctx.lineTo(ex, ey);
            ctx.stroke();
          }
          // Impact flare.
          const R = (26 + tier * 16) * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, p * 1.6))) * ts;
          const g = ctx.createRadialGradient(to.x + b.ox, to.y, 0, to.x + b.ox, to.y, Math.max(1, R));
          g.addColorStop(0, `rgba(230, 240, 255, ${alpha * 0.8 * flicker})`);
          g.addColorStop(1, 'rgba(150, 180, 255, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(to.x + b.ox, to.y, Math.max(1, R), 0, Math.PI * 2);
          ctx.fill();
        }
        // Screen flash, stronger per tier.
        if (tier >= 2 && p < 0.5) {
          ctx.fillStyle = `rgba(170, 195, 255, ${(p * (0.1 + tier * 0.05) * ts).toFixed(3)})`;
          ctx.fillRect(-20, -20, this.w + 40, this.h + 40);
        }
        ctx.restore();
      },
    };
  }

  // --- Heal: green sparkles rising around the caster ---
  heal(from, scale) {
    const dur = 800;
    const rnd = this.rnd(999);
    const parts = Array.from({ length: 16 }, () => ({
      x: (rnd() - 0.5) * 90,
      y: (rnd() - 0.5) * 40,
      sp: 40 + rnd() * 70,
      r: 2 + rnd() * 4,
      ph: rnd() * Math.PI * 2,
    }));
    return {
      dur,
      draw(p, ctx) {
        if (p > 1) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const pt of parts) {
          const f = p * pt.sp / 100;
          const y = from.y + 60 * scale - f * 90 * scale + Math.sin(p * 6 + pt.ph) * 8;
          const x = from.x + pt.x * scale + Math.sin(p * 4 + pt.ph) * 14 * scale;
          const a = Math.sin(Math.PI * Math.min(1, p * 1.2));
          ctx.strokeStyle = `rgba(140, 255, 170, ${0.85 * a})`;
          ctx.lineWidth = 2 * scale;
          const r = pt.r * scale;
          ctx.beginPath();
          ctx.moveTo(x - r, y);
          ctx.lineTo(x + r, y);
          ctx.moveTo(x, y - r);
          ctx.lineTo(x, y + r);
          ctx.stroke();
        }
        ctx.restore();
      },
    };
  }
}
