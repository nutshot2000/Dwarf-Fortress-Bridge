-- List fort positions, or appoint / remove a unit. Mirrors DFHack's make-monarch.
if not need_map() then return end
local ent = df.historical_entity.find(df.global.plotinfo.group_id)
local function pos_by_id(id)
  for _, p in ipairs(ent.positions.own) do if p.id == id then return p end end
end
local function hf_name(id)
  local hf = id >= 0 and df.historical_figure.find(id)
  return hf and dfhack.df2utf(dfhack.translation.translateName(hf.name)) or nil
end
local function unlink(hf, asn_id)
  for k, v in ipairs(hf.entity_links) do
    if df.histfig_entity_link_positionst:is_instance(v) and v.assignment_id == asn_id and v.entity_id == ent.id then
      hf.entity_links:erase(k)
      return
    end
  end
end

-- DF decides "is there a manager/broker/..." from fortress_entity.assignments_by_type[responsibility]
-- (found by reverse engineering the "A manager is required" check: it is just that vector's size).
-- The index can be empty or stale (it was empty on a fresh embark), so rebuild it from the assignments.
local function rebuild_index()
  local e = df.global.plotinfo.main.fortress_entity or ent
  local pos = {}
  for _, p in ipairs(e.positions.own) do pos[p.id] = p end
  local abt = e.assignments_by_type
  for r = 0, #df.entity_position_responsibility do pcall(function() abt[r]:resize(0) end) end
  local n = 0
  for _, a in ipairs(e.positions.assignments) do
    local p = pos[a.position_id]
    if p and a.histfig >= 0 then
      for r, on in pairs(p.responsibilities) do
        if on then abt[df.entity_position_responsibility[r]]:insert('#', a) n = n + 1 end
      end
    end
  end
  return n
end

local action = ARGS.action or 'list'
if action == 'repair' then
  emit({ok = true, indexed_responsibilities = rebuild_index()}) return
end
if action == 'list' then
  local out = {}
  for _, a in ipairs(ent.positions.assignments) do
    local p = pos_by_id(a.position_id)
    if p then
      table.insert(out, {position = p.code, title = p.name[0], holder = hf_name(a.histfig),
        squad = a.squad_id >= 0 and a.squad_id or nil})
    end
  end
  emit({positions = out}) return
end

local code = (ARGS.position or ''):upper()
local asn, asn_idx
for i, a in ipairs(ent.positions.assignments) do
  local p = pos_by_id(a.position_id)
  if p and p.code == code then asn, asn_idx = a, i break end
end
if not asn then emit({error = 'No position ' .. code .. '. Use action=list to see codes.'}) return end

-- Same history record the game writes when you appoint/remove in the Nobles screen.
local function history(new_type, hfid)
  local ev = df[new_type]:new()
  ev.id = df.global.hist_event_next_id
  df.global.hist_event_next_id = df.global.hist_event_next_id + 1
  ev.year = df.global.cur_year
  ev.seconds = df.global.cur_year_tick
  ev.civ = ent.id
  ev.histfig = hfid
  ev.link_type = df.histfig_entity_link_type.POSITION
  ev.position_id = asn.position_id
  pcall(function() ev.appointer_hfid = -1 end)
  pcall(function() ev.promise_to_hfid = -1 end)
  df.global.world.history.events:insert('#', ev)
end

-- clear the current holder
if asn.histfig >= 0 then
  local old = df.historical_figure.find(asn.histfig)
  if old then
    unlink(old, asn.id)
    history('history_event_remove_hf_entity_linkst', old.id)
  end
  asn.histfig = -1
  asn.histfig2 = -1
end
if action == 'remove' then rebuild_index() emit({ok = true, position = code, holder = nil}) return end

local u = df.unit.find(ARGS.unit_id or -1)
if not u then emit({error = 'No unit ' .. tostring(ARGS.unit_id)}) return end
local hf = df.historical_figure.find(u.hist_figure_id)
if not hf then emit({error = 'Unit has no historical figure'}) return end
-- the game sets both histfig and histfig2; leaving histfig2 at -1 makes the UI treat the post as vacant
asn.histfig = hf.id
asn.histfig2 = hf.id
hf.entity_links:insert('#', {new = df.histfig_entity_link_positionst, entity_id = ent.id,
  link_strength = 100, assignment_id = asn.id, assignment_vector_idx = asn_idx, entity_vector_idx = ent.id,
  start_year = df.global.cur_year})
history('history_event_add_hf_entity_linkst', hf.id)
rebuild_index()
emit({ok = true, position = code, holder = unit_name(u)})
