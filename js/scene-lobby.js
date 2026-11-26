import GameScene from './scene-game';
import StartScene from './scene-start';

const W = 750;
const H = 1334;

const SC_W = 560;
const SC_H = 620;
const SC_X = 95;
const SC_Y = 350;

const COLORS = {
  bgTop: '#2E1D12',
  bgBottom: '#1B100B',
  frame: '#8B5E34',
  gold: '#F2C14E',
  goldDark: '#B8860B',
  cream: '#F3E5C3',
  red: '#E53935',
  green: '#43A047',
  btnText: '#2B1B12',
  panel: 'rgba(43, 27, 18, 0.96)',
};

function rgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default class LobbyScene {
  constructor(main, joinAccessInfo) {
    this.main = main;
    this.net = main.net;
    this.phase = 'connecting';
    this.errorMsg = '';
    this.toast = null;
    this.overlay = false;
    this.members = [];
    this.names = ['红方', '绿方'];
    this.reconnecting = false;

    const ratio = main.pixelRatio || 1;
    this.sharedCanvas = null;
    try {
      const od = wx.getOpenDataContext();
      this.od = od;
      this.sharedCanvas = od.canvas;
      this.sharedCanvas.width = Math.round(SC_W * ratio);
      this.sharedCanvas.height = Math.round(SC_H * ratio);
    } catch (e) {
      this.od = null;
    }

    this.offRoom = this.net.on('room', (info) => this.onRoom(info));
    this.offMsg = this.net.on('msg', (m) => this.onMsg(m));
    this.offDisc = this.net.on('disconnect', () => this.onDisconnect());
    this.offKicked = this.net.on('kicked', () => this.fail('你已被移出房间'));
    this.offLogout = this.net.on('logout', () => this.fail('登录已失效，请重启小游戏'));

    if (joinAccessInfo) {
      this.phase = 'joining';
      this.net.joinRoom(joinAccessInfo, (ok, err) => {
        if (!ok) this.fail(err || '加入房间失败');
      });
    } else {
      this.phase = 'creating';
      this.net.createRoom((ok, err) => {
        if (!ok) {
          this.fail(err || '创建房间失败');
          return;
        }
        this.phase = 'wait-join';
      });
    }
  }

  dispose() {
    this.net.off('room', this.offRoom);
    this.net.off('msg', this.offMsg);
    this.net.off('disconnect', this.offDisc);
    this.net.off('kicked', this.offKicked);
    this.net.off('logout', this.offLogout);
    if (this.od && this.overlay) {
      try {
        this.od.postMessage({ type: 'hide' });
      } catch (e) {
        // ignore
      }
    }
  }

  fail(msg) {
    this.phase = 'error';
    this.errorMsg = msg;
    this.overlay = false;
  }

  showToast(text) {
    this.toast = { text, until: Date.now() + 1800 };
  }

  onRoom(info) {
    if (!info || !info.memberList) return;
    this.members = info.memberList;
    const me = this.findMe();
    const mine = me ? me.posNum : this.net.myPos;
    for (let i = 0; i < this.members.length; i += 1) {
      const m = this.members[i];
      const label = m.nickname || (m.posNum === 0 ? '红方' : '绿方');
      if (m.posNum === mine) {
        this.names[m.posNum] = `${label}(我)`;
      } else {
        this.names[m.posNum] = label;
      }
    }
    const full = this.members.length >= 2;
    if (this.net.isHost) {
      this.phase = full ? 'ready' : 'wait-join';
    } else if (this.phase !== 'error') {
      this.phase = 'wait-start';
      if (!full) this.showToast('对方已离开房间');
    }
  }

  findMe() {
    for (let i = 0; i < this.members.length; i += 1) {
      const m = this.members[i];
      if (m.memberExtInfo && m.memberExtInfo === this.net.myToken) return m;
    }
    for (let i = 0; i < this.members.length; i += 1) {
      const m = this.members[i];
      if (m.posNum === this.net.myPos) return m;
    }
    return null;
  }

  onMsg(m) {
    if (m.t === 'start' && !this.net.isHost) {
      this.enterGame();
    } else if (m.t === 'bye') {
      this.showToast('对方已离开房间');
    }
  }

  onDisconnect() {
    if (this.reconnecting) return;
    this.reconnecting = true;
    this.showToast('连接中断，重连中…');
    this.net.reconnect((ok) => {
      this.reconnecting = false;
      if (ok) {
        this.showToast('已重新连接');
      } else {
        this.showToast('重连失败，请返回重试');
      }
    });
  }

  enterGame() {
    this.main.setScene(new GameScene(this.main, {
      online: true,
      myPos: this.net.myPos,
      names: this.names,
    }));
  }

  share() {
    const ai = this.net.accessInfo;
    if (!ai) return;
    const query = `accessInfo=${encodeURIComponent(ai)}`;
    if (wx.shareAppMessage) {
      wx.shareAppMessage({ title: '路障对战 · 邀你来一局', query });
    } else {
      this.showToast('请点右上角菜单转发给好友');
    }
  }

  openInvite() {
    if (!this.od) {
      this.showToast('当前环境不支持好友邀请');
      return;
    }
    this.overlay = true;
    try {
      this.od.postMessage({ type: 'show', ratio: this.main.pixelRatio || 1 });
    } catch (e) {
      this.overlay = false;
      this.showToast('好友列表加载失败');
    }
  }

  currentButtons() {
    const base = { x: 147, w: 456, h: 100 };
    if (this.phase === 'creating' || this.phase === 'joining') {
      return [{ id: 'back', ...base, y: 900, label: '返回' }];
    }
    if (this.phase === 'error') {
      return [{ id: 'back', ...base, y: 900, label: '返回主页' }];
    }
    if (this.phase === 'ready') {
      return [
        { id: 'startGame', ...base, y: 730, h: 112, label: '开始对战' },
        { id: 'share', ...base, y: 872, label: '分享邀请' },
        { id: 'leave', ...base, y: 1000, label: '离开房间' },
      ];
    }
    if (this.phase === 'wait-start') {
      return [
        { id: 'noop', ...base, y: 730, h: 112, label: '等待房主开始…', disabled: true },
        { id: 'leave', ...base, y: 872, label: '离开房间' },
      ];
    }
    return [
      { id: 'share', ...base, y: 730, label: '分享邀请' },
      { id: 'invite', ...base, y: 858, label: '好友邀请' },
      { id: 'leave', ...base, y: 986, label: '离开房间' },
    ];
  }

  onTouch(x, y) {
    if (this.overlay) {
      const close = { x: 250, y: 1000, w: 250, h: 72 };
      if (x >= close.x && x <= close.x + close.w && y >= close.y && y <= close.y + close.h) {
        this.overlay = false;
        try {
          this.od.postMessage({ type: 'hide' });
        } catch (e) {
          // ignore
        }
        return;
      }
      if (this.sharedCanvas
        && x >= SC_X && x <= SC_X + SC_W && y >= SC_Y && y <= SC_Y + SC_H) {
        try {
          this.od.postMessage({ type: 'tap', x: x - SC_X, y: y - SC_Y });
        } catch (e) {
          // ignore
        }
      }
      return;
    }

    const buttons = this.currentButtons();
    for (let i = 0; i < buttons.length; i += 1) {
      const btn = buttons[i];
      if (btn.disabled) return;
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        if (btn.id === 'back' || btn.id === 'leave') {
          if (btn.id === 'leave') this.net.leaveRoom();
          this.main.setScene(new StartScene(this.main));
        } else if (btn.id === 'share') {
          this.share();
        } else if (btn.id === 'invite') {
          this.openInvite();
        } else if (btn.id === 'startGame') {
          this.net.send({ t: 'start' });
          this.enterGame();
        }
        return;
      }
    }
  }

  draw(ctx) {
    this.drawBackground(ctx);
    this.drawTitle(ctx);
    this.drawPlayers(ctx);
    this.drawStatus(ctx);
    this.drawButtons(ctx);
    this.drawFooter(ctx);
    if (this.overlay) this.drawInviteOverlay(ctx);
    if (this.toast && Date.now() < this.toast.until) this.drawToast(ctx);
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
    ctx.font = 'bold 84px sans-serif';
    ctx.fillText('联机对战', W / 2, 205);
    ctx.fillStyle = 'rgba(243, 229, 195, 0.75)';
    ctx.font = '28px sans-serif';
    ctx.fillText('创建房间，邀请好友来一局', W / 2, 262);
    ctx.textAlign = 'left';
  }

  drawPlayers(ctx) {
    const slots = [
      { y: 320, pos: 0 },
      { y: 480, pos: 1 },
    ];
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      let member = null;
      for (let j = 0; j < this.members.length; j += 1) {
        if (this.members[j].posNum === slot.pos) member = this.members[j];
      }
      const color = slot.pos === 0 ? COLORS.red : COLORS.green;
      ctx.fillStyle = member ? rgba(color, 0.16) : 'rgba(243, 229, 195, 0.05)';
      this.roundRect(ctx, 90, slot.y, 570, 120, 18);
      ctx.fill();
      if (member) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        this.roundRect(ctx, 90, slot.y, 570, 120, 18);
        ctx.stroke();
      }
      ctx.fillStyle = member ? color : 'rgba(243, 229, 195, 0.2)';
      ctx.beginPath();
      ctx.arc(152, slot.y + 60, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = member ? COLORS.btnText : 'rgba(243, 229, 195, 0.5)';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(member ? (slot.pos === 0 ? '红' : '绿') : '?', 152, slot.y + 70);

      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.cream;
      ctx.font = 'bold 32px sans-serif';
      const name = member
        ? this.names[slot.pos]
        : (slot.pos === 0 ? '红方（房主）' : '绿方（对手）');
      ctx.fillText(name, 210, slot.y + 52);
      ctx.font = '24px sans-serif';
      ctx.fillStyle = 'rgba(243, 229, 195, 0.65)';
      const sub = member
        ? (member.isReady ? '已准备' : (member.role === 1 ? '房主' : '已加入'))
        : '等待加入…';
      ctx.fillText(sub, 210, slot.y + 90);
      ctx.textAlign = 'left';
    }
  }

  drawStatus(ctx) {
    let text = '';
    if (this.phase === 'creating') text = '正在创建房间…';
    else if (this.phase === 'joining') text = '正在加入房间…';
    else if (this.phase === 'error') text = this.errorMsg;
    else if (this.phase === 'ready') text = '双方已就位，房主可开始对战';
    else if (this.phase === 'wait-start') text = '已就位，等待房主开始…';
    else text = '房间已创建，分享给好友或直接邀请';
    ctx.textAlign = 'center';
    ctx.fillStyle = this.phase === 'error' ? '#FFB4A2' : 'rgba(243, 229, 195, 0.8)';
    ctx.font = '26px sans-serif';
    ctx.fillText(text, W / 2, 668);
    if (this.net.accessInfo && this.phase !== 'error') {
      ctx.fillStyle = 'rgba(243, 229, 195, 0.45)';
      ctx.font = '21px sans-serif';
      ctx.fillText('通过分享卡片进入的好友会自动加入本房间', W / 2, 706);
    }
    ctx.textAlign = 'left';
  }

  drawButtons(ctx) {
    const buttons = this.currentButtons();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < buttons.length; i += 1) {
      const btn = buttons[i];
      const primary = btn.id === 'startGame' || btn.id === 'share';
      if (btn.disabled) {
        ctx.fillStyle = 'rgba(243, 229, 195, 0.08)';
      } else if (primary) {
        const grad = ctx.createLinearGradient(0, btn.y, 0, btn.y + btn.h);
        grad.addColorStop(0, COLORS.gold);
        grad.addColorStop(1, COLORS.goldDark);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = 'rgba(243, 229, 195, 0.08)';
      }
      this.roundRect(ctx, btn.x, btn.y, btn.w, btn.h, btn.h / 2);
      ctx.fill();
      if (!primary) {
        ctx.strokeStyle = btn.disabled ? 'rgba(243, 229, 195, 0.25)' : COLORS.gold;
        ctx.lineWidth = 2;
        this.roundRect(ctx, btn.x, btn.y, btn.w, btn.h, btn.h / 2);
        ctx.stroke();
      }
      ctx.fillStyle = btn.disabled
        ? 'rgba(243, 229, 195, 0.45)'
        : (primary ? COLORS.btnText : COLORS.gold);
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 2);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  drawFooter(ctx) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(243, 229, 195, 0.5)';
    ctx.font = '22px sans-serif';
    ctx.fillText('对局中断线会自动重连 · 房间 2 小时无活动自动销毁', W / 2, 1245);
    ctx.textAlign = 'left';
  }

  drawInviteOverlay(ctx) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(0, 0, W, H);
    const px = 75;
    const py = 250;
    const pw = 600;
    const ph = 850;
    ctx.fillStyle = COLORS.panel;
    this.roundRect(ctx, px, py, pw, ph, 20);
    ctx.fill();
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 2;
    this.roundRect(ctx, px, py, pw, ph, 20);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 42px sans-serif';
    ctx.fillText('邀请好友', W / 2, py + 68);

    if (this.sharedCanvas) {
      ctx.fillStyle = 'rgba(243, 229, 195, 0.06)';
      this.roundRect(ctx, SC_X, SC_Y, SC_W, SC_H, 12);
      ctx.fill();
      ctx.drawImage(this.sharedCanvas, SC_X, SC_Y, SC_W, SC_H);
      ctx.strokeStyle = 'rgba(243, 229, 195, 0.25)';
      ctx.lineWidth = 1;
      this.roundRect(ctx, SC_X, SC_Y, SC_W, SC_H, 12);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(243, 229, 195, 0.7)';
      ctx.font = '26px sans-serif';
      ctx.fillText('当前环境不支持好友列表', W / 2, SC_Y + 120);
    }

    const close = { x: 250, y: 1000, w: 250, h: 72 };
    ctx.fillStyle = 'rgba(243, 229, 195, 0.08)';
    this.roundRect(ctx, close.x, close.y, close.w, close.h, 36);
    ctx.fill();
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 2;
    this.roundRect(ctx, close.x, close.y, close.w, close.h, 36);
    ctx.stroke();
    ctx.fillStyle = COLORS.gold;
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('关 闭', close.x + close.w / 2, close.y + close.h / 2 + 2);
    ctx.textBaseline = 'alphabetic';
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
