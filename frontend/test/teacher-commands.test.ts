import { afterEach, expect, it, vi } from 'vitest';
import { CanvasTeacherClient, canvasCommands } from '../src/components/editor/teacherCommands';
import type { Design } from '../src/types';
const design = { id:'design',editorRevision:12,layers:[{id:'photocraft-7',x:10,y:20,width:30,height:40}] } as Design;
const ids = new Map([[1,'photocraft-7']]);
afterEach(()=>vi.useRealTimers());
it('waits for the canvas acknowledgement and keeps session metadata out of document updates',async()=>{
  const post=vi.fn();const client=new CanvasTeacherClient(post);
  const result=client.run(design,[{type:'set_font_size',layer:1,size_px:24}],ids);
  expect(post.mock.calls[0]![0]).toMatchObject({revision:12,commands:[{layer:'photocraft-7',size_px:24}]});
  const request=post.mock.calls[0]![0];
  client.receive(request.requestId,{ok:true,design:{layers:[],editorRevision:13,styleId:'stale-style',remoteVersion:99}});
  await expect(result).resolves.toEqual({layers:[],editorRevision:13});
  client.dispose();
});
it('sends the original bounds for an affine resize and rejects missing layers',()=>{
  expect(canvasCommands(design,[{type:'set_bounds',layer:1,rect:{x:0,y:0,w:60,h:80}}],ids)[0]).toMatchObject({from:{x:10,y:20,w:30,h:40}});
  expect(()=>canvasCommands(design,[{type:'move_by',layer:8,dx:1,dy:0}],ids)).toThrow('layer changed');
});
it('reports a stale revision and rejects outstanding work when the editor closes',async()=>{
  const post=vi.fn();const client=new CanvasTeacherClient(post);
  const result=client.run(design,[{type:'move_by',layer:1,dx:1,dy:0}],ids);
  client.receive(post.mock.calls[0]![0].requestId,{ok:false,error:'The canvas changed'});
  await expect(result).rejects.toThrow('canvas changed');
  const pending=client.run(design,[],ids);client.dispose();await expect(pending).rejects.toThrow('closed');
});
