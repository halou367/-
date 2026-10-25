// Session dispatch popover: filter presets, target vendor selection, and batch concurrency controls
const GP_CSS = ".gachaPopover {\n  --gp-bg:#fff; --gp-fg:#242936; --gp-muted:#626d7f; --gp-line:#e2e6ed;\n  --gp-hover:#f0f2f6; --gp-field:#f8f9fb; --gp-track:#e2e6ed;\n  --gp-accent:#1c1c1e; --gp-accent-fg:#fff; --gp-accent-hover:#3a3a3c; --gp-danger:#ba3445; --gp-shadow:0 4px 18px #00000012,0 1px 3px #0000000b;\n  box-sizing:border-box; width:256px; max-width:calc(100vw - 24px); padding:10px;\n  border:1px solid var(--gp-line); border-radius:16px; background:var(--gp-bg); color:var(--gp-fg);\n  box-shadow:var(--gp-shadow); font:400 13px/1.45 -apple-system,BlinkMacSystemFont,\"Segoe UI\",system-ui,sans-serif;\n  color-scheme:light; text-align:left; -webkit-font-smoothing:antialiased;\n}\n.gachaPopover[data-theme=\"dark\"] {\n  --gp-bg:#23262c; --gp-fg:#eceef4; --gp-muted:#a4adbf; --gp-line:#3a404c;\n  --gp-hover:#2d3139; --gp-field:#1c1f25; --gp-track:#3a404c;\n  --gp-accent:#dcdcdc; --gp-accent-fg:#1c1c1e; --gp-accent-hover:#c6c6c6;\n  --gp-danger:#ff9da8; --gp-shadow:0 5px 24px #0003,0 1px 3px #0002; color-scheme:dark;\n}\n.gachaPopover *, .gachaPopover *::before, .gachaPopover *::after { box-sizing:border-box; }\n.gachaPopover [hidden] { display:none!important; }\n.gachaPopover button { appearance:none; display:inline-flex; align-items:center; justify-content:center; gap:5px; min-height:0; margin:0; border:0; padding:0; background:transparent; color:inherit; font:inherit; cursor:pointer; box-shadow:none; letter-spacing:normal; }\n.gachaPopover button:hover { background:var(--gp-hover); }\n.gachaPopover button:disabled { opacity:.45; cursor:not-allowed; }\n.gachaPopover :is(button,input,textarea,select):focus-visible { outline:2px solid var(--gp-accent); outline-offset:3px; }\n.gachaPopover .gpHeader { display:flex; gap:4px; align-items:center; }\n.gachaPopover .gpIcon { width:28px; height:28px; flex:0 0 28px; border-radius:7px; color:var(--gp-muted); }\n.gachaPopover .gpIcon svg { width:16px; height:16px; }\n.gachaPopover .gpTextIcon { font-family:Georgia,serif; font-size:15px; }\n.gachaPopover .gpClose { font-size:18px; width:22px; flex-basis:22px; }\n.gachaPopover .gpChosen { flex:1; min-width:0; display:flex; flex-direction:column; gap:0; padding:3px 4px; border-radius:8px; }\n.gachaPopover .gpChosen small { color:var(--gp-muted); font-size:10px; line-height:15px; font-weight:400; }\n.gachaPopover .gpChosen span { display:block; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; font-weight:600; }\n.gachaPopover .gpQuantity { margin:9px 0 8px; }\n.gachaPopover .gpRange { position:relative; height:26px; border-radius:20px; background:linear-gradient(to right,var(--gp-accent) 0%,var(--gp-accent) var(--gp-fill,75%),var(--gp-track) var(--gp-fill,75%),var(--gp-track) 100%); }\n.gachaPopover .gpDots { position:absolute; inset:0 12px; display:flex; align-items:center; justify-content:space-between; pointer-events:none; }\n.gachaPopover .gpDots i { width:4px; height:4px; border-radius:50%; background:var(--gp-muted); opacity:.6; }\n.gachaPopover .gpRange input { appearance:none; -webkit-appearance:none; display:block; position:absolute; inset:0; width:100%; height:26px; margin:0; padding:0; border:0; background:transparent; cursor:pointer; box-shadow:none; }\n.gachaPopover .gpRange input::-webkit-slider-runnable-track { height:26px; background:transparent; border:0; }\n.gachaPopover .gpRange input::-webkit-slider-thumb { appearance:none; -webkit-appearance:none; width:26px; height:26px; border-radius:50%; background:#fff; border:1px solid #00000008; box-shadow:0 1px 4px #0002; }\n.gachaPopover .gpRange input::-moz-range-track { background:transparent; height:26px; border:0; }\n.gachaPopover[data-theme=\"dark\"] .gpRange input::-webkit-slider-thumb { border-color:#0000002e; }\n.gachaPopover[data-theme=\"dark\"] .gpRange input::-moz-range-thumb { border:1px solid #0000002e; }\n.gachaPopover .gpRange input::-moz-range-thumb { width:25px; height:25px; border-radius:50%; border:0; background:#fff; box-shadow:0 1px 4px #0002; }\n.gachaPopover .gpTicks { display:flex; justify-content:space-between; margin:5px 4px 0; }\n.gachaPopover .gpTicks button { width:20px; height:18px; border-radius:4px; font-size:10px; color:var(--gp-muted); font-variant-numeric:tabular-nums; }\n.gachaPopover .gpTicks button[aria-pressed=\"true\"] { color:var(--gp-fg); font-weight:600; }\n.gachaPopover .gpFooter { display:flex; align-items:center; justify-content:space-between; gap:8px; }\n.gachaPopover .gpProgress { font-size:11px; color:var(--gp-muted); font-variant-numeric:tabular-nums; }\n.gachaPopover .gpPrimary { background:var(--gp-accent); color:var(--gp-accent-fg); padding:6px 12px; min-height:30px; border-radius:9px; font-size:12px; font-weight:500; white-space:nowrap; }\n.gachaPopover .gpPrimary:hover { background:var(--gp-accent-hover); }\n.gachaPopover .gpSecondary { border:1px solid var(--gp-line); border-radius:8px; padding:6px 10px; font-size:12px; }\n.gachaPopover .gpStatus { display:flex; align-items:center; gap:6px; margin-top:8px; font-size:11px; color:var(--gp-muted); min-width:0; }\n.gachaPopover .gpStatus::before { content:\"\"; width:5px; height:5px; flex:0 0 5px; border-radius:50%; background:currentColor; opacity:.55; }\n.gachaPopover .gpStatus span:last-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n.gachaPopover .gpMenu { margin:8px -5px 2px; padding:4px; border-radius:10px; background:var(--gp-bg); max-height:240px; overflow-y:auto; overscroll-behavior:contain; }\n.gachaPopover .gpCaption { color:var(--gp-muted); margin:0 6px 5px; font-size:11px; }\n.gachaPopover .gpOption { display:flex; width:100%; min-height:34px; padding:7px 9px; justify-content:space-between; border-radius:8px; font-size:12px; }\n.gachaPopover .gpOption span:first-child { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n.gachaPopover .gpOption[aria-checked=\"true\"] { background:var(--gp-hover); }\n.gachaPopover .gpSettings { margin-top:10px; padding-top:10px; border-top:1px solid var(--gp-line); }\n.gachaPopover label { display:grid; gap:5px; margin:0 0 10px; color:var(--gp-muted); font-size:11px; min-width:0; }\n.gachaPopover :is(textarea,input:not([type=\"range\"]):not([type=\"checkbox\"]),select) { display:block; width:100%; min-width:0; border:1px solid var(--gp-line); border-radius:8px; padding:7px 8px; background:var(--gp-field); color:var(--gp-fg); font:400 12px/1.5 -apple-system,BlinkMacSystemFont,\"Segoe UI\",system-ui,sans-serif; box-shadow:none; }\n.gachaPopover textarea { min-height:64px; resize:vertical; }\n.gachaPopover .gpModelsInput { min-height:112px; }\n.gachaPopover .gpRow { display:grid; grid-template-columns:1fr 1fr; gap:8px; }\n.gachaPopover .gpCheck { display:flex; align-items:center; gap:7px; font-size:11px; }\n.gachaPopover .gpCheck input { width:13px; height:13px; margin:0; accent-color:var(--amp-acc,#2f6fed); }\n.gachaPopover .gpHelp { font-size:11px; color:var(--gp-muted); margin:0 0 10px; line-height:1.55; }\n.gachaPopover .gpSaveRow { display:flex; justify-content:flex-end; }\n.gachaPopover .gpMessage { margin:8px 0 0; color:var(--gp-muted); font-size:11px; line-height:1.5; overflow-wrap:anywhere; }\n.gachaPopover .gpMessage[data-error=\"true\"] { color:var(--gp-danger); }\n.gachaPopover.gpModelNotice { width:300px; padding:14px; }\n.gachaPopover .gpNoticeHead { display:flex; align-items:center; justify-content:space-between; font-size:12px; font-weight:600; }\n.gachaPopover .gpModelTransition { margin:9px 0 6px; font-size:13px; font-weight:500; overflow-wrap:anywhere; }\n.gachaPopover .gpNoticeReason { margin:0; color:var(--gp-muted); font-size:11px; line-height:1.6; }\n@media(prefers-reduced-motion:no-preference) { .gachaPopover .gpRange { transition:background .12s; } }\n@media (pointer:coarse) {\n  .gachaPopover .gpIcon { width:32px; height:32px; flex-basis:32px; }\n  .gachaPopover .gpPrimary,.gachaPopover .gpSecondary { min-height:36px; }\n  .gachaPopover .gpOption { min-height:40px; }\n  .gachaPopover .gpTicks button { height:24px; width:28px; }\n}\n\n.panel{display:none;position:fixed;pointer-events:auto;max-height:calc(100dvh - 24px);overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain}.gachaPopover .choices,.gachaPopover .gpMenu{overflow:visible!important;overflow-x:visible!important;max-height:none!important}.panel.open{display:block}.launcher{display:none;position:fixed;pointer-events:auto;border:1px solid #8884;border-radius:8px;background:#fff;color:#333;height:32px;box-sizing:border-box;padding:0 8px;font:12px system-ui;align-items:center;justify-content:center;gap:5px;cursor:pointer}.launcher.show{display:inline-flex}.gpLog{margin:8px 0 0;max-height:132px;overflow:auto;font-size:11px;color:var(--gp-muted);line-height:1.5;border-top:1px solid var(--gp-line);padding-top:6px}.gpLog div{display:flex;gap:6px;white-space:nowrap}.gpLog time{flex:none;font-variant-numeric:tabular-nums;opacity:.8}.gpLog span{overflow:hidden;text-overflow:ellipsis}.gpLog [data-v=hit]{color:var(--gp-fg);font-weight:600}.gpLog [data-v=warn],.gpLog [data-v=error]{color:var(--gp-danger)}.gpOptRow{display:flex;align-items:center;gap:2px}.gpOptRow .gpOption{flex:1;min-width:0}.gpDel{width:26px;height:26px;flex:0 0 26px;border-radius:7px;color:var(--gp-muted);font-size:15px}.choices{max-height:320px!important}.gpAdd{display:flex;gap:6px;margin:6px 2px 2px}.gpAdd input{flex:1}.gpAdd .gpSecondary{flex:none}.gachaPopover{width:224px;padding:8px;border-radius:14px}.gachaPopover .gpHeader{gap:2px}.gachaPopover .gpIcon{width:26px;height:26px;flex-basis:26px}.gachaPopover .gpChosen{align-items:center;padding:2px 4px;line-height:1.2}.gachaPopover .gpChosen .gpCount{font-size:12px;font-weight:600;color:var(--amp-acc,#2f6fed);font-variant-numeric:tabular-nums;max-width:100%}.gachaPopover[data-theme=dark] .gpChosen .gpCount{color:var(--amp-acc-soft,#6ea0ff)}.gachaPopover .gpChosen .gpName{font-size:12px;font-weight:500;color:var(--gp-fg)}.gachaPopover .gpQuantity{display:flex;align-items:center;gap:6px;margin:7px 0 0}.gachaPopover .gpRange{flex:1;height:24px}.gachaPopover .gpRange{background:linear-gradient(to right,var(--amp-acc,#2f6fed) 0%,var(--amp-acc,#2f6fed) var(--gp-fill,75%),var(--gp-track) var(--gp-fill,75%),var(--gp-track) 100%)}.gachaPopover .gpRange input{height:24px}.gachaPopover .gpRange input::-webkit-slider-runnable-track{height:24px}.gachaPopover .gpRange input::-webkit-slider-thumb{width:24px;height:24px}.gachaPopover .gpRange input::-moz-range-thumb{width:23px;height:23px}.gachaPopover .gpDots i{background:#fff;opacity:.55}.gachaPopover .gpGo{flex:none;min-width:56px;height:24px;min-height:24px;padding:0 10px;border-radius:12px;font-size:11px;font-weight:700;letter-spacing:.06em}.gachaPopover .gpGo[data-a=start]{background:#6a5e54;color:#fff}.gachaPopover .gpGo[data-a=start]:hover{background:#5b5048}.gachaPopover .gpGo[data-a=stop]{background:var(--gp-danger);color:#fff}.gachaPopover .gpStatus{margin-top:6px;gap:5px}.gachaPopover .gpStatus span:first-child{flex:none}.gachaPopover .gpStatus .gpReset{margin-left:auto;font-size:10px;color:var(--gp-muted);padding:0 4px;border-radius:5px}.gachaPopover .gpIp{display:block;margin:7px 0 0;border:0;border-radius:8px;padding:6px 14px;background:#6a5e54;color:#fff;font:inherit;font-size:12px;font-weight:600;cursor:pointer}.gachaPopover .gpIp:hover{background:#5b5048}.gachaPopover .gpIp[disabled]{opacity:.6;cursor:wait}.gachaPopover .gpIp[hidden]{display:none}.gachaPopover .gpMessage{margin:6px 0 0;font-size:11px;line-height:1.45;color:var(--gp-muted)}.gachaPopover .gpMessage[data-error=true]{color:var(--gp-danger)}.gachaPopover .gpSettings{margin-top:8px;padding-top:8px}.gachaPopover label{margin-bottom:8px}.gachaPopover textarea{min-height:52px}.gachaPopover .gpModelsInput{min-height:84px}.gachaPopover .gpMenu{margin:6px -3px 0}.gachaPopover .gpOption{min-height:30px;padding:5px 8px;justify-content:flex-start;gap:8px}.gachaPopover .gpOption .gpMark{margin-left:auto;color:var(--amp-acc,#2f6fed)}.gachaPopover .gpName{display:inline-flex;align-items:center;gap:4px;max-width:100%;overflow:hidden}.gachaPopover .gpChosen span.gpName{display:inline-flex;align-items:center;justify-content:center;gap:4px}.gachaPopover .gpChosen .gpName span{display:inline-flex;align-items:center;max-width:none}.gachaPopover .gpRow2{display:grid;grid-template-columns:1fr 72px;gap:6px}.gachaPopover .gpSaveRow{display:flex;justify-content:flex-end}.gachaPopover .gpSecondary{padding:4px 10px;font-size:11px}.gachaPopover .gpHead{font-size:12px;color:var(--gp-fg);margin-bottom:6px}.gachaPopover .gpModelsInput{min-height:72px;margin-bottom:6px}.gachaPopover .choices{display:grid;grid-template-columns:1fr 1fr;gap:4px}.gachaPopover .choices .gpOption{border:1px solid var(--gp-line);border-radius:9px;transition:background .15s,color .15s,border-color .15s}.gachaPopover .choices .gpOption[data-on=true]{background:var(--amp-acc,#2f6fed);border-color:var(--amp-acc,#2f6fed);color:var(--amp-acc-fg,#fff)}.gachaPopover .choices .gpOption[data-on=true]:hover{background:color-mix(in srgb,var(--amp-acc,#2f6fed) 86%,#000)}.gachaPopover .gpCustom{display:flex;align-items:center;min-height:30px;border:1px solid var(--gp-line);border-radius:9px;overflow:hidden;background:var(--gp-field)}.gachaPopover .gpCustom[data-on=true]{border-color:var(--amp-acc,#2f6fed);background:var(--amp-acc,#2f6fed)}.gachaPopover .gpCustom input{flex:1;min-width:0;width:100%;height:28px;border:0;outline:0;background:transparent;padding:0 6px;font:inherit;font-size:12px;color:var(--gp-fg);box-shadow:none}.gachaPopover .gpCustom[data-on=true] input{color:var(--amp-acc-fg,#fff);font-weight:600}.gachaPopover .gpCustom input::placeholder{color:var(--gp-muted);font-weight:400}.gachaPopover .gpCustomGo{flex:none;width:24px;height:28px;font-size:12px;color:var(--gp-muted);border-radius:0}.gachaPopover .gpCustom[data-on=true] .gpCustomGo{color:var(--amp-acc-fg,#fff)}.gachaPopover .gpChips{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 6px;max-height:132px;overflow:auto}.gachaPopover .gpChip{padding:1px 7px;min-height:20px;border:1px solid var(--gp-line);border-radius:10px;font-size:11px;line-height:17px;background:var(--gp-field);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gachaPopover .gpChip:hover,.gachaPopover .gpChip[data-pending=true]{border-color:var(--gp-danger);color:var(--gp-danger);background:transparent}.gachaPopover .gpChipEmpty{font-size:11px;color:var(--gp-muted)}.gachaPopover .gpConfirm{display:flex;align-items:center;justify-content:space-between;gap:6px;margin:0 0 6px;padding:6px 8px;border:1px solid var(--gp-danger);border-radius:9px;font-size:11px}.gachaPopover .gpConfirm span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gachaPopover .gpConfirm div{display:flex;gap:4px;flex:none}.gachaPopover .gpDanger{background:var(--gp-danger)!important;color:#fff!important;border-color:var(--gp-danger)!important}.gachaPopover .gpAddRow{display:flex;gap:4px;align-items:flex-end}.gachaPopover .gpModelsInput.gpAddInput{flex:1;min-height:28px!important;height:28px;margin:0!important;resize:none;overflow:hidden;scrollbar-width:none;padding:5px 7px;font-size:12px;line-height:16px}.gachaPopover .gpAddRow .gpSecondary{flex:none;height:28px}@media (max-width:480px){.gachaPopover{width:208px}}@keyframes gpIn{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}.panel.open{animation:gpIn .2s cubic-bezier(.22,.9,.3,1);transform-origin:bottom right}.gachaPopover .gpGo,.gachaPopover .choices .gpOption,.gachaPopover .gpChip,.gachaPopover .gpIcon,.gachaPopover .gpChosen,.launcher{transition:transform .5s cubic-bezier(.22,.9,.3,1),background .15s,color .15s,border-color .15s}.gachaPopover .gpGo:not(:disabled):hover,.gachaPopover .choices .gpOption:not(:disabled):hover,.gachaPopover .gpChip:not(:disabled):hover,.gachaPopover .gpIcon:hover,.launcher:hover{transform:scale(1.07);transition:transform .28s cubic-bezier(.34,1.8,.5,1),background .15s,color .15s,border-color .15s}.gachaPopover .gpGo:not(:disabled):active,.gachaPopover .choices .gpOption:not(:disabled):active,.gachaPopover .gpChip:not(:disabled):active,.gachaPopover .gpIcon:active{transform:scale(.94);transition-duration:.08s}.gachaPopover .gpCustom{transition:border-color .15s,box-shadow .15s,background .15s}.gachaPopover .gpCustom:hover,.gachaPopover .gpCustom:focus-within{border-color:var(--amp-acc,#2f6fed);box-shadow:0 0 0 2px color-mix(in srgb,var(--amp-acc,#2f6fed) 22%,transparent)}.gachaPopover .gpCustom input{overflow:hidden}.gachaPopover .gpChip{animation:gpIn .22s ease-out both}.gachaPopover .choices .gpOption[data-on=true]{box-shadow:0 2px 10px color-mix(in srgb,var(--amp-acc,#2f6fed) 35%,transparent)}@media (prefers-reduced-motion:reduce){.panel.open,.gachaPopover *{animation:none!important;transition:none!important;transform:none!important}}";
const GP_GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m9 3-.6 2.3-2 .9-2.1-.6-2 3.4 1.6 1.7v2.6l-1.6 1.7 2 3.4 2.2-.6 1.9.9L9 21h4l.6-2.3 2-.9 2.1.6 2-3.4-1.6-1.7v-2.6L19.7 9l-2-3.4-2.2.6-1.9-.9L13 3Z"/><circle cx="11" cy="12" r="3"/></svg>';
const GP_HTML = '<div class="gpHeader"><button type="button" class="gpIcon" data-ui="models" title="归档设置" aria-label="归档设置">' + GP_GEAR + '</button><button type="button" class="gpChosen" data-ui="choose" aria-label="选择目标模型" aria-haspopup="menu"><span class="gpCount" data-s="count">20张</span><span class="gpName"><span data-s="vicon"></span><span data-s="chosen">不限</span></span></button><button type="button" class="gpIcon gpTextIcon" data-ui="text" title="提示词与选项" aria-label="提示词与选项">T</button></div>'
  + '<div class="gpMenu choices" role="menu" aria-label="选择目标模型" hidden></div>'
  + '<div class="gpSettings modelEditor" hidden><label class="gpCheck gpHead"><input type="checkbox" data-k="archiveOn">归档黑名单</label><label class="gpCheck gpSync" title="勾选后所有账号共用这一份黑名单：在任何一个账号里增删关键词、开关，全部账号同步"><input type="checkbox" data-k="archSync">所有账号同步黑名单</label><div class="gpChips" data-s="chips"></div><div class="gpConfirm" data-s="confirm" hidden><span data-s="confirmText"></span><div><button type="button" class="gpSecondary" data-ui="confirmNo">取消</button><button type="button" class="gpSecondary gpDanger" data-ui="confirmYes">删除</button></div></div><div class="gpAddRow"><textarea class="gpModelsInput gpAddInput" data-ui="archiveLines" rows="1" placeholder="输入关键词，换行可一次添加多个"></textarea><button type="button" class="gpSecondary" data-ui="saveModels">添加</button></div></div>'
  + '<div class="gpSettings advanced" hidden><div class="gpModeRow"><span>抽卡模式</span><button type="button" class="gpInfo" data-ui="modeHelp" title="SVG：随机多语言鹈鹕指令。自定义：四位数前缀+提示词。指纹：默认1条，首次命中优选名单才测满3条，不追加SVG；每条最多180秒、超过目标+4或循环时停止；命中归档黑名单且≥95%直接停。动态题不进入固定题个人库，百分比非真实身份概率。" aria-label="抽卡模式说明" aria-expanded="false">i</button></div><p class="gpHelp" data-s="modeHelp" hidden>SVG：随机多语言鹈鹕指令。自定义：四位数前缀+提示词。指纹：默认1条，首次命中优选名单才测满3条，不追加SVG；每条最多180秒、超过目标+4或循环时停止；命中归档黑名单且≥95%直接停。动态题不进入固定题个人库，百分比非真实身份概率。</p><label class="gpModeSel"><select data-k="mode" aria-label="抽卡模式"><option value="habit">习惯速测 · 鹈鹕识别</option><option value="autoqa">自动问答 · 智能反推</option><option value="custom">自定义 · 四位数前缀</option></select></label><label data-ui="preferred">优选名单（逗号或换行分隔）<textarea data-k="preferredKeywords" rows="2" maxlength="4000"></textarea></label><label class="gpCheck" title="默认开启，仅抽卡：出现有实际内容的 Thinking 思考区即停止并跳过，确认停止后自动归档（不删除），不据此判断厂商；普通聊天和手动测指纹不受影响"><input type="checkbox" data-k="skipCompatThinking">出现可见思考即归档换下一抽（默认开）</label><div class="gpRow2"><label data-ui="promptRow">提示词<input data-k="prompt" maxlength="4000"></label><label>间隔 秒<input data-k="intervalSec" type="number" min="0" max="86400" step=".1" inputmode="decimal" title="两抽之间至少等待的秒数（0–86400），改完即保存"></label></div><div class="gpSaveRow"><button type="button" class="gpLink" data-ui="moreSet" title="老虎机、回复中途 Thinking 停止、目标厂商置顶、侧栏只显示目标厂商、指纹库：在 模型信息 → 设置 → 抽卡">更多设置 ›</button><span class="gpAuto dim" data-ui="autoSaved" aria-live="polite"></span></div><div class="gpLog" data-s="log" hidden></div></div>'
  + '<div class="gpQuantity"><div class="gpRange"><div class="gpDots" aria-hidden="true"><i></i><i></i><i></i><i></i></div><input type="range" min="0" max="3" step="1" aria-label="抽卡张数（最右 = ∞ 持续）" data-ui="quantity"></div><button type="button" class="gpPrimary gpGo" data-a="start">START</button><button type="button" class="gpPrimary gpGo" data-a="stop" hidden>STOP</button></div>'
  + '<div class="gpStatus" role="status" hidden><span data-s="status"></span><span data-s="model"></span><button type="button" class="gpReset" data-a="reset" hidden>清除</button></div><p class="gpMessage" data-s="reason" role="status" hidden></p><button type="button" class="gpIp" data-a="ipok" hidden>我已更换 IP</button><button type="button" class="gpIp" data-a="captcha" hidden>完成验证</button>';
