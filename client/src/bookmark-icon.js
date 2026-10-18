'use strict';
const {norm}=require('../ui/webbar');
const validIcon=value=>typeof value==='string'&&value.length<=32768&&/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
// Download through the owning account route, without cookies; persist only a small decoded PNG.
async function loadIcon(ses,page,urls,nativeImage){
 if(typeof page!=='string'||!/^https:\/\//i.test(page)||!norm(page))return '';
 const candidates=[...(Array.isArray(urls)?urls:[]),new URL('/favicon.ico',page).href].filter(u=>typeof u==='string'&&/^https:\/\//i.test(u)&&norm(u));
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
 try{for(const url of [...new Set(candidates)].slice(0,3)){
  if(controller.signal.aborted)break;
  try{
   const response=await ses.fetch(url,{credentials:'omit',redirect:'error',signal:controller.signal});
   if(!response.ok){await response.body?.cancel();continue;}
   const reader=response.body.getReader(),chunks=[];let size=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144)throw Error('icon too large');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
   const image=nativeImage.createFromBuffer(Buffer.concat(chunks));if(image.isEmpty())continue;
   const icon=image.resize({width:32,height:32,quality:'good'}).toDataURL();if(validIcon(icon))return icon;
  }catch{}
 }}finally{clearTimeout(timer);}return '';
}
module.exports={loadIcon,validIcon};
