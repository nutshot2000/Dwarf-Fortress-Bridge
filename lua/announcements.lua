-- Recent game announcements, joined across continuation lines.
local since = ARGS.since or -1
local limit = ARGS.limit or 20
local reports = df.global.world.status.reports
local out = {}
for i = #reports - 1, 0, -1 do
  local r = reports[i]
  if r.id <= since then break end
  table.insert(out, 1, r)
  if #out >= limit * 3 then break end
end
-- Blow-by-blow lines name a job ("the miner"), not a dwarf: each citizen's combat log says whose fight it was.
local who = {}
if since >= 0 then
  for _, u in ipairs(citizens()) do
    local log = u.reports.log.Combat
    for i = #log - 1, 0, -1 do
      if log[i] <= since then break end
      who[log[i]] = who[log[i]] or unit_name(u)
    end
  end
end
local msgs = {}
for _, r in ipairs(out) do
  local text = dfhack.df2utf(r.text)
  if r.flags.continuation and #msgs > 0 then
    msgs[#msgs].text = msgs[#msgs].text .. ' ' .. text
  else
    table.insert(msgs, {id = r.id, type = df.announcement_type[r.type], text = text, citizen = who[r.id],
      x = r.pos.x >= 0 and r.pos.x or nil, y = r.pos.x >= 0 and r.pos.y or nil, z = r.pos.x >= 0 and r.pos.z or nil})
  end
end
while #msgs > limit do table.remove(msgs, 1) end
emit({last_id = #reports > 0 and reports[#reports - 1].id or -1, messages = msgs})