// 客户端补充：测过的型号 / 目标强度 / 推理分排行入口（和油猴面板同一风格）
const GP_EXTRA_CSS = '.gachaPopover .gpModeRow{display:flex;align-items:center;gap:5px}.gachaPopover .gpInfo{width:15px;height:15px;min-height:0;border-radius:50%;border:1px solid var(--gp-muted);color:var(--gp-muted);font:italic 600 10px/1 Georgia,serif}.gachaPopover .gpInfo[aria-expanded=true]{background:var(--gp-fg);color:var(--gp-bg);border-color:var(--gp-fg)}.gachaPopover .gpModeSel{margin-top:2px}.gachaPopover .gpRow2 label[hidden]+label{grid-column:1/-1}.gachaPopover .gpSaveRow{display:flex;align-items:center;justify-content:space-between}.gachaPopover .gpLink{font-size:11.5px;color:var(--gp-muted);padding:3px 4px;border-radius:6px}.gachaPopover .gpLink:hover{color:var(--gp-fg)}'
  + '.gachaPopover .gpSync{font-size:11.5px;color:var(--gp-muted);margin:-2px 0 2px 2px}'
  + '.panel{position:fixed;pointer-events:auto;max-height:calc(100dvh - 24px);overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;animation:gpIn .2s cubic-bezier(.22,.9,.3,1);transform-origin:bottom right}'
  + '.gachaPopover .gpX{grid-column:1/-1;display:flex;flex-direction:column;gap:4px;margin-top:4px}.gachaPopover .gpSub{display:flex;align-items:center;font-size:11px;color:var(--gp-muted);margin:2px 2px 0}.gachaPopover .gpSub a{margin-left:auto;cursor:pointer;color:var(--gp-muted);text-decoration:underline;text-underline-offset:2px}.gachaPopover .gpSub a:hover{color:var(--gp-fg)}'
  + '.gachaPopover .gpX .gpChips{margin:0}.gachaPopover .gpChip[data-on=true]{background:var(--amp-acc);border-color:var(--amp-acc);color:var(--amp-acc-fg)}.gachaPopover .gpChip .gpVIcon{vertical-align:-2px;margin-right:3px}'
  + '.gachaPopover .gpSeg{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--gp-line);border-radius:9px;overflow:hidden}.gachaPopover .gpSeg button{min-height:26px;font-size:11px;border-right:1px solid var(--gp-line)}.gachaPopover .gpSeg button:last-child{border-right:0}.gachaPopover .gpSeg button[data-on=true]{background:var(--amp-acc);color:var(--amp-acc-fg);font-weight:600}.gachaPopover .gpSeg button:disabled{opacity:.55}';

