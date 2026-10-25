'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const S=require('../ui/shared-fingerprint-schema');
// One main-process broker serves every isolated account partition. Never use read/overwrite shared prefs.
class FingerprintStore {
  constructor(file,{io=fs}={}){this.file=file;this.io=io;this.queue=Promise.resolve();this.cached=null;}
  request(op,expected,payload){const work=this.queue.then(()=>this.perform(op,expected,payload));this.queue=work.catch(()=>{});return work;}
  async load(){
    if(this.cached)return this.cached;
    let data;try{const stat=await this.io.stat(this.file);if(stat.size>S.limit)throw Error('共享库文件超限');data=S.state(JSON.parse(await this.io.readFile(this.file,'utf8')));}
    catch(e){if(e.code!=='ENOENT')throw Error('共享库读取失败，原文件保留：'+e.message);data={schema:S.schema,revision:0,salt:crypto.randomBytes(32).toString('hex'),rows:[],receipts:{},aliases:{}};await this.persist(data);}
    this.cached=data;return data;
  }
  async persist(data){
    const text=JSON.stringify(data);if(Buffer.byteLength(text)>S.limit)throw Error('共享库超过 32 MB');
    await this.io.mkdir(path.dirname(this.file),{recursive:true});const temp=this.file+'.tmp';let handle;
    try{handle=await this.io.open(temp,'w',0o600);await handle.writeFile(text,'utf8');await handle.sync();await handle.close();handle=null;await this.io.rename(temp,this.file);}
    finally{if(handle)await handle.close().catch(()=>{});await this.io.unlink(temp).catch(()=>{});}
  }
  async perform(op,expected,payload){
    if(!['read','meta','cas'].includes(op))throw Error('共享库操作无效');
    const current=await this.load();
    if(op==='meta')return {ok:true,revision:current.revision,count:current.rows.length};
    if(op==='read')return {ok:true,state:JSON.parse(JSON.stringify(current))};
    if(!Number.isSafeInteger(expected)||expected<0)throw Error('共享库修订号无效');
    if(expected!==current.revision)return {ok:false,conflict:true,revision:current.revision};
    if(typeof payload!=='string'||Buffer.byteLength(payload)>S.limit)throw Error('共享库写入超限');
    const data=S.body(JSON.parse(payload)),next={schema:S.schema,revision:current.revision+1,salt:current.salt,...data};S.state(next);
    await this.persist(next);this.cached=next;return {ok:true,revision:next.revision,count:next.rows.length};
  }
}
module.exports={FingerprintStore};
