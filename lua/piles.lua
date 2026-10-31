-- Stockpile links: which workshops take from / give to which stockpiles.
if not need_map() then return end
local action = ARGS.action or 'links'
local function nm(b)
  return df.building_type[b:getType()] .. (b.name ~= '' and (' "' .. dfhack.df2utf(b.name) .. '"') or '') .. '#' .. b.id
end
local function ids(vec) local t = {} for _, b in ipairs(vec) do table.insert(t, nm(b)) end return t end

if action == 'links' then
  local out = {}
  for _, s in ipairs(df.global.world.buildings.other.STOCKPILE) do
    table.insert(out, {pile = nm(s), x = s.x1, y = s.y1, z = s.z,
      give_to_workshops = ids(s.links.give_to_workshop), take_from_workshops = ids(s.links.take_from_workshop),
      give_to_piles = ids(s.links.give_to_pile), take_from_piles = ids(s.links.take_from_pile)})
  end
  emit({stockpiles = out}) return
end

local pile = df.building.find(ARGS.pile_id or -1)
local shop = df.building.find(ARGS.workshop_id or -1)
if not pile or not df.building_stockpilest:is_instance(pile) then emit({error = 'No stockpile ' .. tostring(ARGS.pile_id)}) return end
if not shop then emit({error = 'No workshop ' .. tostring(ARGS.workshop_id)}) return end
local prof = shop:getWorkshopProfile()
if not prof then emit({error = nm(shop) .. ' has no workshop profile'}) return end

local function has(vec, b) for i, x in ipairs(vec) do if x.id == b.id then return i end end end
local function add(vec, b) if not has(vec, b) then vec:insert('#', b) end end
local function del(vec, b) local i = has(vec, b) if i then vec:erase(i) end end

local f = action == 'link' and add or del
if (ARGS.direction or 'give') == 'give' then
  -- pile feeds the workshop (workshop takes materials from the pile)
  f(pile.links.give_to_workshop, shop)
  f(prof.links.take_from_pile, pile)
else
  -- workshop puts its products into the pile
  f(pile.links.take_from_workshop, shop)
  f(prof.links.give_to_pile, pile)
end
-- A workshop with any "take from" link draws EVERY input only from its linked piles, containers included: a
-- produce pile linked to a still left it waiting for "empty food storage item in linked stockpile".
local warning
if action == 'link' and (ARGS.direction or 'give') == 'give' then
  warning = 'This workshop now takes ALL its inputs only from linked piles, empty barrels/bags too. Make the linked '
    .. 'piles hold every input it needs (e.g. add empty barrels for a still), or unlink: a pile right next to the '
    .. 'workshop is usually enough without a link.'
end
emit({ok = true, pile = nm(pile), workshop = nm(shop), direction = ARGS.direction or 'give',
  give_to_workshops = ids(pile.links.give_to_workshop), take_from_workshops = ids(pile.links.take_from_workshop),
  warning = warning})
