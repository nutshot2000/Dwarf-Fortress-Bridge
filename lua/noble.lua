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

local action = ARGS.action or 'list'
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

-- clear the current holder
if asn.histfig >= 0 then
  local old = df.historical_figure.find(asn.histfig)
  if old then unlink(old, asn.id) end
  asn.histfig = -1
  asn.histfig2 = -1
end
if action == 'remove' then emit({ok = true, position = code, holder = nil}) return end

local u = df.unit.find(ARGS.unit_id or -1)
if not u then emit({error = 'No unit ' .. tostring(ARGS.unit_id)}) return end
local hf = df.historical_figure.find(u.hist_figure_id)
if not hf then emit({error = 'Unit has no historical figure'}) return end
asn.histfig = hf.id
hf.entity_links:insert('#', {new = df.histfig_entity_link_positionst, entity_id = ent.id,
  link_strength = 100, assignment_id = asn.id, assignment_vector_idx = asn_idx, start_year = df.global.cur_year})
emit({ok = true, position = code, holder = unit_name(u)})
