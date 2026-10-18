const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../ui/dock.js'),'utf8'),start=src.indexOf('    if(this.balance){'),end=src.indexOf('\n',start);
const update=new Function('m',src.slice(start,end));
const anchor=(connected,meter=false)=>({isConnected:connected,classList:{contains:key=>meter&&key==='bmeter'}});
function fixture(old){return {balance:{anchor:old},painted:0,closed:0,paintDonut(){this.painted++;},closeDonut(){this.closed++;}};}
test('balance refresh preserves the visible account-avatar anchor instead of hidden footer',()=>{const old=anchor(true),h=fixture(old);update.call(h,anchor(true,true));assert.equal(h.balance.anchor,old);assert.equal(h.painted,1);assert.equal(h.closed,0);});
test('replaced footer meter reattaches the popover to its new element',()=>{const h=fixture(anchor(false,true)),next=anchor(true,true);update.call(h,next);assert.equal(h.balance.anchor,next);assert.equal(h.painted,1);});
test('removed non-footer anchors close instead of teleporting the popover',()=>{const h=fixture(anchor(false));update.call(h,anchor(true,true));assert.equal(h.closed,1);assert.equal(h.painted,0);});
