// Tools: trade.
import { tool, luaTool, text, fail, z, lua, luaFile } from "../core.js";

tool("df_trade", "Trading. goods previews tradeable goods and contents; send marks search/item_ids for hauling (dry_run=true previews). Nonempty containers are protected unless allow_contents=true, preventing accidental sale of booze/seeds. value_with_contents includes contents. status shows caravans/depot/broker. request_broker/request_anyone calls a trader (the trader then waits at the depot and hauls nothing: call them once most goods are there; release cancels the request and frees them). open then screen shows loaded merchant/fort goods and indices; use show_contained=true for individual contents. select/deselect side=merchant|fort, propose returns the merchant reply and native Value/Profit/Weight footer. No fixed offer ratio guarantees acceptance. close exits the frozen trade screen.",
  { action: z.enum(["status", "goods", "send", "request_broker", "request_anyone", "release", "open", "screen", "select", "deselect", "propose", "close"]).default("status"),
    search: z.string().optional(), item_ids: z.array(z.number().int()).optional(), limit: z.number().int().optional(),
    depot_id: z.number().int().optional(), side: z.enum(["merchant", "fort"]).optional(),
    indices: z.array(z.number().int()).optional(), show_contained: z.boolean().optional(),
    dry_run: z.boolean().default(false), allow_contents: z.boolean().default(false) },
  async (a) => {
    if (a.dry_run && !["goods","send","status","screen"].includes(a.action)) return fail("dry_run is supported for goods/send only. No trade action was performed.");
    // the screen's own verdict: merchant line plus the Value / Trader Profit / Weight footer
    // reply=false gives only the footer: the merchant line is the reply to the PREVIOUS proposal, and
    // echoing it after select/deselect makes a stale refusal look like a verdict on the new selection.
    const verdict = async (reply = true) => {
      const top = reply ? (await luaFile("screen", { action: "read", y1: 4, y2: 12 })).value?.lines ?? [] : [];
      const { value } = await luaFile("screen", { action: "read" });
      const lines = value?.lines ?? [];
      const foot = lines.filter((l) => /Mark all|Trader Profit|(Allowed|Excess) Weight/.test(l)).map((l) => l.replace(/^\s*\d+\|/, "").replace(/\s{3,}/g, "   ").trim());
      return `${top.map((l) => l.replace(/^\s*\d+\|\s*/, "")).join("\n")}${top.length ? "\n" : ""}${foot.join("\n")}`;
    };
    const openDepot = async () => {
      const { value: st } = await luaFile("trade", { action: "status" });
      const depot = (st?.depots ?? [])[0];
      if (!depot) return null;
      await lua(`local v=df.global.game.main_interface.view_sheets v.open=true v.active_sheet=df.view_sheet_type.BUILDING v.active_id=${depot.id} v.active_sub_tab=0 emit(true)`);
      return depot;
    };
    if (a.action === "request_broker" || a.action === "request_anyone") {
      // The game only creates the broker's depot job when the button is clicked, not when the flag is set.
      const anyone = a.action === "request_anyone";
      const depot = await openDepot();
      if (!depot) return fail("No trade depot");
      await lua(`local f=df.building.find(${depot.id}).trade_flags f.trader_requested=false f.anyone_can_trade=false emit(true)`);
      await luaFile("screen", { action: "click", text: anyone ? "Anyone requested at depot" : "Broker requested at depot" });
      await luaFile("screen", { action: "key", keys: ["LEAVESCREEN"] });
      return text(`${anyone ? "Any dwarf" : "Broker"} requested at the depot (via the depot button). Run df_wait until they arrive, then action=open.`);
    }
    if (a.action === "open") {
      const depot = await openDepot();
      if (!depot) return fail("No trade depot");
      const { value: f } = await luaFile("screen", { action: "find", text: "Trade" });
      const btn = (f?.hits ?? []).filter((h) => h.y > 8 && h.y < 25)[0];
      if (!btn) return fail("No Trade button on the depot panel (is a caravan at the depot and the broker there?)");
      await luaFile("screen", { action: "click", x: btn.x + 2, y: btn.y });
      const { value: v } = await luaFile("trade", { action: "status" });
      return text(v?.trade_screen_open ? "Trade screen open. Use action=screen, select, propose." : "Trade screen did not open (broker not at the depot yet?)");
    }
    if (a.action === "propose") {
      // the bottom-row "Trade" button (between Seize and Offer as gift), not "[Ctrl+t: DFHack trade UI]" above
      // it: the lowest hit on screen, whatever the window size (a small window puts it on row 60)
      const { value: f } = await luaFile("screen", { action: "find", text: "Trade" });
      const btn = (f?.hits ?? []).filter((h) => h.y > 20).sort((p, q) => q.y - p.y)[0];
      if (!btn) return fail("Trade button not found: is the trade screen open?");
      await luaFile("screen", { action: "click", x: btn.x + 2, y: btn.y });
      const { value: s } = await luaFile("screen", { action: "read", y1: 0, y2: 1 });
      if (s?.focus?.some((x) => x.includes("MessageBox"))) await luaFile("screen", { action: "key", keys: ["SELECT"] });
      return text(`Proposed the trade. Merchant says:\n${await verdict()}\n(Excess Weight = offer lighter goods or buy heavier ones; "not enough" = offer more or take less. ` +
        `With an unskilled trader (no appraisal skill, e.g. a child answering request_anyone) the footer values are guesses: ` +
        `judge by the item values from action=screen, or use the broker.)`);
    }
    const res = await luaTool("trade", a);
    if (!res.isError && (a.action === "select" || a.action === "deselect")) res.content[0].text += `\n--- footer (propose to get the merchant's answer) ---\n${await verdict(false)}`;
    return res;
  });

