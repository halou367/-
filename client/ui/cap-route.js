// Split-tunnel routing rule for third-party static and authentication endpoints.
// Persisted via Host.shared('caproute') and applied by the native routing layer.
const CapRoute = {
  async get() { try { const v = await Host.shared('caproute'); return typeof v === 'string' ? v : ''; } catch { return ''; } },
  // 保存；返回 true，或抛出带原因的错误
  async set(v) {
    let r; try { r = await Host.shared('caproute', v || null); } catch (e) { throw Error('保存失败：' + (e?.message || e)); }
    if (r?.error) throw Error(r.error);
    if (r !== true) throw Error('当前客户端版本不支持验证码专用线路，请先更新客户端');
    return true;
  },
  label(v) { return !v ? '跟随账号线路' : v === 'local' ? '本机网络' : '备用代理'; },
  // 弹出选择框。返回 Promise<boolean>：true = 已保存新线路（调用方应重试），false = 取消 / 没改
  offer(reason) {
    return new Promise(async resolve => {
      const cur = await this.get(), isProxy = cur && cur !== 'local';
      const back = h('div', { class: 'modal-back rc-route-back', 'data-noghost': '1', style: { zIndex: 2147483647 } });
      const mk = (val, title, sub) => { const r = h('input', { type: 'radio', name: 'caproute', value: val }); return { r, el: h('label', { class: 'rr-opt' }, r, h('span', {}, h('b', {}, title), h('small', { class: 'dim' }, sub))) }; };
      const o0 = mk('', '跟随账号线路（默认）', '验证码和 Brana 走同一条线路'), o1 = mk('local', '本机网络', '只让 Google 验证码直连；手机 / 电脑已开全局 VPN 或 TUN 时可用'), o2 = mk('proxy', '备用代理', '只让 Google 验证码走这个 HTTP / SOCKS 代理');
      const inp = h('input', { type: 'text', placeholder: 'http://127.0.0.1:7890 或 socks5://用户:密码@主机:端口', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', value: isProxy ? cur : '' });
      (cur === 'local' ? o1 : isProxy ? o2 : o0).r.checked = true;
      const msg = h('div', { class: 'lmsg' });
      const close = ok => { back.remove(); resolve(ok); };
      const save = h('button', { class: 'btn', onclick: async () => {
        const v = [o0, o1, o2].find(o => o.r.checked).r.value, val = v === 'proxy' ? inp.value.trim() : v;
        if (v === 'proxy' && !val) { msg.textContent = '请填写备用代理地址'; msg.className = 'lmsg bad'; return; }
        if (val === cur) return close(false);
        save.disabled = true; msg.className = 'lmsg'; msg.textContent = '正在应用…';
        try { await this.set(val); toast('验证码线路：' + this.label(val)); close(true); }
        catch (e) { msg.textContent = describe(e); msg.className = 'lmsg bad'; save.disabled = false; }
      } }, '保存并重试');
      back.append(h('div', { class: 'modal small' },
        h('div', { class: 'modal-h' }, '人机验证连不上 Google'),
        h('div', { class: 'modal-b' },
          h('p', { class: 'muted' }, '当前账号线路（节点 + ProxyIP）连不上 Google 验证码。ProxyIP 通常只能中转 Cloudflare 托管的网站（Brana 是），Google 不是。可以只让 google.com、gstatic.com、recaptcha.net 等域名改走下面的线路，arena.ai 和其他请求不变。'),
          reason ? h('p', { class: 'dim' }, String(reason.message || reason)) : null,
          o0.el, o1.el, o2.el, inp,
          h('p', { class: 'dim' }, '注意：验证码和 Brana 会从不同的 IP 出去，只在需要手动验证时用，用完可以改回默认。仅对「节点」线路的账号生效；代理 / 直连账号的验证码本来就走各自的线路。'), msg),
        h('div', { class: 'modal-f' }, h('button', { class: 'btn ghost', onclick: () => close(false) }, '取消'), h('span', { class: 'grow' }), save)));
      document.body.append(back);
    });
  },
};
