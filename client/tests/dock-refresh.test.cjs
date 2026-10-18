const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../ui/dock.js'),'utf8');
test('continuous panel updates render within a bounded interval and coalesce bursts',()=>{
 let now=0,id=0,paints=0;const timers=new Map();
 const c=vm.createContext({setTimeout:(fn,ms)=>{timers.set(++id,{at:now+ms,fn});return id;},clearTimeout:id=>timers.delete(id)});
 const method=source.slice(source.indexOf('  soon()'),source.indexOf('  turnsOf('));
 const d=vm.runInContext('({t:0,'+method+'})',c);d.render=()=>paints++;
 const advance=ms=>{const end=now+ms;for(;;){const row=[...timers].filter(([,r])=>r.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!row)break;now=row[1].at;timers.delete(row[0]);row[1].fn();}now=end;};
 for(let i=0;i<40;i++){d.soon();advance(25);}
 assert(paints>=6&&paints<=9,'streaming events must not starve or flood the panel: '+paints);
 advance(150);const before=paints;for(let i=0;i<100;i++)d.soon();advance(120);assert.equal(paints,before+1);
});

test('scheduled refresh protects focused editors and clears stale timers when unmounted',()=>{
 let id=0;const timers=new Map(),editor={tagName:'INPUT'};
 const c=vm.createContext({setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),document:{activeElement:editor},isMob:()=>false});
 const method=source.slice(source.indexOf('  soon()'),source.indexOf('  turnsOf('));
 const render=source.slice(source.indexOf('  render()'),source.indexOf('    this.force = false;'))+'  }';
 const d=vm.runInContext('({t:0,open:true,el:{isConnected:true,contains:()=>true},'+method+render+'})',c);
 d.soon();const first=[...timers.values()][0];timers.clear();first.fn();assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,1500);
 for(let i=0;i<100;i++)d.soon();assert.equal(timers.size,1,'focused input retry must not accumulate timers');
 d.el.isConnected=false;d.render();assert.equal(timers.size,0);assert.equal(d.t,null);
});