Object.assign(GPop, {
  host: null, root: null, anchor: null, target: null, tid() { return this.target?.id || null; }, section: null, message: '', msgErr: false, pendingDel: null, logStamp: '',
  $(s) { return this.root?.querySelector(s); },
  field(k) { return this.$('[data-k="' + k + '"]'); },
  editing(k) { const f = this.field(k); return !!f && (this.root?.activeElement === f || document.activeElement === f); },
  text(k, v) { const e = this.$('[data-s="' + k + '"]'); if (e) e.textContent = v; },
  isOpen() { return !!this.host?.isConnected; },
  // 账号还在连接 / 核对登录（冷启动时选择页先出来）：等连上后自动开始，不用再点一次
  async startWhenReady() {
    if (this._waitStart) return; this._waitStart = true;
    try {
      this.say('正在连接这个账号，连上后自动开始抽卡…');
      const t0 = now(); while (!UI.me && !UI.authed && now() - t0 < 120e3) await sleep(400);
      if (!UI.me) { if (this.isOpen()) this.say(UI.authed ? '这个账号还没登录，请先登录' : '账号一直连不上，请检查网络 / IP 后再试', true); return; }
      const r = Gacha.start(); if (!this.isOpen()) return; if (!r.ok) this.say(r.error || '无法开始', true); else this.close();
    } finally { this._waitStart = false; }
  },
  toggle(b) { if (this.isOpen()) { this.close(); return; } this.open(b); },
  // 从任意入口打开（Ctrl+G / 底栏抽卡进度 / 推理分排行）：锚在输入框旁的抽卡按钮上
  openAny() {
    const curChat = (typeof Tabs !== 'undefined' && Tabs.cur?.sid && typeof Chats !== 'undefined') ? Chats.get(Tabs.cur.sid) : null;
    const isBattle = curChat
      ? Boolean((curChat.isEvaluation && curChat.evalMode === 'battle') || (typeof EvalView !== 'undefined' && EvalView.isBattleChat?.(curChat)))
      : (typeof ModeState !== 'undefined' && typeof ModeState.getMode === 'function' && ModeState.getMode() === 'battle');
    if (isBattle) { this.close(); return; }
    let b = [...document.querySelectorAll('.gbtn2:not([data-acct])')].find(x => x.getBoundingClientRect().width);
    if (!b) { Tabs.newChat(); setTimeout(() => { const x = [...document.querySelectorAll('.gbtn2:not([data-acct])')].find(y => y.getBoundingClientRect().width); if (x) this.open(x); }, 120); return; }
    if (!this.isOpen()) this.open(b);
  },
  close() { clearTimeout(this._bindTimer);this._bindTimer=0;this._resize?.disconnect();this._resize=null;this.host?.remove(); this.host = null; this.root = null; document.removeEventListener('mousedown', this._out, true); document.removeEventListener('keydown', this._esc, true); },
  open(b) {
    this.close();
    const host = h('div', { id: 'gpop', style: { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: b?.closest?.('.lpick') ? '3100' : b?.closest?.('.asheet-back') ? '2100' : '70' } });   // 从手机账号面板里打开：要盖在面板上面
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>:host{all:initial}' + GP_CSS + GP_EXTRA_CSS + '</style><section class="gachaPopover panel open" role="dialog" aria-label="抽卡设置">' + GP_HTML + '</section>';
    // 从账号菜单打开（其他账号）：面板操作的是那个账号的后台抽卡和它自己的设置（张数 / 厂商 / 黑名单 / 提示词各账号独立）
    this.target = b?.dataset?.acct && b.dataset.cur !== '1' ? { id: b.dataset.acct, name: b.dataset.name || '账号' } : null;
    document.body.append(host); this.host = host; this.root = root; this.anchor = b; this._pos = 0; this.section = null; this.message = ''; this.pendingDel = null; this.logStamp = '';
    this.theme(); this.load(); this.wire(); this.fill(); this.position();
    // 其他账号：从宿主读那个账号自己的抽卡设置，读到后刷新面板
    if (this.target) { const id = this.target.id; Gacha.loadAcct(id).then(() => { if (this.isOpen() && this.target?.id === id && !this.root.activeElement?.matches?.('input,textarea')) { this.load(); this.fill(); this.section && this.show(this.section); } }); }
    this._out = e => { if (!this.host) return; const p = e.composedPath(); if (p.includes(this.host) || (this.anchor && p.includes(this.anchor))) return; this.close(); };
    this._esc = e => { if (e.key === 'Escape' && this.isOpen()) { e.stopPropagation(); this.close(); } };
    this._bindTimer=setTimeout(() => { this._bindTimer=0;if(this.host!==host)return;document.addEventListener('mousedown', this._out, true); document.addEventListener('keydown', this._esc, true); }, 0);
    try { this._resize=new ResizeObserver(() => {if(this.host===host)this.position();});this._resize.observe(this.$('.panel')); } catch {}
  },
  // 颜色跟随客户端主题和输入框底色（和油猴脚本的做法一样）；强调色用原色（深浅各一套）
  theme() {
    const pop = this.$('.gachaPopover'); if (!pop) return;
    const dark = document.documentElement.dataset.theme === 'dark'; pop.dataset.theme = dark ? 'dark' : 'light';
    let bg = dark ? '#2c2b28' : '#fff';
    for (let n = document.querySelector('.cbox'); n && n !== document.body; n = n.parentElement) { const m = getComputedStyle(n).backgroundColor.match(/rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); if (p.length < 4 || p[3] > 0.5) { bg = getComputedStyle(n).backgroundColor; break; } } }
    const set = (k, v) => pop.style.setProperty(k, v);
    set('--gp-bg', bg); set('--amp-acc', dark ? '#d8d3ca' : '#6a5e54'); set('--amp-acc-fg', dark ? '#262522' : '#fff'); set('--amp-acc-soft', dark ? '#e4dfd6' : '#6a5e54');
    if (dark) { set('--gp-fg', '#ecebe7'); set('--gp-muted', '#a9a59d'); set('--gp-line', 'color-mix(in srgb,' + bg + ',#fff 12%)'); set('--gp-hover', 'color-mix(in srgb,' + bg + ',#fff 7%)'); set('--gp-field', 'color-mix(in srgb,' + bg + ',#000 18%)'); set('--gp-track', 'color-mix(in srgb,' + bg + ',#fff 14%)'); }
  },
  position() {
    const panel = this.$('.panel'); if (!panel) return;
    // 列表 / 面板重绘把锚点按钮换成了新元素：找同一个账号的新按钮接着用，不要关掉弹窗
    if (this.anchor && !this.anchor.isConnected) { const a = this.anchor, nb = [...document.querySelectorAll('.gbtn2')].find(b => b.isConnected && b.dataset.acct === a.dataset.acct && b.dataset.cur === a.dataset.cur && b.getBoundingClientRect().width); if (nb) this.anchor = nb; }
    const r = this.anchor?.isConnected && this.anchor.getBoundingClientRect().width ? this.anchor.getBoundingClientRect() : null;
    if (!r) { if (this.anchor?.isConnected || !this._pos) { this.close(); return; } return; }
    this._pos = 1;
    panel.style.width = Math.min(256, innerWidth - 24) + 'px'; panel.style.maxHeight = Math.max(120, innerHeight - 24) + 'px';
    if (typeof placeInward === 'function') { placeInward(panel, r, { pad: 12, gap: 8, keepWidth: true }); } else {
      const box = panel.getBoundingClientRect();
      panel.style.left = Math.max(12, Math.min(r.right - box.width, innerWidth - box.width - 12)) + 'px';
      const above = r.top - box.height - 8;
      panel.style.top = Math.max(12, Math.min(above >= 12 ? above : r.bottom + 8, innerHeight - box.height - 12)) + 'px';
    }
  },
  show(next) {
    const secs = { choose: '.choices', models: '.modelEditor', text: '.advanced' };
    this.section = this.section === next ? null : next;
    for (const [name, sel] of Object.entries(secs)) { this.$(sel).hidden = name !== this.section; this.$('[data-ui="' + name + '"]').setAttribute('aria-expanded', String(name === this.section)); }
    if (this.section === 'models') { this.$('[data-ui="archiveLines"]').value = ''; const s0 = Gacha.settings(this.tid()); this.field('archiveOn').checked = s0.archiveOn; this.field('archSync').checked = s0.archSync; this.pendingDel = null; this.chips(); Gacha.pullBl().then(() => { if (this.section !== 'models') return; const s1 = Gacha.settings(this.tid()); this.field('archiveOn').checked = s1.archiveOn; this.field('archSync').checked = s1.archSync; this.chips(); }).catch(() => {}); }
    if (this.section === 'choose') this.choices();
    if (this.section === 'text') this.load();
    this.position();
  },
  // 当前面板对应的抽卡状态：本窗口 = Gacha.run；其他账号 = 宿主转来的进度
  run() {
    if (!this.target) return Gacha.run;
    const g = GPop.acctState(this.target.id, false), s = Gacha.settings(this.tid());
    if (!g.busy && !g.done && !g.err && !g.log.length) return null;
    return { status: g.busy ? 'running' : g.err ? 'stopped' : g.status && g.status !== 'running' ? g.status : 'done', code: g.err ? 'REMOTE' : null, reason: g.err, completed: g.done, phase: g.phase,
      settings: { ...s, endless: g.total === '∞', maxAttempts: g.total === '∞' ? s.maxAttempts : +g.total || s.maxAttempts }, attempts: g.log, hits: [] };
  },
  busy() { return this.target ? !!GPop.acctState(this.target.id, false).busy : Gacha.busy(); },
  async remoteCmd(cmd) {
    const t = this.target; if (!t) return;
    if (!Host.gachaAccount && Host.gachaSwitch) {
      if (cmd !== 'start') { this.say('这个账号没有在抽卡'); return; }
      if (Gacha.busy() && !(await Dialog.confirm({ title: '切换账号抽卡', text: '此设备不能多个账号同时在后台运行：切换到「' + t.name + '」后，当前账号的抽卡会暂停（持续抽卡回来后会自动继续）。', ok: '切换并开始' }))) return;
      this.close(); toast('正在切换到 ' + t.name + '，载入后自动开始抽卡');
      const r = await Host.gachaSwitch(t.id).catch(err => ({ error: err.message })); if (r?.error) toast(r.error, 'err');
      return;
    }
    const r = await Host.gachaAccount(t.id, cmd).catch(err => ({ error: err.message }));
    if (r?.error) { this.say(r.error, true); return; }
    const old = GPop.remote.get(t.id) || {};
    GPop.remote.set(t.id, cmd === 'start' ? { busy: true, done: 0, total: Gacha.settings(this.tid()).endless ? '∞' : Gacha.settings(this.tid()).maxAttempts, phase: '后台启动中', at: now() } : { ...old, busy: false, phase: '', status: 'stopped', at: now() });
    if (cmd === 'start') toast(t.name + '：已在后台开始抽卡');
    this.fill(); document.querySelectorAll('.gacct[data-acct="' + t.id + '"]').forEach(b => GPop.paintAcct(b, GPop.acctState(t.id, false)));
  },
  say(m, err = false) { this.message = m; this.msgErr = err; this.fill(); },
  load() {
    const s = Gacha.settings(this.tid());
    this.field('skipCompatThinking').checked = s.skipCompatThinking;
    this.field('mode').value=s.mode;this.field('mode').disabled=this.busy();
    this.$('[data-ui="preferred"]').hidden=!s.fingerprint;if(!this.editing('preferredKeywords'))this.field('preferredKeywords').value=s.preferredKeywords.join('\n');
    this.field('prompt').disabled = s.mode !== 'custom'; this.$('[data-ui="promptRow"]').hidden = s.mode !== 'custom';   // 只有「自定义」模式才需要填提示词
    if (!this.editing('prompt')) this.field('prompt').value = s.fingerprint ? 'Automatic English integer prompts (1 or 3 rounds).' : s.mode === 'habit' ? '两阶段全自动识别：先发送简短测试（测出或路由开源自动暂停并归档删除），闭源模型自动进行二阶段鹈鹕测试（二阶段若路由开源同样自动暂停并归档删除）。' : s.mode === 'autoqa' ? '首轮两步微缩探针 + 习惯/反推双引擎锁定（开启 /cost 同价并列时最多追问至 3 轮）。' : s.mode === 'svg' ? 'A new English pelican SVG animation prompt is generated for every draw.' : s.prompt; if (!this.editing('intervalSec')) this.field('intervalSec').value = String(s.intervalMs / 1000);
    this.field('archiveOn').checked = s.archiveOn; this.field('archSync').checked = s.archSync;
  },
  chips() {
    const s = Gacha.settings(this.tid()), box = this.$('[data-s="chips"]'), locked = this.busy(); box.replaceChildren();
    for (const k of s.archiveKeywords) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'gpChip'; b.textContent = k; b.title = '点击删除“' + k + '”'; b.disabled = locked; b.dataset.pending = String(this.pendingDel === k);
      b.onclick = () => { this.pendingDel = k; this.chips(); }; box.append(b);
    }
    if (!s.archiveKeywords.length) { const e = document.createElement('span'); e.className = 'gpChipEmpty'; e.textContent = '黑名单为空'; box.append(e); }
    this.$('[data-s="confirm"]').hidden = !this.pendingDel; if (this.pendingDel) this.text('confirmText', '删除“' + this.pendingDel + '”？');
    this.position();
  },
  // 目标厂商：GPT / Claude / Gemini / Grok / Kimi + 自定义关键词（两列三行）；再点一次 = 取消（不限）
  choices() {
    const s = Gacha.settings(this.tid()), box = this.$('.choices'), locked = false; box.replaceChildren();   // 抽卡中也能换厂商：只改侧栏排序，这一轮抽卡的目标不变
    for (const v of Gacha.VENDORS) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'gpOption'; b.setAttribute('role', 'menuitemcheckbox');
      const on = v.id === s.vendor; b.dataset.on = String(on); b.title = v.lab + ' · 名称含 ' + v.kw.join('/') + (on ? ' · 再次点击取消' : '');
      b.innerHTML = VIcon.html(v.id, 15) + '<span></span>'; b.children[1].textContent = v.name;
      b.disabled = locked; b.onclick = () => { Gacha.setVendor(on ? '' : v.id, '', this.tid()); this.after(); };
      box.append(b);
    }
    const wrap = document.createElement('div'); wrap.className = 'gpCustom'; const on = s.vendor === 'custom'; wrap.dataset.on = String(on);
    const inp = document.createElement('input'); inp.type = 'text'; inp.maxLength = 60; inp.placeholder = '自定义关键词'; inp.value = s.customKeyword || ''; inp.disabled = locked;
    const go = document.createElement('button'); go.type = 'button'; go.className = 'gpCustomGo'; go.disabled = locked; go.textContent = on ? '✓' : '↵'; go.title = on ? '点击取消自定义关键词' : '启用自定义关键词';
    const apply = () => { const k = inp.value.trim(); if (!k) Gacha.setVendor('', '', this.tid()); else if (on && k === s.customKeyword) Gacha.setVendor('', '', this.tid()); else Gacha.setVendor('custom', k, this.tid()); this.after(); };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }; go.onclick = apply;
    wrap.append(inp, go); box.append(wrap);
    // 测过的型号 + 目标强度
    const x = document.createElement('div'); x.className = 'gpX';
    const models = StrPick.models(8);
    const sub = (t, link) => { const d = document.createElement('div'); d.className = 'gpSub'; d.textContent = t; if (link) { const a = document.createElement('a'); a.textContent = '推理分排行 ↗'; a.onclick = () => { this.close(); Tabs.openPower(); }; d.append(a); } return d; };
    x.append(sub(models.length ? '测过的型号' : '型号', true));
    if (models.length) {
      const c = document.createElement('div'); c.className = 'gpChips';
      for (const m of models) { const b = document.createElement('button'); b.type = 'button'; b.className = 'gpChip'; const onM = s.vendor === 'custom' && s.customKeyword.toLowerCase() === m.fam.toLowerCase(); b.dataset.on = String(onM); b.disabled = locked; b.title = onM ? '再次点击取消' : '只抽 ' + m.fam; b.innerHTML = m.vid ? VIcon.html(m.vid, 11) : ''; b.append(cardName(m.fam)); b.onclick = () => { Gacha.setVendor(onM ? '' : 'custom', m.fam, this.tid()); this.after(); }; c.append(b); }
      x.append(c);
    }
    x.append(sub('目标强度'));
    const seg = document.createElement('div'); seg.className = 'gpSeg';
    for (const [k, l, tip] of StrPick.STR) { const b = document.createElement('button'); b.type = 'button'; b.textContent = l; b.title = tip; b.dataset.on = String((s.minStr || '') === k); b.disabled = locked; b.onclick = () => { Gacha.save({ minStr: k }, this.tid()); this.after(); }; seg.append(b); }
    x.append(seg);
    box.append(x);
  },
  after() { if (this.section === 'choose') this.choices(); this.fill(); document.querySelectorAll('.gbtn2:not([data-acct])').forEach(b => this.paint(b)); document.querySelectorAll('.gacct').forEach(b => GPop.paintAcct(b, GPop.acctState(b.dataset.acct, b.dataset.cur === '1'))); UI.renderList(); },
  wire() {
    const $ = s => this.$(s);
    $('[data-ui="choose"]').onclick = () => this.show('choose');
    $('[data-ui="models"]').onclick = () => this.show('models');
    $('[data-ui="text"]').onclick = () => this.show('text');
    $('[data-ui="quantity"]').oninput = e => { const v = +e.target.value, Q = Gacha.QUANTITIES; Gacha.save(v >= Q.length ? { endless: true } : { maxAttempts: Q[v] || Q[1], endless: false }, this.tid()); this.load(); this.fill(); };
    $('[data-a="start"]').onclick = () => { this.message = ''; if (this.target) { void this.remoteCmd('start'); this.close(); return; } if (!UI.me && !UI.authed) { void this.startWhenReady(); return; } const r = Gacha.start(); if (!r.ok) this.say(r.error || '无法开始', true); else this.close(); };   // 点 START 就收起抽卡面板（进度看按钮上的进度环）
    $('[data-a="stop"]').onclick = () => { if (this.target) { void this.remoteCmd('stop'); return; } Gacha.stop(); this.fill(); };
    $('[data-a="reset"]').onclick = () => { Gacha.reset?.(); this.message = ''; this.fill(); };
    $('[data-a="ipok"]').onclick = async e => { e.target.disabled = true; e.target.textContent = '正在检查…'; const x = await Gacha.ipRetry(); if (!x.ok) this.say(x.error, true); this.fill(); };
    $('[data-a="captcha"]').onclick = () => Gacha.solveCaptcha().catch(err => this.say(err.message, true));
    // 优选名单 / 提示词 / 间隔：改了就保存并立即生效（不再需要「保存」按钮）
    const saveText = () => {
      clearTimeout(this.txtT); this.txtT = 0;
      const cur = Gacha.settings(this.tid()), raw = String(this.field('intervalSec').value).trim(), sec = raw === '' ? NaN : +raw;
      const patch = { preferredKeywords: GachaPrompts.keywords(this.field('preferredKeywords').value) };
      if (cur.mode === 'custom') patch.prompt = this.field('prompt').value.trim() || Gacha.DEFAULTS.prompt;
      if (Number.isFinite(sec)) patch.intervalMs = Math.round(Math.max(0, Math.min(86400, sec)) * 1000);   // 空着/输入到一半时不改间隔
      Gacha.save(patch, this.tid());
      const t = this.$('[data-ui="autoSaved"]'); if (t) { t.textContent = '已自动保存'; clearTimeout(this.savedT); this.savedT = setTimeout(() => { t.textContent = ''; }, 1600); }
    };
    this.saveText = saveText;
    for (const k of ['preferredKeywords', 'prompt', 'intervalSec']) {
      const f = this.field(k);
      f.oninput = () => { clearTimeout(this.txtT); this.txtT = setTimeout(saveText, 600); };
      f.onchange = saveText;
      f.onblur = () => { if (this.txtT) saveText(); setTimeout(() => this.fill(), 0); };   // 离开输入框后显示规范化后的值
      if (k === 'intervalSec') f.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); saveText(); f.blur(); } };
    }
    this.$('[data-ui="modeHelp"]').onclick = e => { const p = this.$('[data-s="modeHelp"]'); p.hidden = !p.hidden; e.currentTarget.setAttribute('aria-expanded', String(!p.hidden)); };
    this.$('[data-ui="moreSet"]').onclick = () => { try { this.close?.(); } catch {} Dock.tab = 'settings'; Dock.toggle(true, 'settings'); setTimeout(() => document.querySelector('#dock .st-gacha')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 120); };
    this.field('skipCompatThinking').onchange = e => { Gacha.save({ skipCompatThinking: e.target.checked }, this.tid()); this.fill(); };
    this.field('mode').onchange = e => { if (this.busy()) return; Gacha.save({mode:e.target.value},this.tid());this.load();this.fill(); };
    this.field('archiveOn').onchange = e => Gacha.save({ archiveOn: e.target.checked }, this.tid());
    this.field('archSync').onchange = async e => { const on = e.target.checked; await Gacha.setSync(on, this.tid()); const s = Gacha.settings(this.tid()); this.field('archiveOn').checked = s.archiveOn; this.chips(); this.say(on ? '已开启：所有账号共用这份黑名单' : '已关闭：各账号保留当前这份黑名单，之后各改各的'); };
    $('[data-ui="confirmNo"]').onclick = () => { this.pendingDel = null; this.chips(); };
    $('[data-ui="confirmYes"]').onclick = () => { const k = this.pendingDel; this.pendingDel = null; if (k) Gacha.save({ archiveKeywords: Gacha.settings(this.tid()).archiveKeywords.filter(x => x !== k) }, this.tid()); this.chips(); };
    const ta = $('[data-ui="archiveLines"]');
    ta.oninput = () => { ta.style.height = '28px'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; this.position(); };
    $('[data-ui="saveModels"]').onclick = () => { const add = ta.value.split(/[\n,，]+/).map(x => x.trim()).filter(Boolean); if (!add.length) return; Gacha.save({ archiveKeywords: [...Gacha.settings(this.tid()).archiveKeywords, ...add] }, this.tid()); ta.value = ''; ta.style.height = '28px'; this.chips(); };
  },
  fill() {
    if (!this.isOpen()) return;
    const Q = Gacha.QUANTITIES, s = Gacha.settings(this.tid()), st = this.run(), active = this.busy();
    const cfg = active && st?.settings ? { ...s, ...st.settings } : s;
    const endless = active ? !!st.settings.endless : s.endless;
    const idx = endless ? Q.length : Math.max(0, Q.indexOf(active ? st.settings.maxAttempts : s.maxAttempts));
    const slider = this.$('[data-ui="quantity"]'); slider.value = String(idx); this.$('.gpRange').style.setProperty('--gp-fill', 'calc(12px + (100% - 24px) * ' + idx / Q.length + ')');
    this.text('count', endless ? '∞ 持续' : (Q[idx] || s.maxAttempts) + '张');
    const vend = Gacha.vendorBy(cfg.vendor), customOn = cfg.vendor === 'custom' && cfg.customKeyword;
    this.text('chosen', (vend ? vend.name : customOn ? cfg.customKeyword : '不限') + (s.minStr ? ' · ' + (s.minStr === 'top' ? '≥xhigh' : '>medium') : '') + (s.csMode ? ' · 强度分' + (s.csMode === 'keep' ? '≥' + s.csKeep : '≥' + s.csOk) : ''));
    const vi = this.$('[data-s="vicon"]'), vk = vend ? vend.id : ''; if (vi.dataset.v !== vk) { vi.dataset.v = vk; vi.innerHTML = vend ? VIcon.html(vend.id, 13) : ''; }
    this.root.querySelectorAll('[data-k="prompt"],[data-k="intervalSec"],[data-ui="quantity"],[data-ui="archiveLines"],[data-ui="saveModels"],.modelEditor .gpChip,[data-ui="confirmYes"]').forEach(n => n.disabled = active || (n.dataset.k === 'prompt' && s.mode !== 'custom'));
    this.field('mode').disabled=active;this.field('preferredKeywords').disabled=active;
    const start = this.$('[data-a="start"]'), stop = this.$('[data-a="stop"]'), reset = this.$('[data-a="reset"]');
    const ipb = this.$('[data-a="ipok"]'), ipOn = !this.target && !active && Gacha.ipLimited(); ipb.hidden = !ipOn; if (!ipOn) { ipb.disabled = false; ipb.textContent = '我已更换 IP'; }
    this.$('[data-a="captcha"]').hidden = !!this.target || !Gacha.capOffer();
    start.hidden = active; stop.hidden = !active; stop.disabled = st?.status === 'stopping'; reset.hidden = active || !st || !!this.target;
    start.title = this.target ? '在后台抽「' + this.target.name + '」（不打开窗口，每次都从 0 开始）' : '开始抽卡（每次都从 0 开始）';
    const total = st ? (st.settings?.endless ? '∞' : st.settings.maxAttempts) : s.maxAttempts, done = st?.completed || 0;
    if (active) this.text('count', done + ' / ' + total + '张');
    const label = !st ? '' : active ? (st.status === 'stopping' ? '正在停止' : st.phase || '抽卡中') : ({ paused: '已停止', stopped: '已停止', hit: '已命中目标', done: '已完成' }[st.status] || st.status || '');
    this.text('status', (this.target ? this.target.name + ' · ' : '') + (label || (this.target ? '后台抽卡' : '')) + (st && !active && ['paused', 'stopped'].includes(st.status) ? ' · ' + done + '/' + total : ''));
    const lastModel = st?.attempts?.filter(a => a.model).at(-1)?.model || ''; this.text('model', lastModel ? ' · ' + lastModel : '');
    this.$('.gpStatus').hidden = !this.target && (!st || (!active && !st.status));
    const reason = this.message || (st && !active && st.reason ? st.reason : '');
    const rb = this.$('[data-s="reason"]'); rb.textContent = reason; rb.hidden = !reason; rb.dataset.error = String(this.msgErr || (['paused', 'stopped'].includes(st?.status) && !!st.code && !['RELOADED', 'CANCEL'].includes(st.code) && !this.message));
    const logBox = this.$('[data-s="log"]'), rows = (st?.attempts || []).slice(-30).reverse();
    const topA = rows[0];
    const key = rows.length + ':' + (topA ? `${topA.no}|${topA.verdict}|${topA.model}|${topA.archived ? 1 : 0}|${topA.note || ''}|${topA.fixed || ''}|${topA.fingerprint?.skipped || ''}|${topA.phase || ''}|${topA.step || ''}|${topA.pct || 0}` : '');
    logBox.hidden = !rows.length;
    if (key !== this.logStamp) {
      this.logStamp = key;
      logBox.replaceChildren(...rows.map(a => { const d = document.createElement('div'), t = document.createElement('time'), sp = document.createElement('span');
        const archiving = a.verdict === 'archive';
        const reason = ['visible-thinking', 'compat-thinking'].includes(a.fingerprint?.skipped) ? '开源思考' : '黑名单归档';
        const seqTag = a.verdict === 'skipped' ? '[不计数]' : ('#' + (a.draw || a.no || '?'));
        t.textContent = fmtClock2(a.at);
        sp.textContent = seqTag + ' ' + (archiving
          ? (reason === '黑名单归档' && a.model ? a.model + ' ' : '') + reason + (a.archived ? '' : ' · 待归档')
          : (a.model || '') + (a.tier ? ' · ' + a.tier : '') + (a.power != null ? ' · 强度分 ' + a.power : '') + ' ' + ({ hit: '命中', keep: '保留', skipped: '未完成·不计数', error: '中断', cancelled: '取消', abandoned: '中断' }[a.verdict] || ((Gacha.stepInfo && Gacha.stepInfo(a)?.text) || (a.phase === '等运行令牌' ? '等真实型号' : '进行中'))) + (a.fixed ? '（原推测 ' + a.fixed + '，已按真实型号改正）' : '') + (a.note ? ' · ' + a.note : ''));
        const gs = !a.done && Gacha.stepInfo ? Gacha.stepInfo(a) : null;
        if (gs) d.classList.add('gstep-card');
        d.dataset.v = a.verdict === 'hit' ? 'hit' : ['skipped', 'error'].includes(a.verdict) ? 'warn' : ''; d.title = sp.textContent + (archiving && a.note ? '\n' + a.note : ''); d.append(t, sp);
        if (gs) { const bar = document.createElement('i'), fill = document.createElement('b'); bar.className = 'gstep-bar'; fill.style.width = gs.pct + '%'; bar.append(fill); d.append(bar); }
          if (!this.target && a.verdict === 'skipped' && /reCAPTCHA/.test(a.note || '')) { d.classList.add('gpCapRow'); d.title = '点这里完成人机验证（官方复选框，由你自己勾选）'; d.onclick = () => Gacha.busy() ? Gacha.solveCaptcha().catch(err => this.say(err.message, true)) : null; }
          return d; }));
    }
    this.theme(); this.position();
  },
  sync() { document.querySelectorAll('.gbtn2:not([data-acct])').forEach(b => this.paint(b)); this.fill(); if (typeof UI !== 'undefined') (UI.renderListSoon ? UI.renderListSoon() : UI.renderList()); },
});
addEventListener('resize', () => GPop.position());
