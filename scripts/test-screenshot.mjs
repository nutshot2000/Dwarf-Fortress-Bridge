import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pngDimensions } from "../src/screenshot.js";

export async function testScreenshot(client) {
  const call=(name,args)=>client.callTool({name,arguments:args},undefined,{timeout:30000});
  const state=async()=>JSON.parse((await call("df_lua",{code:"emit({paused=df.global.pause_state,tick=df.global.cur_year_tick,x=df.global.window_x,y=df.global.window_y,z=df.global.window_z,buildings=#df.global.world.buildings.all})"})).content[0].text);
  const before=await state();
  for(const max_width of [1024,640]){
    const res=await call("df_screenshot",{max_width});
    assert(!res.isError, res.content.map(c=>c.text??"").join("\n"));
    const image=res.content.find(c=>c.type==="image");
    const meta=JSON.parse(res.content.find(c=>c.type==="text").text);
    assert(image&&image.mimeType==="image/png","MCP must deliver an actual image block");
    const png=Buffer.from(image.data,"base64"),size=pngDimensions(png);
    assert.deepEqual(size,{width:meta.width,height:meta.height});
    assert(meta.width<=max_width&&meta.bytes===png.length);
    assert.equal(png.toString("ascii",png.length-8,png.length-4),"IEND");
    assert.deepEqual(readFileSync(meta.path),png,"saved PNG and MCP image must match");
    assert(Math.abs(Date.now()-Date.parse(meta.captured_at))<30000,"capture must be fresh");
    assert(meta.review_checklist.length>=3&&meta.citizen_access&&meta.enclosure);
  }
  const bad=await call("df_screenshot",{x:1});
  assert(bad.isError&&bad.content[0].text.includes("together"),"partial camera coordinates must be rejected");
  const after=await state();
  assert.equal(after.paused,before.paused);
  assert.deepEqual([after.x,after.y,after.z,after.buildings],[before.x,before.y,before.z,before.buildings]);
  if(before.paused) assert.equal(after.tick,before.tick,"capture must not advance a paused game");
  console.log("  ✓ screenshot: real MCP PNGs, saved copies, resizing, fresh captures, no game/camera mutation");
}
