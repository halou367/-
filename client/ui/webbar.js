// Brana AI 网页浏览条：客户端界面以外的网页（Brana 官网、邮箱、外部登录页）顶部 / 底部的简易浏览器工具栏
// 后退 / 前进 / 刷新 / 地址栏 / 返回客户端；纯页面脚本，不走宿主接口，在哪个账号窗口里就用哪个账号的环境（IP、指纹、WebRTC 保护）。
// 桌面端：贴着窗口顶部（标题栏位置）；安卓：贴着底部，拇指够得着。宿主在注入前设置 window.__ancBarPos / __ancBarPad。
(() => {
  const HOME = 'https://arena.ai/robots.txt';
  // 只接受 https 的公网网址；没写协议就补 https://，不接受 javascript: / file: / 本机地址
  const norm = raw => {
    let s = String(raw || '').trim();
    if (!s || /\s/.test(s)) return null;
    if (/^https?:\/\//i.test(s)) s = s.replace(/^http:/i, 'https:');
    else if (/^[a-z][a-z0-9+.\-]*:/i.test(s) && !/^[\w.\-]+:\d+(\/|$)/.test(s)) return null;
    else s = 'https://' + s.replace(/^\/+/, '');
    try {
      const u = new URL(s);
      const hn = u.hostname.toLowerCase();
      const priv = /^(10|127|0)\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(hn) || /(^|\.)(localhost|local|internal|lan)$/.test(hn);
      if (u.protocol !== 'https:' || !hn.includes('.') || priv) return null;
      return u.href;
    } catch { return null; }
  };
  if (typeof window === 'undefined') { if (typeof module === 'object' && module.exports) module.exports = { norm }; return; }
  if (window.__ancWebbar || window.top !== window) return;
  window.__ancWebbar = true;
  const bottom = window.__ancBarPos === 'bottom';
  const pad = Array.isArray(window.__ancBarPad) ? window.__ancBarPad : [0, 0];
  const H = bottom ? 48 : 40;
  // 电脑端宿主会传入客户端当前的配色（__ancBarTheme，和窗口右上角系统「最小化 / 最大化 / 关闭」按钮的底色同一个）：
  // 浏览条用同一个底色，右上角三个窗口按钮和浏览条连成一条，不会出现一块颜色不一样的方块
  const T = window.__ancBarTheme && /^#[0-9a-f]{3,8}$/i.test(window.__ancBarTheme.color || '') ? window.__ancBarTheme : null;
  const dark = T ? !!T.dark : matchMedia('(prefers-color-scheme: dark)').matches;
  const C = T ? { bg: T.color, fg: T.symbolColor || (dark ? '#ecebe8' : '#1f1e1c'), line: dark ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.10)', field: dark ? 'rgba(255,255,255,.06)' : '#fff', hov: dark ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.07)' }
    : dark ? { bg: '#1f1e1c', fg: '#ecebe8', line: '#33312d', field: '#252422', hov: 'rgba(255,255,255,.08)' }
    : { bg: '#faf9f7', fg: '#1f1e1c', line: '#e6e4de', field: '#ffffff', hov: 'rgba(31,30,28,.06)' };
  window.__ancBarColors = { ...C, dark };   // 浏览器模式底部的客户端信息条用同一套颜色
  const host = document.createElement('div');
  host.id = '__anc_webbar';
  const root = host.attachShadow({ mode: 'closed' });
  // 安卓页面铺满状态栏：顶部工具栏要让出状态栏高度（--sa-top 由宿主设置；电脑上没有就是 0）
  const sa = bottom ? 'calc(var(--sa-bottom,0px))' : 'var(--sa-top,0px)';
  // 样式 / 节点都用 DOM 接口和构造样式表，不拼 HTML 字符串：外部页面（Google 等）的 CSP / Trusted Types 会拦
  const CSSTXT = `
    :host{all:initial}
    .bar{position:fixed;left:0;right:0;${bottom ? 'bottom:0' : 'top:0'};height:calc(${H}px + ${sa});box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr) minmax(140px,42%) minmax(0,1fr);align-items:center;gap:20px;
      padding:${bottom ? '0' : sa} ${6 + pad[1]}px ${bottom ? sa : '0'} ${6 + pad[0]}px;background:${C.bg};color:${C.fg};${bottom ? 'border-top' : 'border-bottom'}:1px solid ${C.line};
      font:13px system-ui,-apple-system,'Segoe UI',sans-serif;z-index:2147483647;-webkit-app-region:drag;user-select:none}
    *{scrollbar-width:none!important}*::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}
    button,input{-webkit-app-region:no-drag;font:inherit;color:inherit}
    button{width:30px;height:30px;flex:none;border:0;border-radius:8px;background:transparent;cursor:pointer;font-size:16px;line-height:30px;padding:0}
    button:hover{background:${C.hov}} button:disabled{opacity:.35;cursor:default}
    button.logo{width:auto;height:30px;padding:0 8px;margin-right:4px;border-radius:8px;color:inherit;display:flex;align-items:center}
    button.logo svg{height:19px;width:auto;display:block}
    button.logo:hover{background:${C.hov}}
    input{width:100%;min-width:0;height:30px;box-sizing:border-box;border:1px solid ${C.line};border-radius:15px;background:${C.field};padding:0 14px;outline:none;font-size:13px}
    input:focus{border-color:${dark ? '#d8d3ca' : '#8c7664'}}
    button svg.wb-ic{width:17px;height:17px;display:block;margin:0 auto;stroke:currentColor;fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
    .wb-loader{position:fixed;top:calc(${H}px + ${sa});left:0;right:0;bottom:var(--anc-foot,0px);background:${C.bg};color:${C.fg};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:2147483645;transition:opacity .22s ease;-webkit-app-region:no-drag}
    .wb-loader[hidden]{display:none!important}
    .wb-loader.fade{opacity:0;pointer-events:none}
    .wb-spin{width:34px;height:34px;border-radius:50%;border:2.5px solid ${C.line};border-top-color:${dark ? '#d8d3ca' : '#8c7664'};animation:wbrot .75s linear infinite}
    .wb-title{font-size:13.5px;font-weight:700;color:${C.fg}}
    .wb-sub{font-size:12px;color:${dark ? '#b9b6af' : '#5f5c56'}}
    .wb-bar{width:176px;height:3px;border-radius:999px;background:${C.line};overflow:hidden;position:relative}
    .wb-bar-in{position:absolute;inset:0;width:45%;border-radius:999px;background:${dark ? '#d8d3ca' : '#8c7664'};animation:wbslide 1.1s ease-in-out infinite}
    .wb-dl-toast{position:fixed;${bottom ? 'bottom' : 'top'}:calc(${H + 8}px + ${sa});right:${10 + pad[1]}px;max-width:min(360px,calc(100vw - 24px));padding:8px 14px;border-radius:10px;background:${C.bg};color:${C.fg};border:1px solid ${C.line};box-shadow:0 6px 24px rgba(0,0,0,.22);font:600 12.5px/1.4 system-ui,sans-serif;z-index:2147483647;cursor:pointer;display:flex;align-items:center;gap:8px;-webkit-app-region:no-drag}
    .wb-dl-toast[hidden]{display:none!important}
    .wb-dl-toast small{font-weight:400;opacity:.75;white-space:nowrap}
    @keyframes wbrot{to{transform:rotate(360deg)}}
    @keyframes wbslide{0%{transform:translateX(-100%)}100%{transform:translateX(230%)}}
    input.bad{border-color:#e5484d}
    .bar-left,.bar-right{display:flex;align-items:center;gap:4px;min-width:0}.bar-right{justify-content:flex-end}
    .address-wrap{width:100%;max-width:520px;justify-self:center;padding:5px 0;-webkit-app-region:drag}
    @media(max-width:1050px){.bar{display:flex;gap:6px}.address-wrap{flex:1;min-width:80px;margin:0 12px}.bar-left,.bar-right{flex:none}.bar .ext-pins{max-width:64px}}
    @media(max-width:540px){.bar{gap:2px}.bar button.logo{padding:0 3px;margin:0}.bar button.logo svg{height:15px}.bar .fwd{display:none}.address-wrap{margin:0 4px}.bar button{width:26px}}

  `;
  const sheet = new CSSStyleSheet(); sheet.replaceSync(CSSTXT); root.adoptedStyleSheets = [sheet];
  const mk = (tag, cls, props) => { const e = document.createElement(tag); if (cls) e.className = cls; return Object.assign(e, props || {}); };
  const bar = mk('div', 'bar');
  const btn = (cls, text, title, extra) => { const b = mk('button', cls, { textContent: text, title, type: 'button' }); b.setAttribute('aria-label', title); return b; };
  const input = mk('input', '', { type: 'text', spellcheck: false, autocomplete: 'off', placeholder: '输入网址，回车打开（只支持 https）' });
  input.setAttribute('autocapitalize', 'off'); input.setAttribute('inputmode', 'url'); input.setAttribute('aria-label', '地址栏');
  // 最左边是 Brana 标志（和客户端左上角一样）：点一下回到客户端；客户端里点标志切到浏览器模式，两边来回切换
  const LOGO = [["M42.0341 39.5754C38.0998 39.5754 34.9132 42.8134 34.9132 46.811V91.9553H39.448V46.811C39.448 45.3539 40.6124 44.1708 42.0464 44.1708C43.4804 44.1708 44.6447 45.3539 44.6447 46.811V91.9553H49.1795V46.811C49.1795 42.8134 45.9929 39.5754 42.0586 39.5754H42.0341Z"],["M79.7105 39.5754C75.7762 39.5754 72.5896 42.8134 72.5896 46.811V91.9553H77.1244V46.811C77.1244 45.3539 78.2888 44.1708 79.7228 44.1708C81.1567 44.1708 82.3211 45.3539 82.3211 46.811V91.9553H86.8559V46.811C86.8559 42.8134 83.6693 39.5754 79.735 39.5754H79.7105Z"],["M60.8785 39.5754C56.9443 39.5754 53.7576 42.8134 53.7576 46.811V91.9553H58.2925V46.811C58.2925 45.3539 59.4568 44.1708 60.8908 44.1708C62.3248 44.1708 63.4891 45.3539 63.4891 46.811V91.9553H68.0239V46.811C68.0239 42.8134 64.8373 39.5754 60.903 39.5754H60.8785Z"],["M105.036 20.81L108.174 15.2681H115.466L121.754 0H0L6.28747 15.2681H13.58L16.7053 20.81C10.6139 22.9271 5.60112 28.3071 5.60112 36.4144C5.60112 44.5217 11.3616 51.3836 19.99 51.3836C21.8775 51.3836 23.6301 50.9851 25.1867 50.2877V91.9699H29.7092V46.6139C31.131 44.6586 31.9644 42.2177 32.0257 39.453C32.0257 39.4157 32.0379 39.3659 32.0379 39.316C32.0379 39.2787 32.0257 39.2538 32.0257 39.2164C32.0257 39.1915 32.0379 39.1666 32.0379 39.1417C32.0379 39.1043 32.0257 39.067 32.0257 39.0172C31.9766 37.1491 31.4864 35.4056 30.6284 33.9236H91.1255C90.2675 35.4056 89.7773 37.1491 89.7282 39.0172C89.7282 39.067 89.716 39.1043 89.716 39.1417V39.316C89.716 39.316 89.7282 39.4157 89.7282 39.453C89.7895 42.2177 90.6229 44.6586 92.0447 46.6139V91.9699H96.5672V50.2877C98.1238 50.9851 99.8642 51.3836 101.764 51.3836C110.38 51.3836 116.153 44.2228 116.153 36.4144C116.153 28.6059 111.128 22.9271 105.036 20.81ZM9.30252 10.6603L6.80224 4.60784H114.952L112.451 10.6603H9.30252ZM102.953 15.2681L100.44 19.7141H21.3137L18.8011 15.2681H102.953ZM101.764 46.7758C97.3394 46.7758 94.2998 43.7371 94.2508 39.2662C94.2753 36.103 96.2853 33.9859 99.2023 33.9485H99.2881C101.114 33.9485 102.61 35.4803 102.61 37.0868V37.1616C102.573 38.0956 101.837 38.8179 100.918 38.8179C99.6681 38.8179 98.6508 39.8515 98.6508 41.1218C98.6508 42.3921 99.6681 43.4257 100.918 43.4257C104.35 43.4257 107.157 40.5988 107.157 37.0868C107.157 36.9748 107.132 36.8627 107.12 36.7631C106.936 32.6409 103.615 29.3532 99.2269 29.3532H60.8647L60.5705 29.3407H60.2641L22.527 29.3532C18.1393 29.3532 14.8178 32.6409 14.634 36.7631C14.6217 36.8627 14.5972 36.9748 14.5972 37.0868C14.5972 40.5988 17.4039 43.4257 20.8357 43.4257C22.0858 43.4257 23.1031 42.3921 23.1031 41.1218C23.1031 39.8515 22.0858 38.8179 20.8357 38.8179C19.9165 38.8179 19.1811 38.0956 19.1321 37.1616C19.1321 37.1367 19.1443 37.1118 19.1443 37.0868C19.1443 35.4803 20.6273 33.9485 22.4658 33.9485H22.5393C25.4686 33.9859 27.4786 36.103 27.5031 39.2662C27.4541 43.7371 24.4023 46.7758 19.99 46.7758C14.1805 46.7758 10.1359 42.006 10.1359 36.4144C10.1359 28.8675 15.9577 24.3094 23.1521 24.3094H98.6018C105.796 24.3094 111.618 28.8675 111.618 36.4144C111.618 42.006 107.573 46.7758 101.764 46.7758Z"],["M5.587044534412955 4.097165991902827 17.381916329284753 5.214574898785415C17.506072874493928 17.754385964912274 17.506072874493928 30.170040485829958 17.506072874493928 42.585695006747635V47.800269905533064C17.506072874493928 60.960863697705804 17.506072874493928 73.99730094466936 17.381916329284753 86.78542510121457L5.587044534412955 87.90283400809716V92.0H43.82726045883941C74.61808367071525 92.0 83.68151147098516 78.96356275303644 83.68151147098516 66.67206477732793C83.68151147098516 54.0080971659919 74.8663967611336 45.19298245614035 53.387314439946024 43.08232118758434C72.13495276653171 39.854251012145745 78.46693657219973 31.287449392712546 78.46693657219973 21.72739541160594C78.46693657219973 9.063427800269906 69.52766531713901 0.0 46.931174089068826 0.0H5.587044534412955ZM34.88798920377868 46.06207827260459H41.84075573549258C58.10526315789474 46.06207827260459 65.67881241565452 52.766531713900136 65.67881241565452 66.92037786774628C65.67881241565452 80.32928475033738 57.2361673414305 87.53036437246963 43.08232118758435 87.53036437246963H35.26045883940621C34.88798920377868 74.49392712550608 34.88798920377868 61.08502024291498 34.88798920377868 46.06207827260459ZM35.26045883940621 4.5937921727395405H42.21322537112011C55.99460188933873 4.5937921727395405 61.45748987854251 11.049932523616732 61.45748987854251 22.099865047233465C61.45748987854251 34.63967611336032 54.50472334682861 41.84075573549258 40.72334682860999 41.84075573549258H34.88798920377868C34.88798920377868 29.052631578947363 34.88798920377868 16.76113360323886 35.26045883940621 4.5937921727395405Z","translate(124.4 0)"],["M226.756 92.0345H198.418V87.6791C202.704 87.6791 204.729 87.6791 204.729 81.2668V43.2774C204.729 34.4455 204.609 33.9615 197.465 36.0183V31.6628L217.707 22.8309V37.3491C221.517 30.211 227.352 23.3148 233.781 23.3148C238.901 23.3148 242.711 26.7024 242.711 32.3887C242.711 37.2281 240.092 40.0108 236.163 40.0108C231.043 40.0108 230.09 34.8084 226.875 34.8084C224.494 34.8084 221.041 40.6157 217.707 47.3909V81.2668C217.707 87.6791 219.493 87.6791 226.756 87.6791V92.0345Z","translate(13.6 0)"],["M379.993 93.4932C369.991 93.4932 362.49 86.96 362.49 76.5553C362.49 65.1826 367.967 58.7704 379.04 54.5359C384.16 52.6001 388.209 51.6323 391.662 49.5755C396.305 46.9138 397.496 44.1312 397.496 40.3806C397.496 33.8474 393.805 29.3709 387.613 29.3709C380.469 29.3709 378.445 32.6375 377.254 41.1065C376.897 43.7682 375.587 47.2768 370.944 47.2768C366.181 47.2768 364.276 44.3731 364.276 40.5016C364.276 31.5487 373.682 23.3217 388.685 23.3217C401.425 23.3217 409.76 29.7339 409.76 44.0102V79.9428C409.76 82.8465 410.951 84.1773 412.975 84.1773C415.118 84.1773 416.428 83.0885 417.738 81.6366L420 84.6613C418.571 87.323 415.237 93.1303 407.617 93.1303C401.902 93.1303 397.734 89.2587 397.139 82.9675C394.162 88.0489 389.042 93.4932 379.993 93.4932ZM374.992 73.8936C374.992 81.1527 379.636 84.9033 384.994 84.9033C390.709 84.9033 394.043 81.3947 397.139 76.3133V51.9952C396.186 53.2051 395.472 54.2939 392.971 55.8667C389.399 58.1655 388.566 58.4074 383.803 61.0691C377.969 64.3357 374.992 67.8443 374.992 73.8936Z","translate(-104.2 0)"],["M326.059 92.0345H298.078V87.6791C302.364 87.6791 304.388 87.6791 304.388 81.2668V43.2774C304.388 34.4455 304.269 33.9615 297.125 36.0183V31.6628L317.367 22.8309V34.8084C322.01 28.7592 328.559 23.3148 336.775 23.3148C348.205 23.3148 354.635 30.6949 354.635 42.6725V81.2668C354.635 87.6791 356.659 87.6791 361.303 87.6791V92.0345H333.084V87.6791C339.632 87.6791 341.657 87.6791 341.657 81.2668V44.4873C341.657 36.8652 338.204 32.9936 332.012 32.9936C326.059 32.9936 321.177 36.7442 317.367 41.8256V81.2668C317.367 87.6791 319.153 87.6791 326.059 87.6791V92.0345Z","translate(20.7 0)"],["M379.993 93.4932C369.991 93.4932 362.49 86.96 362.49 76.5553C362.49 65.1826 367.967 58.7704 379.04 54.5359C384.16 52.6001 388.209 51.6323 391.662 49.5755C396.305 46.9138 397.496 44.1312 397.496 40.3806C397.496 33.8474 393.805 29.3709 387.613 29.3709C380.469 29.3709 378.445 32.6375 377.254 41.1065C376.897 43.7682 375.587 47.2768 370.944 47.2768C366.181 47.2768 364.276 44.3731 364.276 40.5016C364.276 31.5487 373.682 23.3217 388.685 23.3217C401.425 23.3217 409.76 29.7339 409.76 44.0102V79.9428C409.76 82.8465 410.951 84.1773 412.975 84.1773C415.118 84.1773 416.428 83.0885 417.738 81.6366L420 84.6613C418.571 87.323 415.237 93.1303 407.617 93.1303C401.902 93.1303 397.734 89.2587 397.139 82.9675C394.162 88.0489 389.042 93.4932 379.993 93.4932ZM374.992 73.8936C374.992 81.1527 379.636 84.9033 384.994 84.9033C390.709 84.9033 394.043 81.3947 397.139 76.3133V51.9952C396.186 53.2051 395.472 54.2939 392.971 55.8667C389.399 58.1655 388.566 58.4074 383.803 61.0691C377.969 64.3357 374.992 67.8443 374.992 73.8936Z","translate(21.5 0)"]];
  const logo = mk('button', 'home logo', { type: 'button', title: '切换为客户端' }); logo.setAttribute('aria-label', '切换为客户端');
  { const NS = 'http://www.w3.org/2000/svg', sv = document.createElementNS(NS, 'svg'); sv.setAttribute('viewBox', '0 0 442 94'); sv.setAttribute('fill', 'none');
    for (const [d, tf] of LOGO) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); if (tf) p.setAttribute('transform', tf); p.setAttribute('fill', 'currentColor'); sv.append(p); }
    logo.append(sv); }
  const left=mk('div','bar-left'),right=mk('div','bar-right'),address=mk('div','address-wrap',{title:'空白区域可拖动窗口'});address.append(input);left.append(logo);
  if(window.BranaBrowser?.bookmarks&&norm(location.href)){const bookmarks=btn('bookmarks','','收藏和书签');{const bsv=document.createElementNS('http://www.w3.org/2000/svg','svg'),bp=document.createElementNS('http://www.w3.org/2000/svg','path');bsv.setAttribute('viewBox','0 0 24 24');bsv.setAttribute('class','wb-ic');bsv.setAttribute('aria-hidden','true');bp.setAttribute('d','M12 2.5l2.9 5.88 6.5.95-4.7 4.58 1.1 6.47L12 17.32l-5.8 3.06 1.1-6.47-4.7-4.58 6.5-.95L12 2.5z');bsv.append(bp);bookmarks.append(bsv);}bookmarks.onclick=()=>void window.BranaBrowser.bookmarks().catch(()=>{});left.append(bookmarks);}
  if(window.BranaBrowser?.bookmarkPins&&window.BranaBrowser?.bookmarkVisit){
    const api=window.BranaBrowser,pins=mk('div','bookmark-pins');left.append(pins);
    const pinStyle=new CSSStyleSheet();pinStyle.replaceSync(`.bookmark-pins{display:flex;align-items:center;gap:2px;min-width:0;max-width:160px;overflow-x:auto;flex:0 1 auto;-webkit-app-region:no-drag}.bookmark-pins:empty{display:none}.bookmark-pins button{display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600}.bookmark-pins img{width:18px;height:18px;object-fit:contain}.bookmark-pins button:focus-visible{outline:2px solid #4c8bf5;outline-offset:-2px}@media(max-width:1050px){.bookmark-pins{max-width:clamp(26px,calc(100vw - 600px),96px)}}`);root.adoptedStyleSheets=[...root.adoptedStyleSheets,pinStyle];
    let loading=false,last='';
    const refresh=async()=>{if(loading)return;loading=true;try{const rows=await api.bookmarkPins(),next=JSON.stringify(rows);if(next===last)return;last=next;pins.replaceChildren();for(const row of rows){const b=btn('bookmark-pinned',row.title.slice(0,1),row.title);if(/^data:image\/png;base64,/.test(row.icon||'')){const img=mk('img','',{src:row.icon,alt:''});img.onerror=()=>b.replaceChildren(document.createTextNode(row.title.slice(0,1)));b.replaceChildren(img);}b.onclick=async()=>{b.disabled=true;try{await api.bookmarkVisit(row.id);}catch(error){b.title=error.message||String(error);last='';void refresh();}finally{b.disabled=false;}};pins.append(b);}}catch{last='';}finally{loading=false;}};
    pins.addEventListener('wheel',e=>{if(pins.scrollWidth>pins.clientWidth){e.preventDefault();pins.scrollLeft+=e.deltaY||e.deltaX;}},{passive:false});
    window.addEventListener('focus',()=>void refresh());const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},2000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});void refresh();
  }
  left.append(btn('back','←','后退'),btn('fwd','→','前进'),btn('rel','↻','刷新'));bar.append(left,address,right);
  if (window.BranaBrowser?.extensions) {
    const PUZZLE_PATH = 'M12 2.2a2.1 2.1 0 0 1 2.1 2.1c0 .55-.2 1.05-.55 1.4H17.5a2 2 0 0 1 2 2v3.95c.35-.35.85-.55 1.4-.55a2.1 2.1 0 0 1 0 4.2c-.55 0-1.05-.2-1.4-.55V18.7a2 2 0 0 1-2 2h-3.95c.35-.35.55-.85.55-1.4a2.1 2.1 0 0 0-4.2 0c0 .55.2 1.05.55 1.4H6.5a2 2 0 0 1-2-2v-3.95c-.35.35-.85.55-1.4.55a2.1 2.1 0 0 1 0-4.2c.55 0 1.05.2 1.4.55V7.7a2 2 0 0 1 2-2h3.95c-.35-.35-.55-.85-.55-1.4A2.1 2.1 0 0 1 12 2.2z';
    const api = window.BranaBrowser, pins = mk('div','ext-pins'), extensions = btn('extensions','','扩展程序');
    { const esv = document.createElementNS('http://www.w3.org/2000/svg','svg'), ep = document.createElementNS('http://www.w3.org/2000/svg','path'); esv.setAttribute('viewBox','0 0 24 24'); esv.setAttribute('class','wb-ic'); esv.setAttribute('aria-hidden','true'); ep.setAttribute('d',PUZZLE_PATH); esv.append(ep); extensions.append(esv); }
    const menu = mk('section','ext-menu'), heading = mk('div','ext-heading'), list = mk('div','ext-list'), status = mk('p','ext-status');
    menu.hidden = true; menu.setAttribute('role','dialog'); menu.setAttribute('aria-label','扩展程序');
    extensions.setAttribute('aria-expanded','false'); extensions.setAttribute('aria-haspopup','dialog');
    const close = () => { menu.hidden=true;extensions.setAttribute('aria-expanded','false'); };
    const closeButton=btn('','×','关闭扩展列表');closeButton.onclick=()=>{close();extensions.focus();};
    heading.append(mk('strong','',{textContent:'扩展程序'}),closeButton);
    const manage=btn('ext-manage','⚙  管理扩展程序','管理扩展程序');
    manage.onclick=()=>{close();void api.extensions().catch(error=>showError(error));};
    menu.append(heading,status,list,manage);right.append(pins,extensions);root.append(menu);
    const extSheet=new CSSStyleSheet();extSheet.replaceSync(`
      .ext-pins{display:flex;gap:2px;max-width:30vw;overflow:auto;-webkit-app-region:no-drag;scrollbar-width:none}
      .ext-icon{display:inline-flex;width:20px;height:20px;align-items:center;justify-content:center;border-radius:4px;background:${C.hov};font-size:12px;font-weight:600;flex:none}
      .ext-icon img{width:20px;height:20px;object-fit:contain}
      .ext-pins button{display:flex;align-items:center;justify-content:center}
      .ext-menu{position:fixed;${bottom?'bottom':'top'}:calc(${H+4}px + ${sa});right:${6+pad[1]}px;width:min(340px,calc(100vw - 24px));max-height:calc(100svh - ${H+30}px);overflow:auto;box-sizing:border-box;background:${C.bg};color:${C.fg};border:1px solid ${C.line};border-radius:14px;box-shadow:0 5px 20px #0003;z-index:2147483647;font:13px system-ui,sans-serif;-webkit-app-region:no-drag;padding:10px 0}
      .ext-menu[hidden]{display:none}.ext-heading{display:flex;align-items:center;justify-content:space-between;padding:0 12px 6px 20px;font-size:15px}
      .ext-status{padding:0 20px;margin:6px 0;font-size:12px;line-height:1.5;white-space:pre-wrap}.ext-status:empty{display:none}
      .ext-row{display:flex;align-items:center;gap:4px;padding:4px 12px}.ext-launch{width:auto;min-width:0;flex:1;display:flex;align-items:center;gap:12px;text-align:left;padding:4px 8px;height:38px;font-size:13px}
      .ext-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ext-pin[aria-pressed=true]{color:${dark?'#d8d3ca':'#8c7664'};background:${dark?'rgba(216,211,202,.15)':'rgba(140,118,100,.14)'}}
      .ext-manage{width:100%;height:40px;margin-top:8px;border-top:1px solid ${C.line};border-radius:0;text-align:left;padding:0 20px;font-size:13px}
      .ext-menu button:focus-visible,.ext-pins button:focus-visible{outline:2px solid ${dark?'#d8d3ca':'#8c7664'};outline-offset:-2px}
      .ext-row{border-radius:9px;margin:2px 8px;padding:3px 6px!important;transition:background .12s}.ext-row:hover{background:${C.hov}}
      .ext-manage{border-radius:9px!important;margin:8px 10px 2px!important;width:calc(100% - 20px)!important;height:34px!important;border:1px solid ${C.line}!important;background:${dark?'#ecebe8':'#262522'}!important;color:${dark?'#1f1e1c':'#ffffff'}!important;text-align:center!important;font-weight:600!important}
    `);root.adoptedStyleSheets=[...root.adoptedStyleSheets,extSheet];
    let busy=false,refreshing=false,last='';
    const showError=error=>{menu.hidden=false;extensions.setAttribute('aria-expanded','true');status.textContent=error.message||String(error);};
    const icon=e=>{const wrap=mk('span','ext-icon',{textContent:e.name.slice(0,1)});if(/^data:image\/(png|jpeg|webp);base64,/.test(e.icon||'')){const img=mk('img','',{src:e.icon,alt:''});img.onerror=()=>{wrap.textContent=e.name.slice(0,1);};wrap.replaceChildren(img);}return wrap;};
    const activate=async e=>{if(busy)return;busy=true;try{await api.extensionActivate(e.key);close();}catch(error){showError(error);}finally{busy=false;}};
    const render=data=>{
      pins.replaceChildren();list.replaceChildren();status.textContent=data.error||(!data.entries.length?'尚未安装扩展':'点击扩展打开；图钉可固定到顶部');
      for(const e of data.entries){
        const row=mk('div','ext-row'),launch=btn('ext-launch','',e.name),pin=btn('ext-pin','',e.pinned?'取消固定 '+e.name:'固定 '+e.name);
        launch.append(icon(e),mk('span','ext-name',{textContent:e.name+(e.enabled?'':'（已停用）')}));launch.disabled=!e.loaded;
        launch.onclick=()=>void activate(e);pin.setAttribute('aria-pressed',String(e.pinned));
        const pinSvg=document.createElementNS('http://www.w3.org/2000/svg','svg'),pinPath=document.createElementNS('http://www.w3.org/2000/svg','path');
        pinSvg.setAttribute('viewBox','0 0 24 24');pinSvg.setAttribute('width','18');pinSvg.setAttribute('height','18');pinSvg.setAttribute('aria-hidden','true');
        pinPath.setAttribute('d','M8 3h8l-1 7 3 3v2h-5v6l-1 2-1-2v-6H6v-2l3-3z');pinPath.setAttribute('fill',e.pinned?'currentColor':'none');pinPath.setAttribute('stroke','currentColor');pinPath.setAttribute('stroke-width','1.5');pinSvg.append(pinPath);pin.append(pinSvg);
        pin.onclick=async()=>{if(busy)return;busy=true;pin.disabled=true;try{const data=await api.extensionPin(e.key,!e.pinned);last=JSON.stringify(data);render(data);}catch(error){showError(error);}finally{busy=false;pin.disabled=false;}};
        row.append(launch,pin);list.append(row);
        if(e.pinned&&e.loaded){const b=btn('ext-pinned','',e.name);b.append(icon(e));b.onclick=()=>void activate(e);pins.append(b);}
      }
    };
    const refresh=async()=>{if(refreshing||busy||!api.extensionList)return;refreshing=true;try{const data=await api.extensionList(),next=JSON.stringify(data);if(next!==last){last=next;render(data);}}catch(error){if(!menu.hidden)showError(error);}finally{refreshing=false;}};
    extensions.onclick=()=>{if(!api.extensionList){void api.extensions().catch(showError);return;}menu.hidden=!menu.hidden;extensions.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden){last='';void refresh();closeButton.focus();}};
    document.addEventListener('pointerdown',event=>{if(!event.composedPath().includes(host))close();});
    root.addEventListener('keydown',event=>{if(!menu.hidden&&event.key==='Escape'){event.stopPropagation();close();extensions.focus();}});
    window.addEventListener('focus',()=>void refresh());
    const refreshTimer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},5000);
    window.addEventListener('pagehide',()=>clearInterval(refreshTimer),{once:true});void refresh();
  }
  const loader = mk('div', 'wb-loader'), ldSpin = mk('div', 'wb-spin'), ldTitle = mk('div', 'wb-title', { textContent: '正在加载浏览器模式…' }), ldSub = mk('div', 'wb-sub', { textContent: '正在等待页面完整加载后显露' }), ldBar = mk('div', 'wb-bar'), ldBarIn = mk('div', 'wb-bar-in');
  ldBar.append(ldBarIn); loader.append(ldSpin, ldTitle, ldSub, ldBar); loader.hidden = true;
  const dlToast = mk('div', 'wb-dl-toast'), dlText = mk('span', ''), dlHint = mk('small', '');
  dlToast.append(dlText, dlHint); dlToast.hidden = true;
  let dlToastTimer = 0, lastDlPath = '', lastDlMime = '';
  const showDownloadToast = info => {
    if (!info) return;
    clearTimeout(dlToastTimer);
    lastDlPath = String(info.path || '');
    lastDlMime = String(info.mime || '');
    dlText.textContent = (info.busy ? '⏳ 正在下载：' : '✓ 已下载：') + (info.name || '文件');
    dlHint.textContent = lastDlPath ? (window.BranaAndroid ? '点击打开' : '点击打开目录') : '';
    dlToast.hidden = false;
    if (!info.busy) dlToastTimer = setTimeout(() => { dlToast.hidden = true; }, 5500);
  };
  dlToast.onclick = () => {
    dlToast.hidden = true;
    if (!lastDlPath) return;
    try {
      if (window.BranaAndroid?.openFile) window.BranaAndroid.openFile(lastDlPath, lastDlMime || '*/*');
      else if (window.BranaBrowser?.showFile) void window.BranaBrowser.showFile(lastDlPath);
    } catch {}
  };
  window.__ancShowDownloadToast = showDownloadToast;
  let loaderTimer = 0;
  const hideLoader = () => { clearTimeout(loaderTimer); try { sessionStorage.removeItem('anc:mode-switching'); } catch {} if (loader.hidden) return; loader.classList.add('fade'); setTimeout(() => { loader.hidden = true; loader.classList.remove('fade'); }, 220); };
  const showLoader = (title, sub, maxMs = 4200) => { clearTimeout(loaderTimer); if (title) ldTitle.textContent = title; if (sub) ldSub.textContent = sub; loader.classList.remove('fade'); loader.hidden = false; loaderTimer = setTimeout(hideLoader, maxMs); };
  try { const rawSw = sessionStorage.getItem('anc:mode-switching'); if (rawSw) { const sw = JSON.parse(rawSw); if (sw && Date.now() - (sw.at || 0) < 30000) { if (document.readyState !== 'complete') { showLoader('正在进入浏览器模式…', '等待网页资源与界面完整加载后显示', 4500); window.addEventListener('load', () => setTimeout(hideLoader, 160), { once: true }); } else { sessionStorage.removeItem('anc:mode-switching'); } } else { sessionStorage.removeItem('anc:mode-switching'); } } } catch {}
  root.append(bar, loader, dlToast);
  const $ = s => bar.querySelector(s), inp = input;
  $('.back').onclick = () => history.back();
  $('.fwd').onclick = () => history.forward();
  $('.rel').onclick = () => location.reload();
  $('.home').onclick = () => { showLoader('正在切换回客户端模式…', '正在同步会话与本地状态，请稍候', 4000); if(window.BranaBrowser?.back)void window.BranaBrowser.back().catch(()=>{hideLoader();location.href = HOME;});else location.href = HOME; };
  const go = () => {
    const u = norm(inp.value);
    if (!u) { inp.classList.add('bad'); inp.title = '请输入完整的 https 网址，例如 outlook.live.com'; return; }
    inp.classList.remove('bad'); inp.blur();
    // 粘贴的是 Brana 验证 / 登录链接：先去掉固定旧部署的 cookie（30 分钟内不再固定），验证和设置密码都走最新部署
    try { const x = new URL(u); if (location.hostname === 'arena.ai' && (x.hostname === 'auth.arena.ai' || (x.hostname === 'arena.ai' && (/^\/(?:auth|login|signup|sign-up|sign-in|reset-password|verify)/i.test(x.pathname) || /[?&](?:code|auth|token_hash|token)=/i.test(x.search))))) { for (const dm of ['', '; domain=arena.ai', '; domain=.arena.ai']) document.cookie = '__vdpl=; path=/; max-age=0; secure' + dm; localStorage.setItem('anc-pin-hold', String(Date.now() + 30 * 60e3)); } } catch {}
    location.href = u;
  };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go(); else if (e.key === 'Escape') { inp.value = location.href; inp.blur(); } });
  for (const t of ['keyup', 'keypress']) inp.addEventListener(t, e => e.stopPropagation());
  inp.addEventListener('input', () => inp.classList.remove('bad'));
  inp.addEventListener('focus', () => setTimeout(() => inp.select(), 0));
  const sync = () => { if (root.activeElement !== inp) inp.value = location.href; };
  // 给固定位置的工具栏让出页面空间（用 CSSOM 设置，不受 CSP 影响）
  // Keep document scrolling available; the trailing space keeps final content above the footer.
  const viewportSheet = new CSSStyleSheet();
  viewportSheet.replaceSync(`
    :root{--anc-bar:${bottom ? `calc(${H}px + var(--sa-bottom,0px))` : `calc(${H}px + var(--sa-top,0px))`};--anc-fill:calc(100svh - var(--anc-bar,0px) - var(--anc-foot,0px))}
    html{margin-top:${bottom ? '0px' : 'var(--anc-bar)'}!important;margin-bottom:${bottom ? 'calc(var(--anc-bar) + var(--anc-foot,0px))' : 'var(--anc-foot,0px)'}!important;height:var(--anc-fill)!important;min-height:0!important;width:auto!important;min-width:0!important;box-sizing:border-box!important;scroll-padding-top:var(--anc-bar,40px)!important}
    .h-svh,.h-dvh,.h-screen,.h-lvh,[data-anc-fit]{height:var(--anc-fill)!important;max-height:var(--anc-fill)!important}
    .min-h-svh,.min-h-dvh,.min-h-screen,.min-h-lvh{min-height:var(--anc-fill)!important}
    .max-h-svh,.max-h-dvh,.max-h-screen,.max-h-lvh{max-height:var(--anc-fill)!important}
    body{margin:0!important;transform:translate(0,0)!important;min-height:calc(100svh - var(--anc-bar,0px) - var(--anc-foot,0px))!important;box-sizing:border-box!important;max-width:100%!important}
    html::after{content:""!important;display:block!important;height:var(--anc-foot,0px)!important;pointer-events:none!important}
    *,*::before,*::after{scrollbar-width:none!important}
    *::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}
  `);
  const pushPage = () => {
    if (!document.adoptedStyleSheets.includes(viewportSheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, viewportSheet];
    const st = document.documentElement.style;
    st.setProperty('--anc-bar', bottom ? `calc(${H}px + var(--sa-bottom,0px))` : `calc(${H}px + var(--sa-top,0px))`);
    if (bottom) st.setProperty('margin-bottom', 'calc(var(--anc-bar) + var(--anc-foot,0px))', 'important'); else { st.setProperty('margin-top', 'var(--anc-bar)', 'important'); st.setProperty('margin-bottom', 'var(--anc-foot,0px)', 'important'); }
    // 只给 html 加边距挡不住「position:fixed; top:0」的元素（官网侧栏顶部的 logo / 折叠按钮、顶部条会被浏览条盖住）。
    // 让 body 成为 fixed 元素的定位容器（transform 不为 none），fixed 元素就排在「浏览条以下」的区域里，弹窗 / 浮层同理。
    const b = document.body;
    if (b) { b.style.setProperty('margin', '0', 'important'); b.style.setProperty('transform', 'translate(0,0)', 'important'); b.style.setProperty('min-height', 'calc(100svh - var(--anc-bar,0px) - var(--anc-foot,0px))', 'important'); }
  };
  // ---- 浏览器模式（Brana 官网）：左侧对话卡片套用客户端样式；保留官网原生输入框不修改 ----
  // 只加样式表（构造样式表，不受 CSP 影响），不改官网的 DOM 结构和事件；官网改版时最多是样式没套上，不会坏功能。
  const skin = /(^|\.)arena\.ai$/i.test(location.hostname) ? (() => {
    const isDark = () => { const r = document.documentElement; return r.classList.contains('dark') || r.dataset.theme === 'dark' || (!r.classList.contains('light') && matchMedia('(prefers-color-scheme: dark)').matches); };
    const css = d => `
      :is([data-sidebar],aside,nav) a[href^="/agent/"]{display:flex!important;align-items:center;min-height:32px!important;padding:0 8px 0 9px!important;border-radius:7px!important;
        font-size:12.5px!important;font-weight:600!important;line-height:1.25!important;margin:0 0 1px!important;transition:background .12s}
      :is([data-sidebar],aside,nav) a[href^="/agent/"]:hover{background:${d ? 'rgba(255,255,255,.07)' : '#ebe9e4'}!important}
      :is([data-sidebar],aside,nav) a[href^="/agent/"].anc-on,:is([data-sidebar],aside,nav) a[href^="/agent/"].anc-on:hover{
        background:${d ? 'rgba(216,211,202,.24)' : '#8c7664'}!important;color:${d ? '#f4f3f0' : '#fff'}!important;
        box-shadow:none!important}   /* 和客户端一致：纯色填充、不描边；深色 = 背景和普通卡片之间的中间色 */
      :is([data-sidebar],aside,nav) a[href^="/agent/"].anc-on *{color:inherit!important}
      /* 整页铺满「窗口减去浏览条」：官网用 h-svh / min-h-svh（= 整个窗口高）排版，再加上浏览条的位置就多出一截、出现整页上下滚动条。
         把这些「一屏高」改成「一屏高 − 浏览条」，和普通浏览器里一样随窗口大小自适应，内部区域各自滚动。 */
      /* --anc-fill = 窗口高 − 顶部浏览条 − 底部客户端信息条（没有信息条时 --anc-foot 为 0） */
      :root{--anc-fill:calc(100svh - var(--anc-bar,0px) - var(--anc-foot,0px))}
      html.h-svh,html.h-dvh,html.h-screen,.h-svh,.h-dvh,.h-screen,.h-lvh{height:var(--anc-fill)!important}
      .min-h-svh,.min-h-dvh,.min-h-screen,.min-h-lvh{min-height:var(--anc-fill)!important}
      .max-h-svh,.max-h-dvh,.max-h-screen,.max-h-lvh{max-height:var(--anc-fill)!important}
      [data-anc-fit]{height:var(--anc-fill)!important;max-height:var(--anc-fill)!important}
    `;
    const sheet = new CSSStyleSheet(); let mode = null;
    const paint = () => { const d = isDark(); if (d !== mode) { mode = d; sheet.replaceSync(css(d)); } };
    const attach = () => { if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]; };
    // 当前对话 = 地址里的 /agent/<id>；官网是单页应用，换对话不一定触发 popstate，所以随定时器一起核对
    const mark = () => {
      const m = /^\/agent\/([\w-]+)/.exec(location.pathname), id = m ? m[1] : '';
      for (const a of document.querySelectorAll('a.anc-on')) if (!id || !a.getAttribute('href')?.startsWith('/agent/' + id)) a.classList.remove('anc-on');
      if (id) for (const a of document.querySelectorAll('a[href^="/agent/' + id + '"]')) if (a.closest('[data-sidebar],aside,nav')) a.classList.add('anc-on');
    };
    // 兜底：官网换了写法（行内 100vh / 别的类名）导致整页又能上下滚：把正好「一屏高」的外层容器标出来，同样减去浏览条；同时允许沙盒预览 iframe 内触发下载
    const fit = () => {
      const vh = innerHeight; if (!document.body || !vh) return;
      const walk = (el, depth) => { for (const c of el.children) { if (c === host || c.id?.startsWith('__anc_')) continue; const hh = c.getBoundingClientRect().height; if ((Math.abs(hh - vh) <= 2 || /^100(s|d|l)?vh$/i.test(c.style?.height || '')) && !c.hasAttribute('data-anc-fit')) c.setAttribute('data-anc-fit', ''); if (depth < 5 && hh >= vh - 68) walk(c, depth + 1); } };
      walk(document.body, 0);
      for (const ifr of document.querySelectorAll('iframe[sandbox]')) {
        const sb = ifr.getAttribute('sandbox') || '';
        if (sb && !/\ballow-downloads\b/i.test(sb)) try { ifr.setAttribute('sandbox', (sb + ' allow-downloads').trim()); } catch {}
      }
    };
    return () => { try { paint(); attach(); mark(); fit(); } catch {} };
  })() : null;

  // ---- 浏览器模式文件下载桥接（修复 <a download>、blob: 立即 revoke、未挂载 a.click()、沙盒与安卓 WebView 无法下载的问题）----
  (() => {
    try {
      if (/(^|\.)arena\.ai$/i.test(location.hostname) && 'showSaveFilePicker' in window) {
        try { delete window.showSaveFilePicker; } catch {}
      }
      const blobMap = new Map();
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && !URL.createObjectURL.__ancWrapped) {
        const origCreate = URL.createObjectURL.bind(URL);
        const origRevoke = typeof URL.revokeObjectURL === 'function' ? URL.revokeObjectURL.bind(URL) : () => {};
        const createWrapped = function (obj) {
          const u = origCreate(obj);
          try {
            if (u && obj) {
              blobMap.set(u, { blob: obj, at: Date.now() });
              if (blobMap.size > 64) {
                const cutoff = Date.now() - 180000;
                for (const [k, v] of blobMap) if (v.at < cutoff) blobMap.delete(k);
              }
            }
          } catch {}
          return u;
        };
        createWrapped.__ancWrapped = true;
        URL.createObjectURL = createWrapped;
        URL.revokeObjectURL = function (u) {
          setTimeout(() => { blobMap.delete(u); try { origRevoke(u); } catch {} }, 60000);
        };
      }
      const parseCdName = cd => {
        const s = String(cd || '');
        const mStar = /filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;\r\n]+)/i.exec(s);
        if (mStar) { try { return decodeURIComponent(mStar[1].trim().replace(/^["']|["']$/g, '')); } catch {} }
        const m = /filename\s*=\s*(?:"([^"]+)"|([^;\r\n]+))/i.exec(s);
        return m ? String(m[1] || m[2] || '').trim() : '';
      };
      const extFromMime = mime => {
        const m = String(mime || '').toLowerCase().split(';')[0].trim();
        const map = { 'text/html': '.html', 'text/plain': '.txt', 'text/markdown': '.md', 'text/csv': '.csv', 'application/json': '.json', 'application/pdf': '.pdf', 'application/zip': '.zip', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg', 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'video/mp4': '.mp4' };
        return map[m] || '';
      };
      const inferName = (href, suggested, cd, mime) => {
        let name = String(suggested || '').trim() || parseCdName(cd);
        if (!name && href && !/^blob:|^data:/i.test(href)) {
          try {
            const u = new URL(href, location.href);
            const qp = u.searchParams.get('filename') || u.searchParams.get('name') || parseCdName(u.searchParams.get('response-content-disposition') || '');
            if (qp) name = qp;
            else {
              const seg = u.pathname.split('/').filter(Boolean).pop() || '';
              if (seg && seg !== 'download') name = decodeURIComponent(seg);
            }
          } catch {}
        }
        name = String(name || 'download').replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').trim() || 'download';
        if (!/\.[a-z0-9]{1,8}$/i.test(name)) {
          const ext = extFromMime(mime);
          if (ext) name += ext;
        }
        return name;
      };
      const isDownloadHref = (href, hasDlAttr) => {
        const s = String(href || '').trim();
        if (!s || /^javascript:|^mailto:|^tel:|^#/i.test(s)) return false;
        if (hasDlAttr || /^blob:|^data:/i.test(s)) return true;
        return /\/api\/chat\/(?:[^/]+\/workspace\/[^/]+\/download|workspace\/cas\/)|\/download(?:\b|\/|\?)|[?&](?:download|response-content-disposition)=/i.test(s);
      };
      const blobToBase64 = blob => new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => { const r = String(fr.result || ''); const i = r.indexOf(','); resolve(i >= 0 ? r.slice(i + 1) : r); };
        fr.onerror = () => reject(fr.error || new Error('读取文件失败'));
        fr.readAsDataURL(blob);
      });
      let lastHref = '', lastAt = 0;
      const triggerBrowserDownload = async (rawHref, suggestedName = '', cdHint = '', mimeHint = '') => {
        const href = String(rawHref || '').trim();
        if (!href) return false;
        const nowMs = Date.now();
        if (href === lastHref && nowMs - lastAt < 500) return true;
        lastHref = href; lastAt = nowMs;
        const hasAndroid = typeof window.BranaAndroid !== 'undefined' && typeof window.BranaAndroid?.downloadStart === 'function';
        const hasDesktop = typeof window.BranaBrowser !== 'undefined' && typeof window.BranaBrowser?.download === 'function';
        if (!hasAndroid && !hasDesktop) return false;
        try {
          if (hasDesktop && !/^blob:|^data:/i.test(href) && /^https?:/i.test(href)) {
            showDownloadToast({ name: inferName(href, suggestedName, cdHint, mimeHint), busy: true });
            const r = await window.BranaBrowser.download({ url: href, name: suggestedName || '' });
            if (r?.path) showDownloadToast(r);
            return true;
          }
          let blob = blobMap.get(href)?.blob || null, cd = cdHint, mime = mimeHint;
          if (!blob && typeof fetch === 'function') {
            const resp = await fetch(href, /^https?:/i.test(href) ? { credentials: 'include' } : undefined);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            cd = cd || resp.headers?.get?.('content-disposition') || '';
            mime = mime || resp.headers?.get?.('content-type') || '';
            blob = await resp.blob();
          }
          if (!blob) return false;
          mime = blob.type || mime || 'application/octet-stream';
          const name = inferName(href, suggestedName, cd, mime);
          showDownloadToast({ name, busy: true });
          if (hasAndroid) {
            const start = JSON.parse(window.BranaAndroid.downloadStart(name, mime, blob.size || 0) || '{}');
            if (!start?.id) throw new Error(start?.error || '无法创建下载文件');
            const CHUNK = 384 * 1024;
            for (let off = 0; off < blob.size; off += CHUNK) {
              const b64 = await blobToBase64(blob.slice(off, Math.min(blob.size, off + CHUNK)));
              const step = JSON.parse(window.BranaAndroid.downloadChunk(start.id, b64) || '{}');
              if (step?.error) { try { window.BranaAndroid.downloadCancel(start.id); } catch {} throw new Error(step.error); }
            }
            const fin = JSON.parse(window.BranaAndroid.downloadFinish(start.id) || '{}');
            if (fin?.error) throw new Error(fin.error);
            showDownloadToast({ name: fin.name || name, path: fin.path || '', mime });
            return true;
          }
          if (hasDesktop) {
            const b64 = await blobToBase64(blob);
            const r = await window.BranaBrowser.download({ name, mime, base64: b64 });
            if (r?.ok) showDownloadToast({ name: r.name || name, path: r.path || '', mime });
            return !!r?.ok;
          }
        } catch (err) {
          if (hasDesktop && /^https?:/i.test(href)) {
            try { await window.BranaBrowser.download({ url: href, name: suggestedName || '' }); return true; } catch {}
          }
        }
        return false;
      };
      window.__ancDownloadUrl = (url, cd, mime) => { void triggerBrowserDownload(url, '', cd, mime); };
      if (typeof HTMLAnchorElement !== 'undefined' && HTMLAnchorElement.prototype && !HTMLAnchorElement.prototype.click.__ancWrapped) {
        const origClick = HTMLAnchorElement.prototype.click;
        const clickWrapped = function () {
          try {
            const href = this.href || this.getAttribute?.('href') || '';
            const hasDl = this.hasAttribute?.('download');
            if (isDownloadHref(href, hasDl) && (window.BranaAndroid?.downloadStart || window.BranaBrowser?.download)) {
              void triggerBrowserDownload(href, this.getAttribute?.('download') || '');
              return;
            }
          } catch {}
          return origClick.apply(this, arguments);
        };
        clickWrapped.__ancWrapped = true;
        HTMLAnchorElement.prototype.click = clickWrapped;
      }
      document.addEventListener('click', e => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = e.target?.closest?.('a[href]');
        if (!a) return;
        const href = a.href || a.getAttribute('href') || '';
        const hasDl = a.hasAttribute('download');
        if (isDownloadHref(href, hasDl) && (window.BranaAndroid?.downloadStart || window.BranaBrowser?.download)) {
          e.preventDefault();
          e.stopPropagation();
          void triggerBrowserDownload(href, a.getAttribute('download') || '');
        }
      }, true);
      if (typeof window.open === 'function' && !window.open.__ancWrapped) {
        const origOpen = window.open.bind(window);
        const openWrapped = function (url) {
          try {
            const s = String(url || '').trim();
            if (isDownloadHref(s, false) && (window.BranaAndroid?.downloadStart || window.BranaBrowser?.download)) {
              void triggerBrowserDownload(s, '');
              return null;
            }
          } catch {}
          return origOpen.apply(window, arguments);
        };
        openWrapped.__ancWrapped = true;
        window.open = openWrapped;
      }
    } catch {}
  })();
  // 浏览器模式（arena.ai）死节点回退与工作区分支重置救活器：拦截 /ai-proxy/realtime/v1/sessions/:id/in 并注入红条一键救活按钮
  (() => {
    try {
      if (!/(^|\.)arena\.ai$/i.test(location.hostname)) return;
      const origFetch = window.fetch ? window.fetch.bind(window) : null;
      if (!origFetch || window.fetch.__ancRescueWrapped) return;
      const isDeadAsst = m => {
        if (!m || m.role !== 'assistant') return false;
        if (m.metadata?.openThinkStopped || m.metadata?.aborted || m.metadata?.feedback?.interruption === 'stop') return true;
        const pts = Array.isArray(m.parts) ? m.parts : [];
        if (!pts.length) return true;
        if (pts.some(p => p?.type === 'error')) return true;
        return !pts.some(p => p && ((p.type === 'text' && String(p.text || '').trim().length > 0) || (p.type === 'reasoning' && String(p.text || '').trim().length > 0) || p.toolCallId || String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool' || p.type === 'file'));
      };
      const pickFirstHealthyParent = msgs => {
        if (!Array.isArray(msgs) || !msgs.length) return null;
        for (let i = 0; i < msgs.length; i++) {
          const u = msgs[i];
          if (!u || u.role !== 'user') continue;
          const uid = String(u.metadata?.nodeId || u.id || '');
          for (let j = i + 1; j < msgs.length; j++) {
            const m = msgs[j];
            if (!m) continue;
            if (m.role === 'user') break;
            if (m.role === 'assistant' && !isDeadAsst(m)) return uid || null;
          }
        }
        return null;
      };
      const pickHealthyParent = (msgs, rejectedSet) => {
        if (!Array.isArray(msgs) || !msgs.length) return null;
        for (let i = msgs.length - 1; i >= 0; i--) {
          const u = msgs[i];
          if (!u || u.role !== 'user') continue;
          const uid = String(u.metadata?.nodeId || u.id || '');
          if (rejectedSet && uid && (rejectedSet.has(uid) || rejectedSet.has(String(u.id || '')))) continue;
          let hasHealthy = false;
          for (let j = i + 1; j < msgs.length; j++) {
            const m = msgs[j];
            if (!m) continue;
            if (m.role === 'user') break;
            if (m.role === 'assistant' && !isDeadAsst(m)) { hasHealthy = true; break; }
          }
          if (hasHealthy) return uid || null;
        }
        return null;
      };
      const hasRejectedBannerOnPage = () => {
        try { return /The AI service rejected this request/i.test(document.body?.innerText || ''); } catch { return false; }
      };
      const wrappedFetch = async function (input, init) {
        try {
          const url = typeof input === 'string' ? input : (input?.url || '');
          const m = /\/ai-proxy\/realtime\/v1\/sessions\/([^/?#]+)\/in\b/.exec(url);
          if (m && init && String(init.method || 'GET').toUpperCase() === 'POST' && typeof init.body === 'string') {
            const chatId = decodeURIComponent(m[1]);
            const parsed = JSON.parse(init.body);
            const uMsg = parsed?.payload?.message;
            if (uMsg && uMsg.role === 'user') {
              let shouldReloadAfter = false;
              if (window.__ancResetWsNext) {
                window.__ancResetWsNext = false;
                let firstHealthyId = null;
                try {
                  const r = await origFetch('/api/chat/' + encodeURIComponent(chatId), { credentials: 'same-origin', cache: 'no-store' });
                  if (r.ok) {
                    const j = await r.json();
                    firstHealthyId = pickFirstHealthyParent(j?.messages || []);
                  }
                } catch {}
                uMsg.metadata = { ...(uMsg.metadata || {}), lastUserMessageId: firstHealthyId, manifestNodeId: null };
                shouldReloadAfter = true;
              } else if (window.__ancOverrideParentId !== undefined) {
                const ov = window.__ancOverrideParentId;
                window.__ancOverrideParentId = undefined;
                uMsg.metadata = { ...(uMsg.metadata || {}), lastUserMessageId: ov, manifestNodeId: null };
                shouldReloadAfter = true;
              } else if (hasRejectedBannerOnPage()) {
                try {
                  const r = await origFetch('/api/chat/' + encodeURIComponent(chatId), { credentials: 'same-origin', cache: 'no-store' });
                  if (r.ok) {
                    const j = await r.json();
                    const healthyId = pickHealthyParent(j?.messages || [], window.__ancRejectedSet);
                    uMsg.metadata = { ...(uMsg.metadata || {}), lastUserMessageId: healthyId, manifestNodeId: null };
                    shouldReloadAfter = true;
                  }
                } catch {}
              }
              init = { ...init, body: JSON.stringify(parsed) };
              const res = await origFetch(input, init);
              if (res.ok && shouldReloadAfter) {
                setTimeout(() => { try { location.reload(); } catch {} }, 1800);
              }
              return res;
            }
          }
        } catch {}
        return origFetch(input, init);
      };
      wrappedFetch.__ancRescueWrapped = true;
      window.fetch = wrappedFetch;

      const scanRescueBanner = () => {
        if (!document.body) return;
        const chatM = /\/(?:chat|c|agent)\/([0-9a-f-]{20,})/i.exec(location.pathname);
        const chatId = chatM ? chatM[1] : '';
        const divs = document.body.querySelectorAll('div,p,span');
        for (const el of divs) {
          if (el.dataset?.ancRescue) continue;
          if (el.children.length > 2) continue;
          const t = String(el.textContent || '').trim();
          if (!/^The AI service rejected this request\./i.test(t)) continue;
          const box = el.closest('div') || el;
          if (box.dataset.ancRescue) continue;
          box.dataset.ancRescue = '1';
          const bar = mk('div', '', {});
          bar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,120,120,0.25);font-size:12px;';
          const tip = mk('span', '', { textContent: '死节点/工作区满载自救：' });
          tip.style.cssText = 'opacity:0.9;font-weight:600;';
          const mkBtn = (label, onClick) => {
            const b = mk('button', '', { type: 'button', textContent: label });
            b.style.cssText = 'padding:4px 10px;border-radius:6px;border:1px solid rgba(255,140,140,0.45);background:rgba(255,255,255,0.08);color:inherit;cursor:pointer;font-size:12px;font-weight:600;width:auto;height:auto;line-height:1.4;';
            b.onclick = onClick;
            return b;
          };
          const bRewind = mkBtn('⏪ 回退上一正常节点', async () => {
            if (!chatId) { tip.textContent = '请切回客户端模式执行回退'; return; }
            bRewind.disabled = true;
            try {
              const r = await origFetch('/api/chat/' + encodeURIComponent(chatId), { credentials: 'same-origin', cache: 'no-store' });
              const j = await r.json();
              const rej = (window.__ancRejectedSet ||= new Set());
              const cur = pickHealthyParent(j?.messages || [], rej);
              if (cur && bRewind.dataset.stepped === '1') {
                rej.add(cur);
              }
              bRewind.dataset.stepped = '1';
              const nextHealthy = pickHealthyParent(j?.messages || [], rej);
              window.__ancOverrideParentId = nextHealthy;
              tip.textContent = nextHealthy ? '✓ 已跳过死节点并回退至正常节点，请直接在下方输入框发消息' : '✓ 已回退至对话起点，请直接在下方输入框发消息';
            } catch {
              window.__ancOverrideParentId = null;
              tip.textContent = '✓ 已设为回退模式，请直接在下方输入框发消息';
            } finally {
              bRewind.disabled = false;
            }
          });
          const bReset = mkBtn('🧹 重置工作区救活（保留模型）', () => {
            window.__ancResetWsNext = true;
            tip.textContent = '✓ 已开启全新空工作区分支（保留当前模型），请在下方输入框随便发一句话即可救活！';
          });
          const bZip = mkBtn('📦 下载工作区 ZIP', async () => {
            if (!chatId) return;
            bZip.disabled = true;
            try {
              const r = await origFetch('/api/chat/' + encodeURIComponent(chatId) + '/workspace/latest?includeManifest=true', { credentials: 'same-origin' });
              const j = await r.json();
              if (j?.manifestNodeId && window.__ancDownloadUrl) {
                window.__ancDownloadUrl(location.origin + '/api/chat/' + encodeURIComponent(chatId) + '/workspace/' + encodeURIComponent(j.manifestNodeId) + '/download', '', 'application/zip');
                tip.textContent = '✓ 正在打包下载工作区 ZIP…';
              } else {
                tip.textContent = '当前对话暂无可下载的工作区文件';
              }
            } catch {
              tip.textContent = '读取工作区失败';
            } finally {
              bZip.disabled = false;
            }
          });
          bar.append(tip, bRewind, bReset, bZip);
          box.append(bar);
        }
      };
      setInterval(scanRescueBanner, 1200);
    } catch {}
  })();
  // Lightweight footer appears with the page; the full client footer replaces it once ready.
  let earlyFoot=null;
  if(window.__ancEarlyFooter){
    earlyFoot=mk('div');earlyFoot.id='__anc_webfoot_early';const footRoot=earlyFoot.attachShadow({mode:'closed'}),footSheet=new CSSStyleSheet();
    footSheet.replaceSync(`:host{all:initial}.early-foot{position:fixed;left:0;right:0;bottom:0;box-sizing:border-box;height:26px;padding:0 12px;display:flex;align-items:center;justify-content:space-between;background:${C.bg};color:${C.fg};border-top:1px solid ${C.line};font:11px system-ui,sans-serif;z-index:2147483646}`);footRoot.adoptedStyleSheets=[footSheet];
    const f=mk('div','early-foot');f.append(mk('span','',{textContent:'客户端信息载入中…'}),mk('span','',{textContent:'Brana '+window.__ancEarlyFooter.version}));footRoot.append(f);
  }
  const mount = () => {
    const r = document.documentElement; if (!r) return;
    if (!host.isConnected) r.appendChild(host);
    if(earlyFoot&&!document.getElementById('__anc_webfoot')){if(!earlyFoot.isConnected)r.appendChild(earlyFoot);r.style.setProperty('--anc-foot','26px');}else if(earlyFoot){earlyFoot.remove();earlyFoot=null;}
    pushPage(); sync(); skin?.();
  };
  mount();
  if(!document.documentElement){const ready=new MutationObserver(()=>{if(document.documentElement){ready.disconnect();mount();}});ready.observe(document,{childList:true});}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  let rafMount = 0;
  const scheduleMount = () => { if (!rafMount) rafMount = requestAnimationFrame(() => { rafMount = 0; mount(); }); };
  try { const mo = new MutationObserver(scheduleMount); const bindMo = () => { if (document.documentElement) mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'], childList: true, subtree: false }); if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'], childList: true, subtree: false }); }; bindMo(); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindMo, { once: true }); } catch {}
  setInterval(mount, 1200);
  addEventListener('resize', mount);
  window.visualViewport?.addEventListener('resize', mount);
  addEventListener('popstate', sync); addEventListener('hashchange', sync);
})();
