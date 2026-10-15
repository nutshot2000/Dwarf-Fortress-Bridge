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
local msgs = {}
for _, r in ipairs(out) do
  local text = dfhack.df2utf(r.text)
  if r.flags.continuation and #msgs > 0 then
    msgs[#msgs].text = msgs[#msgs].text .. ' ' .. text
  else
    table.insert(msgs, {id = r.id, type = df.announcement_type[r.type], text = text})
  end
end
while #msgs > limit do table.remove(msgs, 1) end
emit({last_id = #reports > 0 and reports[#reports - 1].id or -1, messages = msgs})
