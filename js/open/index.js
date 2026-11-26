const gsm = wx.getGameServerManager();
const sharedCanvas = wx.getSharedCanvas();
const ctx = sharedCanvas.getContext('2d');

const W = 560;
const H = 620;
const ROWS = 6;

let ratio = 1;
let friends = [];
let loading = false;
let errorMsg = '';
let invitedOpenId = '';

function font(size, bold) {
  ctx.font = `${bold ? 'bold ' : ''}${Math.round(size * ratio)}px sans-serif`;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function buttonRect(i) {
  const rowH = H / ROWS;
  return {
    x: W - 170,
    y: i * rowH + rowH * 0.26,
    w: 140,
    h: rowH * 0.48,
  };
}

function draw() {
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#241610';
  ctx.fillRect(0, 0, W, H);

  if (loading || errorMsg || friends.length === 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = errorMsg ? '#FFB4A2' : 'rgba(243, 229, 195, 0.75)';
    font(30);
    const text = errorMsg || (loading ? '加载好友中…' : '暂无可邀请的好友');
    ctx.fillText(text, W / 2, H / 2 - 16);
    ctx.fillStyle = 'rgba(243, 229, 195, 0.45)';
    font(22);
    ctx.fillText('仅显示最近玩过该游戏的在线好友', W / 2, H / 2 + 34);
    return;
  }

  const rowH = H / ROWS;
  for (let i = 0; i < Math.min(ROWS, friends.length); i += 1) {
    const f = friends[i];
    const y = i * rowH;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(243, 229, 195, 0.05)' : 'rgba(243, 229, 195, 0.02)';
    ctx.fillRect(0, y, W, rowH);

    const cy = y + rowH / 2;
    const online = f.sysState === 1;
    ctx.fillStyle = online ? 'rgba(67, 160, 71, 0.85)' : 'rgba(243, 229, 195, 0.25)';
    ctx.beginPath();
    ctx.arc(46, cy, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#241610';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    font(26, true);
    const name = f.nickName || '好友';
    ctx.fillText(name.slice(0, 1), 46, cy + 2);
    ctx.textBaseline = 'alphabetic';

    ctx.textAlign = 'left';
    ctx.fillStyle = '#F3E5C3';
    font(27);
    ctx.fillText(name.slice(0, 8), 88, cy - 2);
    ctx.fillStyle = online ? 'rgba(67, 160, 71, 0.95)' : 'rgba(243, 229, 195, 0.45)';
    font(21);
    ctx.fillText(online ? '在线' : '离线', 88, cy + 30);

    const b = buttonRect(i);
    const isInvited = invitedOpenId === f.openId;
    roundRect(b.x, b.y, b.w, b.h, b.h / 2);
    ctx.fillStyle = isInvited ? 'rgba(67, 160, 71, 0.85)' : 'rgba(242, 193, 78, 0.92)';
    ctx.fill();
    ctx.fillStyle = '#2B1B12';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    font(23, true);
    ctx.fillText(isInvited ? '已邀请' : '邀请', b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  if (friends.length > ROWS) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(243, 229, 195, 0.4)';
    font(20);
    ctx.fillText(`共 ${friends.length} 位好友，仅显示前 ${ROWS} 位`, W / 2, H - 12);
    ctx.textAlign = 'left';
  }
}

function loadFriends() {
  loading = true;
  errorMsg = '';
  draw();
  gsm.getFriendsStateData({
    success: (res) => {
      const list = (res && res.list) || [];
      friends = list.slice().sort((a, b) => (b.sysState || 0) - (a.sysState || 0));
      loading = false;
      draw();
    },
    fail: () => {
      loading = false;
      errorMsg = '获取好友失败，请允许好友互动授权';
      draw();
    },
  });
}

wx.onMessage((data) => {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'show') {
    if (typeof data.ratio === 'number' && data.ratio > 0) ratio = data.ratio;
    loadFriends();
  } else if (data.type === 'hide') {
    friends = [];
    invitedOpenId = '';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, sharedCanvas.width, sharedCanvas.height);
  } else if (data.type === 'tap') {
    const x = data.x;
    const y = data.y;
    const count = Math.min(ROWS, friends.length);
    for (let i = 0; i < count; i += 1) {
      const b = buttonRect(i);
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        const f = friends[i];
        if (f && f.openId && gsm.inviteFriend) {
          try {
            gsm.inviteFriend({ openId: f.openId });
            invitedOpenId = f.openId;
          } catch (e) {
            errorMsg = '邀请发送失败';
          }
          draw();
        }
        return;
      }
    }
  }
});
