import StartScene from './scene-start';
import {
  createState, legalMoves, applyMove, applyWall, wallPlacementError,
  GOAL_ROW, WALLS_PER_PLAYER,
} from './board';

const W = 750;
const H = 1334;

const CELL = 58;
const GAP = 8;
const UNIT = CELL + GAP;
const WALL_THICK = 10;
const BOARD_W = 9 * CELL + 8 * GAP;
const X0 = (W - BOARD_W) / 2;
const Y0 = 272;

const PLAYERS = [
  { name: '红方', color: '#E53935' },
  { name: '绿方', color: '#43A047' },
];

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
  btnText: '#2B1B12',
  panel: 'rgba(43, 27, 18, 0.96)',
};

function rgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default class GameScene {
  constructor(main, opts) {
    this.main = main;
    this.net = main.net;
    this.online = !!(opts && opts.online);
    this.myPos = this.online && typeof opts.myPos === 'number' ? opts.myPos : -1;
    this.names = (opts && opts.names) || ['红方', '绿方'];
    this.state = createState();
    this.mode = 'move';
    this.preview = null;
    this.toast = null;
    this.againMe = false;
    this.againOp = false;
    this.leaving = false;
    this.disconnected = false;
    this.buttons = [
      { id: 'back', x: 56, y: 50, w: 130, h: 52, label: '‹ 主页' },
      { id: 'resign', x: 564, y: 50, w: 130, h: 52, label: '认输' },
      { id: 'modeMove', x: 120, y: 1000, w: 240, h: 72, label: '走一步' },
      { id: 'modeWall', x: 390, y: 1000, w: 240, h: 72, label: '放一墙' },
      { id: 'confirm', x: 120, y: 1095, w: 240, h: 72, label: '确认放置' },
      { id: 'cancel', x: 390, y: 1095, w: 240, h: 72, label: '取消' },
      { id: 'restart', x: 147, y: 810, w: 456, h: 96, label: '再来一局' },
      { id: 'home', x: 147, y: 930, w: 456, h: 96, label: '返回主页' },
    ];
    if (this.online) {
      this.offMsg = this.net.on('msg', (m) => this.onNetMsg(m));
      this.offRoom = this.net.on('room', (info) => this.onRoomInfo(info));
      this.offDisc = this.net.on('disconnect', () => this.onDisconnect());
    }
  }

  dispose() {
    if (!this.online) return;
    this.net.off('msg', this.offMsg);
    this.net.off('room', this.offRoom);
    this.net.off('disconnect', this.offDisc);
  }

  goHome() {
    if (this.online && !this.leaving) {
      this.leaving = true;
      this.net.leaveRoom();
    }
    this.main.setScene(new StartScene(this.main));
  }

  myTurn() {
    return !this.online || this.state.turn === this.myPos;
  }

  serialize() {
    const s = this.state;
    return {
      pawns: [{ r: s.pawns[0].r, c: s.pawns[0].c }, { r: s.pawns[1].r, c: s.pawns[1].c }],
      wallsLeft: [s.wallsLeft[0], s.wallsLeft[1]],
      h: Array.from(s.hWalls),
      v: Array.from(s.vWalls),
      turn: s.turn,
      winner: s.winner,
      moves: s.moves,
    };
  }

  restoreState(data) {
    if (!data || !data.pawns) return;
    this.state = {
      pawns: [{ r: data.pawns[0].r, c: data.pawns[0].c }, { r: data.pawns[1].r, c: data.pawns[1].c }],
      wallsLeft: [data.wallsLeft[0], data.wallsLeft[1]],
      hWalls: new Set(data.h || []),
      vWalls: new Set(data.v || []),
      turn: data.turn,
      winner: data.winner,
      moves: data.moves || 0,
    };
    this.preview = null;
  }

  resetGame() {
    this.state = createState();
    this.againMe = false;
    this.againOp = false;
    this.preview = null;
    this.mode = 'move';
    this.showToast('新一局开始');
  }

  onNetMsg(m) {
    const s = this.state;
    if (m.t === 'move') {
      if (applyMove(s, m.p, { r: m.r, c: m.c })) return;
      this.net.send({ t: 'reqsync' });
    } else if (m.t === 'wall') {
      if (applyWall(s, m.p, m.o, m.r, m.c)) return;
      this.net.send({ t: 'reqsync' });
    } else if (m.t === 'again') {
      if (s.winner === -1) return;
      this.againOp = true;
      if (this.againMe) {
        this.resetGame();
      } else {
        this.showToast('对方想再来一局，点再来一局接受');
      }
    } else if (m.t === 'resign') {
      if (s.winner === -1) {
        s.winner = 1 - m.p;
        this.showToast('对方已认输');
      }
    } else if (m.t === 'bye') {
      this.handleOpponentLeft();
    } else if (m.t === 'reqsync') {
      this.net.send({ t: 'sync', s: this.serialize() });
    } else if (m.t === 'sync') {
      this.restoreState(m.s);
    }
  }

  handleOpponentLeft() {
    if (this.leaving) return;
    this.showToast('对方已离开房间');
    if (this.state.winner === -1) {
      this.state.winner = this.myPos >= 0 ? this.myPos : 0;
    }
  }

  onRoomInfo(info) {
    if (this.leaving || !info || !info.memberList) return;
    if (info.memberList.length < 2) this.handleOpponentLeft();
  }

  onDisconnect() {
    if (this.leaving) return;
    this.disconnected = true;
    this.showToast('连接中断，重连中…');
    this.net.reconnect((ok) => {
      this.disconnected = false;
      if (ok) {
        this.net.send({ t: 'reqsync' });
        this.showToast('已重新连接');
      } else {
        this.showToast('重连失败，请返回主页重试');
      }
    });
  }

  cellX(c) {
    return X0 + c * UNIT;
  }

  cellY(r) {
    return Y0 + r * UNIT;
  }

  hit(btn, x, y) {
    return x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
  }

  nearestWallSlot(px, py) {
    let best = null;
    let bestD = Infinity;
    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        const hx = this.cellX(c) + (2 * CELL + GAP) / 2;
        const hy = this.cellY(r) + CELL + GAP / 2;
        const hd = (px - hx) * (px - hx) + (py - hy) * (py - hy);
        if (hd < bestD) {
          bestD = hd;
          best = { orientation: 'h', r, c };
        }
        const vx = this.cellX(c) + CELL + GAP / 2;
        const vy = this.cellY(r) + (2 * CELL + GAP) / 2;
        const vd = (px - vx) * (px - vx) + (py - vy) * (py - vy);
        if (vd < bestD) {
          bestD = vd;
          best = { orientation: 'v', r, c };
        }
      }
    }
    return best;
  }

  showToast(text) {
    this.toast = { text, until: Date.now() + 1800 };
  }

  onTouch(x, y) {
    const { state } = this;
    if (state.winner !== -1) {
      const restart = this.buttons.find((b) => b.id === 'restart');
      const home = this.buttons.find((b) => b.id === 'home');
      if (this.hit(restart, x, y)) {
        if (this.online) {
          this.againMe = true;
          if (this.againOp) {
            this.resetGame();
          } else {
            this.net.send({ t: 'again' });
            this.showToast('已发送再战请求，等待对方…');
          }
        } else {
          this.main.setScene(new GameScene(this.main));
        }
      } else if (this.hit(home, x, y)) {
        this.goHome();
      }
      return;
    }

    const back = this.buttons.find((b) => b.id === 'back');
    if (this.hit(back, x, y)) {
      this.goHome();
      return;
    }

    const resign = this.buttons.find((b) => b.id === 'resign');
    if (this.online && this.hit(resign, x, y)) {
      state.winner = 1 - this.myPos;
      this.net.send({ t: 'resign' });
      this.showToast('你已认输');
      return;
    }

    if (this.online && !this.myTurn()) {
      this.showToast('等待对方行动…');
      return;
    }

    const modeMove = this.buttons.find((b) => b.id === 'modeMove');
    const modeWall = this.buttons.find((b) => b.id === 'modeWall');
    if (this.hit(modeMove, x, y)) {
      this.mode = 'move';
      this.preview = null;
      return;
    }
    if (this.hit(modeWall, x, y)) {
      this.mode = 'wall';
      this.preview = null;
      return;
    }

    if (this.mode === 'wall') {
      const confirm = this.buttons.find((b) => b.id === 'confirm');
      const cancel = this.buttons.find((b) => b.id === 'cancel');
      if (this.hit(cancel, x, y)) {
        this.preview = null;
        return;
      }
      if (this.hit(confirm, x, y)) {
        if (!this.preview) {
          this.showToast('请先点棋盘空隙选择放墙位置');
          return;
        }
        const err = wallPlacementError(state, this.preview.orientation, this.preview.r, this.preview.c);
        if (err === 'overlap') {
          this.showToast('此处已有墙');
          return;
        }
        if (err === 'noPath') {
          this.showToast('放墙后须保证双方都能到达对面');
          return;
        }
        if (err) {
          this.showToast('不能放在这里');
          return;
        }
        if (state.wallsLeft[state.turn] <= 0) {
          this.showToast('墙已用完');
          return;
        }
        applyWall(state, state.turn, this.preview.orientation, this.preview.r, this.preview.c);
        if (this.online) {
          this.net.send({
            t: 'wall',
            o: this.preview.orientation,
            r: this.preview.r,
            c: this.preview.c,
          });
        }
        this.preview = null;
        return;
      }
      if (x >= X0 - 20 && x <= X0 + BOARD_W + 20 && y >= Y0 - 20 && y <= Y0 + BOARD_W + 20) {
        this.preview = this.nearestWallSlot(x, y);
      }
      return;
    }

    const moves = legalMoves(state, state.turn);
    for (let i = 0; i < moves.length; i += 1) {
      const m = moves[i];
      const cx = this.cellX(m.c) + CELL / 2;
      const cy = this.cellY(m.r) + CELL / 2;
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= (CELL / 2) * (CELL / 2)) {
        applyMove(state, state.turn, m);
        if (this.online) this.net.send({ t: 'move', r: m.r, c: m.c });
        return;
      }
    }
  }

  draw(ctx) {
    this.drawBackground(ctx);
    this.drawBoard(ctx);
    this.drawPlayers(ctx);
    this.drawControls(ctx);
    this.drawHint(ctx);
    if (this.state.winner !== -1) this.drawWin(ctx);
    if (this.disconnected) this.drawDisconnected(ctx);
    if (this.toast && Date.now() < this.toast.until) this.drawToast(ctx);
  }

  drawDisconnected(ctx) {
    ctx.fillStyle = 'rgba(229, 57, 53, 0.9)';
    this.roundRect(ctx, 225, 50, 300, 44, 22);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('连接中断，重连中…', W / 2, 73);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
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

    ctx.fillStyle = 'rgba(243, 229, 195, 0.05)';
    this.roundRect(ctx, X0 - 24, Y0 - 24, BOARD_W + 48, BOARD_W + 48, 18);
    ctx.fill();
  }

  drawBoard(ctx) {
    const { state } = this;
    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 9; c += 1) {
        if (r === GOAL_ROW[0]) {
          ctx.fillStyle = rgba(PLAYERS[0].color, 0.13);
        } else if (r === GOAL_ROW[1]) {
          ctx.fillStyle = rgba(PLAYERS[1].color, 0.13);
        } else {
          ctx.fillStyle = COLORS.cellFill;
        }
        this.roundRect(ctx, this.cellX(c), this.cellY(r), CELL, CELL, 10);
        ctx.fill();
        ctx.strokeStyle = COLORS.cellStroke;
        ctx.lineWidth = 1;
        this.roundRect(ctx, this.cellX(c), this.cellY(r), CELL, CELL, 10);
        ctx.stroke();
      }
    }

    if (this.mode === 'move' && state.winner === -1 && this.myTurn()) {
      const moves = legalMoves(state, state.turn);
      ctx.fillStyle = rgba(COLORS.gold, 0.22);
      for (const m of moves) {
        ctx.beginPath();
        ctx.arc(this.cellX(m.c) + CELL / 2, this.cellY(m.r) + CELL / 2, CELL / 2 - 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    state.hWalls.forEach((k) => {
      const [r, c] = k.split(',').map(Number);
      this.drawWall(ctx, 'h', r, c, 1);
    });
    state.vWalls.forEach((k) => {
      const [r, c] = k.split(',').map(Number);
      this.drawWall(ctx, 'v', r, c, 1);
    });

    if (this.preview && this.mode === 'wall') {
      const err = wallPlacementError(state, this.preview.orientation, this.preview.r, this.preview.c);
      this.drawWall(ctx, this.preview.orientation, this.preview.r, this.preview.c, err ? 0.4 : 0.75, err);
    }

    for (let p = 0; p < 2; p += 1) {
      const pawn = state.pawns[p];
      const cx = this.cellX(pawn.c) + CELL / 2;
      const cy = this.cellY(pawn.r) + CELL / 2;
      const color = PLAYERS[p].color;
      ctx.fillStyle = rgba(color, 0.3);
      ctx.beginPath();
      ctx.arc(cx, cy, 26, 0, Math.PI * 2);
      ctx.fill();
      const grad = ctx.createLinearGradient(cx - 18, cy - 18, cx + 18, cy + 18);
      grad.addColorStop(0, color);
      grad.addColorStop(1, rgba(color, 0.75));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 19, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(27, 16, 11, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 19, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawWall(ctx, orientation, r, c, alpha, err) {
    const len = 2 * CELL + GAP;
    let x;
    let y;
    let w;
    let h;
    if (orientation === 'h') {
      x = this.cellX(c);
      y = this.cellY(r) + CELL + (GAP - WALL_THICK) / 2;
      w = len;
      h = WALL_THICK;
    } else {
      x = this.cellX(c) + CELL + (GAP - WALL_THICK) / 2;
      y = this.cellY(r);
      w = WALL_THICK;
      h = len;
    }
    if (alpha < 1) {
      ctx.fillStyle = err ? rgba('#E53935', alpha) : rgba(COLORS.wall, alpha);
    } else {
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, COLORS.wall);
      grad.addColorStop(1, COLORS.wallDark);
      ctx.fillStyle = grad;
    }
    this.roundRect(ctx, x, y, w, h, 5);
    ctx.fill();
  }

  drawPlayers(ctx) {
    const { state } = this;
    for (let p = 0; p < 2; p += 1) {
      const isCurrent = state.turn === p && state.winner === -1;
      const y = p === 1 ? 110 : 896;
      const info = PLAYERS[p];
      ctx.fillStyle = isCurrent ? rgba(info.color, 0.18) : 'rgba(243, 229, 195, 0.05)';
      this.roundRect(ctx, 90, y, 570, 86, 16);
      ctx.fill();
      if (isCurrent) {
        ctx.strokeStyle = info.color;
        ctx.lineWidth = 2;
        this.roundRect(ctx, 90, y, 570, 86, 16);
        ctx.stroke();
      }
      ctx.fillStyle = info.color;
      ctx.beginPath();
      ctx.arc(142, y + 43, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.cream;
      ctx.textAlign = 'left';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText(this.names[p], 178, y + 40);
      ctx.font = '22px sans-serif';
      ctx.fillStyle = 'rgba(243, 229, 195, 0.7)';
      ctx.fillText(isCurrent ? '思考中…' : '等待对方', 178, y + 68);

      ctx.fillStyle = 'rgba(243, 229, 195, 0.6)';
      ctx.font = '22px sans-serif';
      ctx.fillText('剩余墙', 430, y + 36);
      for (let i = 0; i < WALLS_PER_PLAYER; i += 1) {
        ctx.fillStyle = i < state.wallsLeft[p] ? COLORS.wall : 'rgba(243, 229, 195, 0.15)';
        this.roundRect(ctx, 430 + (i % 5) * 42, y + 48 + Math.floor(i / 5) * 18, 32, 10, 4);
        ctx.fill();
      }
      ctx.textAlign = 'left';
    }

    ctx.textAlign = 'center';
    if (state.winner === -1) {
      const info = PLAYERS[state.turn];
      ctx.fillStyle = info.color;
      ctx.font = 'bold 34px sans-serif';
      if (this.online) {
        ctx.fillText(this.myTurn() ? '轮到你了' : '等待对方…', W / 2, 232);
      } else {
        ctx.fillText(`${info.name}行动`, W / 2, 232);
      }
    } else {
      ctx.fillStyle = 'rgba(243, 229, 195, 0.6)';
      ctx.font = 'bold 34px sans-serif';
      ctx.fillText('对局结束', W / 2, 232);
    }
    ctx.textAlign = 'left';
  }

  drawControls(ctx) {
    const { state } = this;
    const showActions = this.mode === 'wall' && state.winner === -1;
    const ids = ['modeMove', 'modeWall', 'confirm', 'cancel'];
    for (const id of ids) {
      const btn = this.buttons.find((b) => b.id === id);
      if ((id === 'confirm' || id === 'cancel') && !showActions) continue;
      const active = (id === 'modeMove' && this.mode === 'move')
        || (id === 'modeWall' && this.mode === 'wall');
      if (active) {
        const grad = ctx.createLinearGradient(0, btn.y, 0, btn.y + btn.h);
        grad.addColorStop(0, COLORS.gold);
        grad.addColorStop(1, COLORS.goldDark);
        ctx.fillStyle = grad;
      } else if (id === 'confirm') {
        const err = this.preview
          ? wallPlacementError(state, this.preview.orientation, this.preview.r, this.preview.c) : 'none';
        ctx.fillStyle = err ? 'rgba(243, 229, 195, 0.08)' : rgba(COLORS.wall, 0.85);
        btn.enabled = !err;
      } else {
        ctx.fillStyle = 'rgba(243, 229, 195, 0.08)';
      }
      this.roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 36);
      ctx.fill();
      if (!active && id !== 'confirm') {
        ctx.strokeStyle = rgba(COLORS.gold, 0.55);
        ctx.lineWidth = 2;
        this.roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 36);
        ctx.stroke();
      }
      if (id === 'confirm') {
        ctx.fillStyle = btn.enabled ? COLORS.btnText : rgba(COLORS.gold, 0.45);
      } else {
        ctx.fillStyle = active ? COLORS.btnText : COLORS.gold;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 2);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    const back = this.buttons.find((b) => b.id === 'back');
    ctx.fillStyle = 'rgba(243, 229, 195, 0.08)';
    this.roundRect(ctx, back.x, back.y, back.w, back.h, 28);
    ctx.fill();
    ctx.strokeStyle = rgba(COLORS.gold, 0.55);
    ctx.lineWidth = 2;
    this.roundRect(ctx, back.x, back.y, back.w, back.h, 28);
    ctx.stroke();
    ctx.fillStyle = COLORS.gold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(back.label, back.x + back.w / 2, back.y + back.h / 2 + 1);

    if (this.online && this.state.winner === -1) {
      const resign = this.buttons.find((b) => b.id === 'resign');
      ctx.fillStyle = 'rgba(229, 57, 53, 0.18)';
      this.roundRect(ctx, resign.x, resign.y, resign.w, resign.h, 28);
      ctx.fill();
      ctx.strokeStyle = rgba('#E53935', 0.65);
      this.roundRect(ctx, resign.x, resign.y, resign.w, resign.h, 28);
      ctx.stroke();
      ctx.fillStyle = '#FF8A80';
      ctx.fillText(resign.label, resign.x + resign.w / 2, resign.y + resign.h / 2 + 1);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  drawHint(ctx) {
    if (this.state.winner !== -1) return;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(243, 229, 195, 0.55)';
    ctx.font = '24px sans-serif';
    if (this.online && !this.myTurn()) {
      ctx.fillText('等待对方行动…', W / 2, 1215);
    } else if (this.mode === 'wall') {
      ctx.fillText(this.preview ? '确认放置，或点其它空隙换位置' : '点棋盘空隙预览放墙位置', W / 2, 1215);
    } else {
      ctx.fillText('点发光格子移动棋子（可跳过对方）', W / 2, 1215);
    }
    ctx.textAlign = 'left';
  }

  drawToast(ctx) {
    const text = this.toast.text;
    ctx.font = '26px sans-serif';
    const w = 100 + ctx.measureText(text).width;
    const x = (W - w) / 2;
    const y = 530;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
    this.roundRect(ctx, x, y, w, 64, 32);
    ctx.fill();
    ctx.fillStyle = '#FFD7C2';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, y + 33);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  drawWin(ctx) {
    const winner = PLAYERS[this.state.winner];
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(0, 0, W, H);

    const px = 97;
    const py = 520;
    const pw = 556;
    const ph = 540;
    ctx.fillStyle = COLORS.panel;
    this.roundRect(ctx, px, py, pw, ph, 20);
    ctx.fill();
    ctx.strokeStyle = winner.color;
    ctx.lineWidth = 2;
    this.roundRect(ctx, px, py, pw, ph, 20);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = winner.color;
    ctx.beginPath();
    ctx.arc(W / 2, py + 95, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText(`${winner.name}获胜！`, W / 2, py + 185);
    ctx.fillStyle = COLORS.cream;
    ctx.font = '28px sans-serif';
    let sub = '棋子到达对面底线';
    if (this.online) {
      if (this.againOp && !this.againMe) sub = '对方同意再来一局，点下方按钮开始';
      else if (this.againMe && !this.againOp) sub = '等待对方同意再来一局…';
    }
    ctx.fillText(sub, W / 2, py + 240);

    for (const id of ['restart', 'home']) {
      const btn = this.buttons.find((b) => b.id === id);
      if (id === 'restart') {
        const grad = ctx.createLinearGradient(0, btn.y, 0, btn.y + btn.h);
        grad.addColorStop(0, COLORS.gold);
        grad.addColorStop(1, COLORS.goldDark);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = 'rgba(243, 229, 195, 0.08)';
      }
      this.roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 48);
      ctx.fill();
      if (id === 'home') {
        ctx.strokeStyle = COLORS.gold;
        ctx.lineWidth = 2;
        this.roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 48);
        ctx.stroke();
      }
      ctx.fillStyle = id === 'restart' ? COLORS.btnText : COLORS.gold;
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 2);
      ctx.textBaseline = 'alphabetic';
    }
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
