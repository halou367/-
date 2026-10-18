const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../ui/gacha.js'),'utf8');
test('gacha exports keep busy/showing/note and offer manual captcha after any recent reject',()=>{
 const ret=src.slice(src.lastIndexOf('return {'));
 for(const k of ['busy,','showing,','note:','needCaptcha:','capOffer:','solveCaptcha,'])assert(ret.includes(k),'export missing '+k);
 assert(/run\.capAt = now\(\)/.test(src),'captcha reject records capAt');
 assert(/run\.capAt = 0/.test(src),'solving clears capAt');
 for(const f of ['gpop.js','gview.js','dock.js'])assert(fs.readFileSync(path.join(__dirname,'../ui',f),'utf8').includes('Gacha.capOffer()'),f+' shows the button via capOffer');
});
