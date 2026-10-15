-- Dev helper: dump everything a noble appointment might touch (run via df_lua / dfhack-run).
local function flat(v, depth)
  depth = depth or 0
  if type(v) ~= 'userdata' then return tostring(v) end
  if depth > 2 then return tostring(v) end
  local o = {}
  local ok = pcall(function()
    for k, x in pairs(v) do o[tostring(k)] = flat(x, depth + 1) end
  end)
  if not ok or next(o) == nil then return tostring(v):gsub('0x%x+', '') end
  return o
end
local ent = df.historical_entity.find(df.global.plotinfo.group_id)
local out = {assignments = {}, links = {}, unit = {}, events = #df.global.world.history.events}
for i, a in ipairs(ent.positions.assignments) do out.assignments[i] = flat(a) end
local u = df.unit.find(ARGS.unit_id)
local hf = df.historical_figure.find(u.hist_figure_id)
for i, l in ipairs(hf.entity_links) do out.links[i] = {type = tostring(l._type), data = flat(l)} end
out.unit.flags1, out.unit.flags2, out.unit.flags3, out.unit.flags4 = flat(u.flags1), flat(u.flags2), flat(u.flags3), flat(u.flags4)
out.unit.profession, out.unit.profession2 = u.profession, u.profession2
out.unit.general_refs = #u.general_refs
out.unit.specific_refs = #u.specific_refs
out.hf_info = flat(hf.info and hf.info.whereabouts)
local ev = {}
for i = math.max(0, out.events - 3), out.events - 1 do ev[#ev + 1] = flat(df.global.world.history.events[i]) end
out.last_events = ev
emit(out)
