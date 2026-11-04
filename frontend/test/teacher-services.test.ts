import { afterEach, expect, it, vi } from 'vitest';
import { CritiqueClient } from '../../zenopher-teacher/web/src/teacher/critiqueClient';
import { EventRecorder } from '../../zenopher-teacher/web/src/teacher/eventRecorder';
import { idbGet, idbSet } from '../../zenopher-teacher/web/src/teacher/idb';
import type { CritiqueRequest, LearningEvent, TeacherHost } from '../../zenopher-teacher/web/src/teacher/types';
vi.mock('../../zenopher-teacher/web/src/teacher/idb',()=>({idbGet:vi.fn(async()=>undefined),idbSet:vi.fn(async()=>{})}));
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
const request={page:{width_px:1080,height_px:1080,mode:'corporate_base',style_name:null},findings:[]} as CritiqueRequest;
it('keeps cancellation attached to its own review while overlapping renders finish',async()=>{
  let completeFirst!: (blob: Blob)=>void;
  let completeSecond!: (blob: Blob)=>void;
  const render=vi.fn().mockImplementationOnce(()=>new Promise<Blob>(r=>{completeFirst=r;})).mockImplementationOnce(()=>new Promise<Blob>(r=>{completeSecond=r;}));
  const fetch=vi.fn(async()=>new Response(JSON.stringify({text:JSON.stringify({summary:'Review',points:[]})})));
  const client=new CritiqueClient({renderPagePng:render} as unknown as TeacherHost,'/v1',fetch);
  const first=client.review(request,true);const second=client.review(request,true);
  completeFirst(new Blob(['png']));await expect(first).resolves.toEqual({ok:false,reason:'cancelled'});
  client.cancel();completeSecond(new Blob(['png']));await expect(second).resolves.toEqual({ok:false,reason:'cancelled'});
  expect(fetch).not.toHaveBeenCalled();
});
it('retains newly recorded events while consent storage loads and does not reload on duplicate consent',async()=>{
  let stored!: (events: LearningEvent[])=>void;
  vi.mocked(idbGet).mockImplementationOnce(()=>new Promise(r=>{stored=r;}));
  const recorder=new EventRecorder();const granting=recorder.setConsent(true);
  const event={rule:'contrast',class:'base',outcome:'applied',mode:'corporate_base',style_id:null,occurred_at:1} as LearningEvent;
  await recorder.record([event]);stored([{...event,occurred_at:0}]);await granting;
  await recorder.setConsent(true);
  // A separate recorder is unnecessary: persistence on the next record exposes the combined queue.
  await recorder.record([{...event,occurred_at:2}]);
  expect(vi.mocked(idbSet).mock.calls.at(-1)?.[1]).toEqual([{...event,occurred_at:0},event,{...event,occurred_at:2}]);
  expect(idbGet).toHaveBeenCalledTimes(1);recorder.stop();
});

it('records a fix only after host acknowledgement and restores learning state if the host rejects it',async()=>{
  const {TeacherBridge}=await import('../../zenopher-teacher/web/src/teacher/bridge');
  let reject!: (reason:Error)=>void;
  const t={import_stats:vi.fn(),export_stats:()=> '[]',take_events:vi.fn(()=> '[]'),reset_apply_all:vi.fn(),next_pump_delay:()=>-1,run:vi.fn(),apply:()=>JSON.stringify({keys:['contrast@1'],commands:[]})};
  const recorder={record:vi.fn(async()=>{})};
  const host={now:()=>0,runCommands:()=>new Promise<void>((_,r)=>{reject=r;})};
  const bridge=new TeacherBridge(t as never,host as never,recorder as never,{} as never);
  await bridge.start();
  const applying=bridge.apply('contrast@1');
  expect(recorder.record).not.toHaveBeenCalled();
  reject(new Error('The canvas changed'));
  await expect(applying).rejects.toThrow('canvas changed');
  expect(recorder.record).not.toHaveBeenCalled();
  expect(t.import_stats).toHaveBeenCalledWith('[]');
  expect(t.run).toHaveBeenCalledOnce();
  bridge.stop();
});
