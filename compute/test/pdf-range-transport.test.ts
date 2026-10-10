import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { PdfRangeTransport } from "../src/pdf-text.js";
import { SUGGESTION_LIMITS } from "../src/suggestion.js";

test("grouped PDF.js ranges deliver every byte once with bounded provider reads", async () => {
  const calls: number[][] = [];
  const transport = new PdfRangeTransport({length:18,async read(begin,end) {
    calls.push([begin,end]); return Uint8Array.from({length:end-begin},(_,i)=>begin+i);
  }}, {...SUGGESTION_LIMITS,rangeChunkBytes:4}, undefined, new Uint8Array(4));
  const responses: Array<{begin:number;chunk:Uint8Array}> = [];
  transport.transportReady((event:{type:string;begin:number;chunk:Uint8Array})=>{
    if(event.type==="range") responses.push(event);
  });
  transport.requestDataRange(4,18);
  await setImmediate();
  assert.deepEqual(calls,[[4,8],[8,12],[12,16],[16,18]]);
  assert.equal(responses.length,1);
  assert.equal(responses[0]!.begin,4);
  assert.deepEqual([...responses[0]!.chunk],Array.from({length:14},(_,i)=>i+4));
  assert.deepEqual(transport.metrics,{requests:5,fetchedBytes:18});
  transport.dispose();
});

test("grouped spans reserve the complete aggregate budget before concurrent requests", async () => {
  let finish!: (bytes:Uint8Array)=>void;
  const calls:number[][]=[];
  const transport=new PdfRangeTransport({length:16,read(begin,end) {
    calls.push([begin,end]); return new Promise(resolve=>{finish=resolve;});
  }},{...SUGGESTION_LIMITS,rangeChunkBytes:4},undefined,new Uint8Array(4));
  const responses:Array<{begin:number;chunk:Uint8Array}>=[];
  transport.transportReady((event:{type:string;begin:number;chunk:Uint8Array})=>{if(event.type==="range")responses.push(event);});
  transport.requestDataRange(4,16);
  transport.requestDataRange(8,12);
  await setImmediate();
  assert.deepEqual(calls,[[4,8]]);
  assert.deepEqual(responses.map(r=>[r.begin,r.chunk.length]),[[8,0]]);
  transport.dispose();
  finish(new Uint8Array(4));
  await setImmediate();
  assert.equal(calls.length,1);
  assert.equal(responses.length,1,"disposed responses must not reach PDF.js");
});

test("a short later chunk fails the whole range instead of exposing partial bytes", async () => {
  const calls:number[][]=[];
  const transport=new PdfRangeTransport({length:16,async read(begin,end){
    calls.push([begin,end]);return new Uint8Array(end-begin-(begin===8?1:0));
  }},{...SUGGESTION_LIMITS,rangeChunkBytes:4},undefined,new Uint8Array(4));
  const responses:Array<{begin:number;chunk:Uint8Array}>=[];
  transport.transportReady((event:{type:string;begin:number;chunk:Uint8Array})=>{if(event.type==="range")responses.push(event);});
  transport.requestDataRange(4,16);
  await setImmediate();
  assert.deepEqual(calls,[[4,8],[8,12]]);
  assert.deepEqual(responses.map(r=>[r.begin,r.chunk.length]),[[4,0]]);
  assert.equal(transport.hasSourceFailure,true);
  transport.dispose();
});

test("parent cancellation stops the remaining grouped reads and suppresses late callbacks", async () => {
  const parent=new AbortController();
  let finish!: (bytes:Uint8Array)=>void;
  let readSignal:AbortSignal|undefined;
  let reads=0;
  const transport=new PdfRangeTransport({length:16,read(_begin,_end,signal){
    reads++;readSignal=signal;return new Promise(resolve=>{finish=resolve;});
  }},{...SUGGESTION_LIMITS,rangeChunkBytes:4},parent.signal,new Uint8Array(4));
  const responses:unknown[]=[];
  transport.transportReady((event:unknown)=>responses.push(event));
  transport.requestDataRange(4,16);
  parent.abort();
  finish(new Uint8Array(4));
  await setImmediate();
  assert.equal(readSignal!.aborted,true);
  assert.equal(reads,1);
  assert.deepEqual(responses,[]);
  transport.dispose();
});
