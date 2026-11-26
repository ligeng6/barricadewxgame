const W = 750;
const H = 1334;

const COLORS = {
  bgTop: '#2E1D12',
  bgBottom: '#1B100B',
  frame: '#8B5E34',
  gold: '#F2C14E',
  goldDark: '#B8860B',
  cream: '#F3E5C3',
  cellFill: 'rgba(243, 229, 195, 0.08)',
  cellStroke: 'rgba(243, 229, 195, 0.28)',
  wall: '#D9822B',
  wallDark: '#A95B1B',
  red: '#E53935',
  green: '#43A047',
  btnText: '#2B1B12',
  panel: 'rgba(43, 27, 18, 0.96)',
};

const RULES = [
  '目标：将己方棋子推进到对面底线',
  '（类似橄榄球），先到达者获胜。',
  '',
  '回合：二选一——',
  '· 走一步：向上/下/左/右移动一格；',
  '· 放一墙：放置一面两格长的墙阻挡路径。',
  '',
  '跳子：对方棋子紧邻时可跳过它；',
  '若前方有墙或边线，可斜向跳到它两侧。',
  '',
  '放墙：墙不能重叠已有墙，且放墙后',
  '双方必须都仍有一条路到达对面底线。',
];

function rgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default class StartScene {
  constructor(main) {
    this.main = main;
    this.rulesOpen = false;
    this.buttons = [
      { id: 'start', x: 147, y: 895, w: 456, h: 96, label: '本地对战' },
      { id: 'online', x: 147, y: 1015, w: 456, h: 96, label: '联机对战' },
      { id: 'rules', x: 147, y: 1135, w: 456, h: 96, label: '游戏规则' },
    ];
  }

  onTouch(x, y) {
    if (this.rulesOpen) {
      this.rulesOpen = false;
      return;
    }
    for (const btn of this.buttons) {
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
      if (btn.id === 'rules') {
        this.rulesOpen = true;
      } else if (btn.id === 'start' && this.main.onStart) {
        this.main.onStart();
      } else if (btn.id === 'online' && this.main.onOnline) {
        this.main.onOnline();
      }
        return;
      }
    }
  }

  draw(ctx) {
    this.drawBackground(ctx);
    this.drawTitle(ctx);
    this.drawMiniBoard(ctx);
    this.drawButtons(ctx);
    this.drawFooter(ctx);
    if (this.rulesOpen) this.drawRules(ctx);
  }

  drawBackground(ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, COLORS.bgTop);
    grad.addColorStop(1, COLORS.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = COLORS.frame;
    ctx.lineWidth = 3;
    this.roundRect(ctx, 28, 28, W - 56, H - 56, 24);
    ctx.stroke();
    ctx.lineWidth = 1;
    this.roundRect(ctx, 40, 40, W - 80, H - 80, 18);
    ctx.stroke();
  }

  drawTitle(ctx) {
    ctx.textAlign = 'center';

    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 120px sans-serif';
    ctx.fillText('路 障', W / 2, 210);

    ctx.fillStyle = COLORS.cream;
    ctx.font = '32px sans-serif';
    ctx.fillText('B A R R I C A D E', W / 2, 272);

    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 180, 315);
    ctx.lineTo(W / 2 - 24, 315);
    ctx.moveTo(W / 2 + 24, 315);
    ctx.lineTo(W / 2 + 180, 315);
    ctx.stroke();
    ctx.fillStyle = COLORS.gold;
    ctx.save();
    ctx.translate(W / 2, 315);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-9, -9, 18, 18);
    ctx.restore();

    ctx.fillStyle = 'rgba(243, 229, 195, 0.75)';
    ctx.font = '28px sans-serif';
    ctx.fillText('经典策略棋盘对抗游戏', W / 2, 365);
  }

  drawMiniBoard(ctx) {
    const cell = 40;
    const gap = 7;
    const unit = cell + gap;
    const boardW = 9 * cell + 8 * gap;
    const x0 = (W - boardW) / 2;
    const y0 = 425;
    const cellX = (c) => x0 + c * unit;
    const cellY = (r) => y0 + r * unit;

    ctx.fillStyle = 'rgba(243, 229, 195, 0.05)';
    this.roundRect(ctx, x0 - 30, y0 - 30, boardW + 60, boardW + 60, 18);
    ctx.fill();

    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 9; c += 1) {
        if (r === 0) {
          ctx.fillStyle = rgba(COLORS.red, 0.14);
        } else if (r === 8) {
          ctx.fillStyle = rgba(COLORS.green, 0.14);
        } else {
          ctx.fillStyle = COLORS.cellFill;
        }
        this.roundRect(ctx, cellX(c), cellY(r), cell, cell, 8);
        ctx.fill();
        ctx.strokeStyle = COLORS.cellStroke;
        ctx.lineWidth = 1;
        this.roundRect(ctx, cellX(c), cellY(r), cell, cell, 8);
        ctx.stroke();
      }
    }

    const wallThick = 10;
    const wallLen = 2 * cell + gap;
    const sampleWalls = [
      { o: 'h', r: 3, c: 1 },
      { o: 'v', r: 5, c: 6 },
      { o: 'h', r: 6, c: 4 },
      { o: 'v', r: 2, c: 3 },
    ];
    for (const w of sampleWalls) {
      let x;
      let y;
      let bw;
      let bh;
      if (w.o === 'h') {
        x = cellX(w.c);
        y = cellY(w.r) + cell + (gap - wallThick) / 2;
        bw = wallLen;
        bh = wallThick;
      } else {
        x = cellX(w.c) + cell + (gap - wallThick) / 2;
        y = cellY(w.r);
        bw = wallThick;
        bh = wallLen;
      }
      const grad = ctx.createLinearGradient(x, y, x + bw, y + bh);
      grad.addColorStop(0, COLORS.wall);
      grad.addColorStop(1, COLORS.wallDark);
      ctx.fillStyle = grad;
      this.roundRect(ctx, x, y, bw, bh, 5);
      ctx.fill();
    }

    const pawns = [
      { r: 0, c: 4, color: COLORS.green },
      { r: 8, c: 4, color: COLORS.red },
    ];
    for (const p of pawns) {
      const cx = cellX(p.c) + cell / 2;
      const cy = cellY(p.r) + cell / 2;
      ctx.fillStyle = rgba(p.color, 0.3);
      ctx.beginPath();
      ctx.arc(cx, cy, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(27, 16, 11, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.font = '20px sans-serif';
    ctx.fillStyle = rgba(COLORS.red, 0.9);
    ctx.fillText('红方目标线', W / 2, y0 - 12);
    ctx.fillStyle = rgba(COLORS.green, 0.9);
    ctx.fillText('绿方目标线', W / 2, y0 + boardW + 28);
  }

  drawButtons(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < this.buttons.length; i += 1) {
      const btn = this.buttons[i];
      if (i === 0) {
        const grad = ctx.createLinearGradient(0, btn.y, 0, btn.y + btn.h);
        grad.addColorStop(0, COLORS.gold);
        grad.addColorStop(1, COLORS.goldDark);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = 'rgba(243, 229, 195, 0.08)';
      }
      this.roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 50);
      ctx.fill();
      if (i === 1) {
        ctx.strokeStyle = COLORS.gold;
        ctx.lineWidth = 2;
        this.roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 50);
        ctx.stroke();
      }
      ctx.fillStyle = i === 0 ? COLORS.btnText : COLORS.gold;
      ctx.font = 'bold 40px sans-serif';
      ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 2);
    }
    ctx.textBaseline = 'alphabetic';
  }

  drawFooter(ctx) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(243, 229, 195, 0.5)';
    ctx.font = '24px sans-serif';
    ctx.fillText('双人对战 · 走一步或放一墙 · 先达对面底线者胜', W / 2, 1245);
    ctx.font = '20px sans-serif';
    ctx.fillText('QUORIDOR RULES', W / 2, 1278);
    ctx.textAlign = 'left';
  }

  drawRules(ctx) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(0, 0, W, H);

    const px = 75;
    const py = 240;
    const pw = 600;
    const ph = 820;
    ctx.fillStyle = COLORS.panel;
    this.roundRect(ctx, px, py, pw, ph, 20);
    ctx.fill();
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 2;
    this.roundRect(ctx, px, py, pw, ph, 20);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText('游戏规则', W / 2, py + 80);

    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + 120, py + 108);
    ctx.lineTo(px + pw - 120, py + 108);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.cream;
    ctx.font = '26px sans-serif';
    let y = py + 170;
    for (const line of RULES) {
      ctx.fillText(line, px + 60, y);
      y += line === '' ? 22 : 44;
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(243, 229, 195, 0.6)';
    ctx.font = '24px sans-serif';
    ctx.fillText('点击任意处返回', W / 2, py + ph - 48);
    ctx.textAlign = 'left';
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
