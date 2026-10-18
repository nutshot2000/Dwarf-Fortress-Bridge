// Tools: screen.
import { tool, text, fail, json, optCoord, z, luaFile, lua } from "../core.js";
import { camera, cameraTo } from "../camera.js";
import { captureScreenshot } from "../screenshot.js";

tool("df_screenshot", "Capture the actual Dwarf Fortress game window as a PNG image plus saved file path and text checks (Windows only). Use AFTER construction/repair and when layout or UI text is unclear. Optional x,y,z together centre the camera first; otherwise capture the current view. max_width defaults 1600. Does not unpause or focus the game. Pause before capture for a stable review. Inspect the IMAGE for sealed workers, blocked passages, room walls/doors and clutter; compare text enclosure/access checks. If your model/client cannot view images, use the included warnings plus df_look, df_rooms audit and df_problems; do not claim you saw the image. Enclosure or connected walking groups alone do not prove safety. Blank/minimized captures return an error, never a successful screenshot.",
  {x:optCoord,y:optCoord,z:optCoord,max_width:z.number().int().min(640).max(2560).default(1600)},async a=>{
    if(process.platform!=="win32") return fail("df_screenshot currently supports Windows only. Use df_look, df_rooms audit and df_problems on this platform.");
    const coords=[a.x,a.y,a.z].filter(v=>v!==undefined).length;
    if(coords!==0&&coords!==3) return fail("Provide x,y,z together to centre the view, or omit all three to capture the current view.");
    const readContext=async()=> (await lua(`local loaded=dfhack.isMapLoaded()
      local out={map_loaded=loaded,paused=df.global.pause_state}
      if loaded then
        out.fort=try(function() return dfhack.translation.translateName(dfhack.world.getCurrentSite().name,true) end)
        out.camera_origin={x=df.global.window_x,y=df.global.window_y,z=df.global.window_z}
        local x,y,z=dfhack.maps.getTileSize(); out.map_size={x=x,y=y,z=z};out.game_time=date_info()
      end emit(out)`)).value;
    let context=await readContext();
    if(coords===3){
      if(!context.map_loaded) return fail("No map loaded. Omit x,y,z to capture the current menu.");
      if(a.x>=context.map_size.x||a.y>=context.map_size.y||a.z>=context.map_size.z) return fail("Screenshot centre is outside the map. No camera move or capture performed.");
      const mode=camera.mode;
      try {if(mode==="off") camera.mode="auto";await cameraTo(a.x,a.y,a.z,"Visual layout inspection");}
      finally {camera.mode=mode;}
      await new Promise(r=>setTimeout(r,250));
      context=await readContext();
    }
    const rooms=context.map_loaded?(await luaFile("room_plan",{})).value:null;
    const access=context.map_loaded?(await luaFile("access",{})).value:{checked:false,isolated:[],reason:"No map loaded"};
    const {metadata,image}=await captureScreenshot(a.max_width);
    const summary={...metadata,...context,requested_center:coords===3?{x:a.x,y:a.y,z:a.z}:undefined,
      enclosure:rooms?{room_count:rooms.room_count,incomplete_rooms:rooms.damaged_rooms,rooms:rooms.rooms.map(r=>({id:r.id,x:r.x,y:r.y,z:r.z,state:r.state,next_step:r.next_step}))}:{checked:false,reason:"No map loaded"},
      citizen_access:access,review_checklist:["Check workers outside newly enclosed rooms have a way out.","Follow corridors to main stairs; inspect walls, doors and shared boundaries.","Look for loose clutter, furniture in passages, and unfinished construction.","Run df_problems and df_rooms audit; preserve escape routes before closing the final wall."],
      warning:context.paused?undefined:"Game was running during capture; positions and checks may differ. Pause and repeat for a stable review.",
      image_guidance:"The image is the current game view, not the entire map. Checks cover the fort and may reference rooms outside this view. If image input is unavailable, rely on text tools and do not claim visual verification."};
    return {content:[{type:"text",text:json(summary)},image]};
  });

tool("df_tutorial", "Read the active tutorial lesson and its actual completion flags. minimize/restore only change visibility; they never complete or skip objectives. Use normal screen inputs for tutorial actions: direct blueprint/job helpers may not trigger UI-specific checks.",
  { action: z.enum(["status", "minimize", "restore"]).default("status") },
  async (a) => {
    const { value } = await luaFile("tutorial", a);
    return value?.error ? fail(value.error) : text(json(value));
  });

tool("df_screen", "The game's UI as text, plus input. close: shut any open v50 panel (trade, squads, petitions, building sheets...); they ignore Esc from scripts and some freeze time. read: the screen as numbered text lines (graphics-only map cells are blank; region via x1,y1,x2,y2) and the focus string. find: grid coordinates of text. key: press interface keys (LEAVESCREEN = Esc, SELECT = Enter, STANDARDSCROLL_UP/DOWN, CUSTOM_* letters). click: left-click at x,y or on a text label (e.g. text='Okay', occurrence=n); right=true for right-click. Use it for pop-ups, the trade screen and anything without a dedicated tool; read again after acting.",
  { action: z.enum(["read", "find", "key", "click", "map_click", "close"]).default("read"), text: z.string().optional(),
    keys: z.array(z.string()).optional(), x: optCoord, y: optCoord, occurrence: z.number().int().min(1).optional(),
    right: z.boolean().optional(), z: optCoord,
    layer: z.enum(["visible", "base"]).default("visible"),
    x1: optCoord, y1: optCoord, x2: optCoord, y2: optCoord },
  async (a) => {
    // Give the game a frame between inputs. Tutorial checks and zoom changes
    // are processed after input dispatch, so a Lua loop can lose later keys.
    if (a.action === "key" && a.keys?.length > 1) {
      const results = [];
      for (const key of a.keys) {
        const { value } = await luaFile("screen", { ...a, keys: [key] });
        if (value?.error) return fail(value.error);
        results.push(value);
      }
      return text(json({ pressed: a.keys, results }));
    }
    const { value } = await luaFile("screen", a);
    if (value?.error) return fail(value.error);
    if (value.lines) return text(`focus: ${value.focus.join(" | ")}  paused: ${value.paused}  (${value.size.w}x${value.size.h})\n${value.lines.join("\n")}`);
    return text(json(value));
  });
