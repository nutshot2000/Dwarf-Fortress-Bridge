if not need_map() then return end
local mo = df.global.world.manager_orders
local list = try(function() return mo.all end) or mo
local out = {}
for _, o in ipairs(list) do
  table.insert(out, {
    id = o.id, job = df.job_type[o.job_type],
    item = o.item_type >= 0 and df.item_type[o.item_type] or nil,
    left = o.amount_left, total = o.amount_total,
    active = o.status.active, validated = o.status.validated,
  })
end
emit({count = #out, orders = out})
