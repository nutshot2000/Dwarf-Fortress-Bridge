// Standalone Windows window capture: no desktop-wide capture or UI automation.
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

export function pngDimensions(data) {
  if(data.length<33 || !data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    || data.toString("ascii",12,16)!=="IHDR") throw new Error("Capture did not produce a PNG image");
  const width=data.readUInt32BE(16),height=data.readUInt32BE(20);
  if(!width||!height||width>10000||height>10000) throw new Error("Invalid screenshot dimensions");
  return {width,height};
}

export async function captureScreenshot(maxWidth=1600) {
  if(process.platform!=="win32") throw new Error("df_screenshot currently supports Windows only. Use df_look, df_rooms audit and df_problems on this platform.");
  if(!Number.isInteger(maxWidth)||maxWidth<640||maxWidth>2560) throw new Error("max_width must be an integer from 640 to 2560");
  const dir=join(tmpdir(),"df-bridge","screenshots");
  mkdirSync(dir,{recursive:true});
  const path=join(dir,`${Date.now()}-${randomUUID()}.png`);
  const script=fileURLToPath(new URL("../scripts/capture-window.ps1",import.meta.url));
  try {
    const stdout=await new Promise((resolve,reject)=>{
      execFile("powershell.exe",["-NoProfile","-NonInteractive","-File",script,"-OutputFile",path,"-MaxWidth",String(maxWidth)],
        {windowsHide:true,timeout:20000,maxBuffer:1<<20},(err,out,stderr)=>{
          if(err) reject(new Error(`Screenshot failed: ${(stderr||err.message).trim()}`)); else resolve(out);
        });
    });
    const metadata=JSON.parse(stdout.replace(/^\uFEFF/,""));
    const png=readFileSync(path);
    if(png.length>8*1024*1024) throw new Error("Screenshot exceeds 8 MB; retry with a smaller max_width");
    const size=pngDimensions(png);
    if(size.width!==metadata.width||size.height!==metadata.height) throw new Error("Screenshot dimensions do not match capture metadata");
    return {metadata:{...metadata,path,bytes:png.length},image:{type:"image",mimeType:"image/png",data:png.toString("base64")}};
  } catch(e) {
    try {unlinkSync(path);} catch { /* no partial screenshot to remove */ }
    throw e;
  }
}