tool("df_justice", "Crimes involving the fort: type, criminal, accused, victim, witnesses, punishment. Use df_cmd 'justice' for convicts serving sentences and 'justice pardon --unit <id>' to pardon. action=exile unit_id banishes a citizen (the game has no expel button for citizens; this uses DFHack's emigration: they give up citizenship and walk off the map for good). Not for nobles, soldiers or children. Use for a dangerous citizen, e.g. a necromancer who raises nearby corpses as hostile undead when startled.",
  { action: z.enum(["crimes", "exile"]).default("crimes"), unit_id: z.number().int().optional() },
  async (a) => {
    if (a.action !== "exile") return luaTool("justice");
    if (a.unit_id === undefined) return fail("exile needs unit_id");
    const { value } = await lua(`local em = reqscript('emigration')
      local u = df.unit.find(ARGS.unit_id)
      if not u then emit({error = 'no unit ' .. ARGS.unit_id}) return end
      if not em.canLeave(u) then emit({error = unit_name(u) .. ' cannot be exiled (not an active adult citizen, or a noble or soldier: remove them from the post or squad first)'}) return end
      em.desert(u, 'wild', u.civ_id)
      emit({ok = true, unit = unit_name(u), citizen = dfhack.units.isCitizen(u)})`, a);
    if (value?.error) return fail(value.error);
    return text(`Exiled: ${value.unit}. They leave the map and cannot return to this fort.`);
  });

tool("df_petition", "Petitions (residency, citizenship, temples/guildhalls). list: pending petitions with who asks, race, profession, age, syndromes and a CURSED warning for disguised werebeasts/vampires. approve / deny: answer the oldest pending one through the game's Petitions screen (the same buttons a player clicks).",
  { action: z.enum(["list", "approve", "deny"]).default("list") },
  async (a) => {
    const { value: list } = await lua(
      `local r = {}
       for _, id in ipairs(df.global.plotinfo.petitions) do
         local ag = df.agreement.find(id)
         local hid = ag and ag.parties[0].histfig_ids[0]
         local hf = hid and df.historical_figure.find(hid)
         local u = hf and df.unit.find(hf.unit_id)
         local det = {}
         for _, d in ipairs(ag and ag.details or {}) do det[#det + 1] = df.agreement_details_type[d.type] end
         -- vet for disguised night creatures: werebeasts and vampires carry a syndrome / curse record
         local syn = {}
         if u then for _, sa in ipairs(u.syndromes.active) do local sy = df.syndrome.find(sa.type) syn[#syn + 1] = sy and sy.syn_name or '?' end end
         local cursed = hf and try(function() return hf.info.curse ~= nil end, false) or false
         local race = hf and df.creature_raw.find(hf.race).creature_id
         r[#r + 1] = {id = id, who = u and unit_name(u) or (hf and dfhack.df2utf(dfhack.translation.translateName(hf.name, true))) or '?',
           race = race, age = u and math.floor(dfhack.units.getAge(u)), wants = det, syndromes = syn,
           warning = (cursed or (race or ''):find('NIGHT_CREATURE')) and 'CURSED: likely a werebeast or vampire, deny' or nil}
       end
       emit(r)`);
    if (a.action === "list") return text(JSON.stringify({ petitions: list ?? [] }, null, 1));
    if (!list?.length) return fail("No pending petitions");
    // Answering goes through the Petitions panel, which closes whatever panel is open: never mid-trade.
    const { value: trading } = await lua(`emit(df.global.game.main_interface.trade.open)`);
    if (trading) return fail("The trade screen is open: finish the trade (df_trade propose/close) first; answering a petition would close it. Petitions last a few days.");
    await luaFile("screen", { action: "close" });
    // The panel sometimes is not drawn yet on the first look: open it and search again a few times.
    let deny;
    for (let i = 0; i < 3 && !deny; i++) {
      if (i) await new Promise((r) => setTimeout(r, 300));
      await luaFile("screen", { action: "click", text: "PETITIONS" });
      const { value: f } = await luaFile("screen", { action: "find", text: "Deny" });
      deny = (f?.hits ?? [])[0];
    }
    if (!deny) { await luaFile("screen", { action: "close" }); return fail("Petition buttons not found on screen"); }
    // the buttons sit side by side: [ Approve ][ Deny ]
    const x = a.action === "deny" ? deny.x + 1 : deny.x - 9;
    await luaFile("screen", { action: "click", x, y: deny.y });
    const { value: left } = await lua(`emit(#df.global.plotinfo.petitions)`);
    await luaFile("screen", { action: "close" });
    const ok = left < list.length;
    return text(`${ok ? (a.action === "deny" ? "Denied" : "Approved") : "No change for"}: ${list[0].who} (${(list[0].wants ?? []).join(", ")}). Pending now: ${left}.`);
  });
