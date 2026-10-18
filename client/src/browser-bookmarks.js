'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {norm}=require('../ui/webbar');
const {validIcon}=require('./bookmark-icon');
function createBookmarks(file){
 let queue=Promise.resolve();
 const serial=fn=>{const job=queue.catch(()=>{}).then(fn);queue=job;return job;};
 async function read(){
  try{const data=JSON.parse(await fs.readFile(file,'utf8'));if(!Array.isArray(data)||data.length>500||data.some(e=>!e||typeof e.id!=='string'||typeof e.title!=='string'||!norm(e.url)||norm(e.url)!==e.url))throw Error('invalid');return data;}
  catch(e){if(e.code==='ENOENT')return [];throw Error('书签文件无法读取，原文件已保留');}
 }
 async function save(data){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(data),{mode:0o600});await fs.rename(file+'.tmp',file);return data;}
 return {
  list:()=>serial(read),
  add:(url,title,icon)=>serial(async()=>{url=norm(url);if(!url)throw Error('当前页面无法收藏，请打开有效的 HTTPS 网页');const data=await read(),existing=data.find(e=>e.url===url);title=String(title||new URL(url).hostname).trim().slice(0,160)||new URL(url).hostname;
   if(existing){existing.title=title;if(validIcon(icon))existing.icon=icon;}else{if(data.length>=500)throw Error('最多保存 500 个书签');data.push({id:crypto.randomUUID(),url,title,...(validIcon(icon)?{icon}:{})});}return save(data);}),
  pin:(id,pinned,icon)=>serial(async()=>{if(typeof pinned!=='boolean')throw Error('固定状态无效');const data=await read(),row=data.find(e=>e.id===id);if(!row)throw Error('书签已移除');row.pinned=pinned;if(validIcon(icon))row.icon=icon;return save(data);}),
  remove:id=>serial(async()=>save((await read()).filter(e=>e.id!==id))),
 };
}
module.exports={createBookmarks};
