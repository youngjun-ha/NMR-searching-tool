import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Module from 'node:module';
import ts from 'typescript';
import React from 'react';
import {create,act} from 'react-test-renderer';
const filename=fileURLToPath(new URL('../app/page.tsx', import.meta.url));
const source=fs.readFileSync(filename,'utf8')+'\nexport {analyzeCarbon, analyzeSpectrum, buildDemoSpectrum, sessionPeaks, emptySession, rankWithCarbon, carbonCandidates, nucleusKey, suggestFormulas, parseTextXyFile};';
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
const loaded=new Module(filename);loaded.filename=filename;loaded.paths=Module._nodeModulePaths(path.dirname(filename));loaded._compile(compiled,filename);
const nmr=loaded.exports;
function points(centers){return Array.from({length:12000},(_,i)=>{const x=220-225*i/11999;return {x,y:centers.reduce((sum,c)=>sum+1/(1+((x-c)/.04)**2),0)}})}
test('carbon signals use carbon assignments and reject all chloroform lines',()=>{
 const peaks=nmr.analyzeCarbon(points([14.2,60.8,76.84,77.16,77.48,128.3,129.6,130.6,132.8,166.5]),'cdcl3');
 assert.equal(peaks.filter(p=>p.kind==='main').length,7);
 assert.equal(peaks.filter(p=>p.kind==='solvent').length,3);
 assert.ok(peaks.every(p=>p.integral===0));
 assert.ok(peaks.find(p=>Math.abs(p.ppm-166.5)<.1).assignment.includes('C=O'));
});
test('D2O has no carbon solvent; acetone rejects both carbon sites',()=>{
 assert.equal(nmr.analyzeCarbon(points([29.84,206.26]),'acetone').filter(p=>p.kind==='solvent').length,2);
 assert.equal(nmr.analyzeCarbon(points([29.84,206.26]),'d2o').filter(p=>p.kind==='solvent').length,0);
});
test('carbon-only candidate ranking uses carbonyl evidence and ignores proton integration',()=>{
 const carbon=nmr.analyzeCarbon(points([14.2,60.8,128.3,129.6,130.6,132.8,166.5]),'cdcl3');
 const ranked=nmr.rankWithCarbon(nmr.carbonCandidates(),carbon,false);
 const ester=ranked.find(p=>p.name==='Ethyl benzoate');const ether=ranked.find(p=>p.name==='Diethyl ether');
 assert.ok(ester.score>ether.score);
 assert.ok(ester.rationale.includes('¹³C만'));
 assert.deepEqual(nmr.rankWithCarbon(nmr.carbonCandidates(),carbon.map(p=>({...p,integral:999})),false),ranked);
 assert.notEqual(nmr.rankWithCarbon(nmr.carbonCandidates(),carbon,true)[0].score,50);
});
test('proton analysis survives and session review affects prediction',()=>{
 const session={...nmr.emptySession('1H'),points:nmr.buildDemoSpectrum(),isDemo:true};
 const peaks=nmr.sessionPeaks(session,'1H');assert.ok(peaks.some(p=>p.ppm>8&&p.kind==='main'));
 const main=peaks.find(p=>p.kind==='main');
 assert.ok(!nmr.sessionPeaks({...session,excludedPeakIds:[main.id]},'1H').some(p=>p.id===main.id));
 const doubled=nmr.sessionPeaks({...session,referenceIntegral:'2'},'1H');
 assert.equal(doubled.find(p=>p.id===main.id).integral,main.integral*2);
 assert.deepEqual(nmr.sessionPeaks(nmr.emptySession('13C'),'13C'),[]);
});
test('text nucleus hints and unsupported nucleus are explicit',async()=>{
 assert.equal(nmr.nucleusKey('<13C>'),'13C');assert.equal(nmr.nucleusKey('19F'),null);
 const text=points([60,170]).map(p=>`${p.x},${p.y}`).join('\n');
 assert.equal((await nmr.parseTextXyFile(new File([text],'sample_13C.csv'))).nucleus,'13C');
 assert.equal((await nmr.parseTextXyFile(new File([text],'sample.csv'))).nucleus,'');
});
test('tabs preserve edits; single, sequential and batch uploads use only available nuclei',async()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;

 let renderer;await act(()=>{renderer=create(React.createElement(nmr.default));});
 const root=()=>renderer.root;
 const button=(label)=>root().findAllByType('button').find(node=>node.children.flat().some(child=>child===label));
 const tab=(nucleus)=>root().findAllByProps({role:'tab'}).find(node=>node.children.includes(nucleus));
 const text=()=>JSON.stringify(renderer.toJSON());
 const rows=()=>root().findByType('tbody').findAllByType('tr');
 const file=(name,centers)=>new File([points(centers).map(p=>`${p.x},${p.y}`).join('\n')],name);
 const upload=async(files)=>{await act(async()=>{
   root().findByProps({type:'file'}).props.onChange({target:{files}});
   // Flush the async file parsers and batched React session updates.
   for(let i=0;i<10;i++) await new Promise(resolve=>setImmediate(resolve));
 });};
 await act(()=>tab('¹³C NMR').props.onClick());
 await upload([file('carbon_13C.csv',[14.2,60.8,77.16,128.3,129.6,130.6,132.8,166.5])]);
 assert.match(text(),/¹³C만/);assert.doesNotMatch(text(),/DEMO · JCAMP/);assert.equal(rows().length,8);
 await act(()=>root().findAllByProps({className:'peak-remove'})[0].props.onClick());assert.equal(rows().length,7);
 await act(()=>tab('¹H NMR').props.onClick());assert.equal(rows().length,0);
 await act(()=>tab('¹³C NMR').props.onClick());assert.equal(rows().length,7);
 await act(()=>tab('¹H NMR').props.onClick());
 const proton=new File([nmr.buildDemoSpectrum().map(p=>`${p.x},${p.y}`).join('\n')],'proton_1H.csv');
 await upload([proton]);assert.match(text(),/¹H \+ ¹³C/);
 await act(()=>tab('¹³C NMR').props.onClick());assert.equal(rows().length,7);
 await act(()=>button('새 시료').props.onClick());assert.equal(rows().length,0);assert.match(text(),/입력 없음/);
 await upload([proton,file('carbon_13C.csv',[14.2,60.8,77.16,128.3,129.6,130.6,132.8,166.5])]);
 assert.match(text(),/¹H \+ ¹³C/);
 await act(()=>tab('¹³C NMR').props.onClick());assert.equal(rows().length,8);
 await act(()=>button('현재 탭 비우기').props.onClick());assert.match(text(),/¹H만/);
 await act(()=>renderer.unmount());delete global.IS_REACT_ACT_ENVIRONMENT;
});
