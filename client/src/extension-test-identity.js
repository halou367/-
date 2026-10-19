'use strict';
const fs=require('node:fs'),path=require('node:path');
const TITLE='Brana AI · 扩展测试版';
function canonicalFuture(value){
 let current=path.resolve(value),parts=[];
 while(!fs.existsSync(current)){const parent=path.dirname(current);if(parent===current)break;parts.unshift(path.basename(current));current=parent;}
 return path.resolve(fs.existsSync(current)?fs.realpathSync(current):current,...parts);
}
function isInside(value,parent){const a=process.platform==='win32'?value.toLowerCase():value,b=process.platform==='win32'?parent.toLowerCase():parent;return a===b||a.startsWith(b+path.sep);}
function chooseDataRoot({appData,override,isPackaged,executable,sourceDir=__dirname}){
 const candidate=override?path.resolve(override):isPackaged?path.join(appData,'Brana AI Extension Test'):path.resolve(sourceDir,'../../../profiles/app');
 const production=canonicalFuture(path.join(appData,'Arena Client'));
 if(isInside(canonicalFuture(candidate),production))throw Error('扩展测试版禁止使用正式版 Arena Client 数据目录');
 return candidate;
}
function configure(app){
 const exe=(()=>{try{return String(app.getPath('exe')||'');}catch{return '';}})();
 const pkgTest=(()=>{try{const p=require('../package.json');return Boolean(p.extensionCompatibilityTest||p.name==='brana-ai-extension-test'||/-beta\b/i.test(String(p.version||''))||/BranaAI-ExtensionTest/i.test(exe));}catch{return false;}})();
 if(!pkgTest&&!process.env.BRANA_EXTENSION_TEST_DATA&&process.env.BRANA_EXTENSION_PACKAGED_SELF_TEST!=='1'){
  return {title:'Brana AI',dataRoot:null,testBuild:false};
 }
 const root=chooseDataRoot({appData:app.getPath('appData'),override:process.env.BRANA_EXTENSION_TEST_DATA,isPackaged:app.isPackaged,executable:exe});
 fs.mkdirSync(path.join(root,'s'),{recursive:true});
 app.setName('Brana AI Extension Test');try{app.setAppUserModelId?.('ai.arena.client.extensiontest');}catch{}app.setPath('userData',root);app.setPath('sessionData',path.join(root,'s'));
 if(process.env.BRANA_EXTENSION_PACKAGED_SELF_TEST==='1')require('./extension-packaged-self-test').install(app,root);
 return {title:TITLE,dataRoot:root,testBuild:true};
}
module.exports={configure,chooseDataRoot,canonicalFuture,TITLE};
