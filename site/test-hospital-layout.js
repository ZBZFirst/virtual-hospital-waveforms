const assert = require('node:assert/strict');
const {create} = require('./hospital-layout.js');
const entries = require('./manifest.json').entries;
const emptyUnits = create([], [1, 2]);
assert.equal(emptyUnits.units.size, 2);
assert.equal(emptyUnits.nodes.filter(node => node.kind === 'room' && node.entry).length, 0);

for (let count = 1; count <= 24; count++) {
  const sample = entries.filter(e => e.unit <= count);
  for (let unit = 20; unit <= count; unit++) sample.push({unit,room:1,name:`synthetic-${unit}`});
  const layout = create(sample);
  const hubs = layout.nodes.filter(n => n.kind !== 'room');
  const rooms = layout.nodes.filter(n => n.kind === 'room');
  assert.equal(hubs.length,count+1);
  assert.equal(rooms.length,count*8);
  assert.equal(new Set(rooms.map(n => `${n.x},${n.y}`)).size,rooms.length,
    'each room has its own square position');
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];
      assert.ok(Math.abs(a.x-b.x) >= layout.roomSize ||
        Math.abs(a.y-b.y) >= layout.roomSize,'room squares do not overlap');
    }
  }
  const neighbors = new Map(hubs.map(n => [n.key,[]]));
  for (const edge of layout.corridors) {
    neighbors.get(edge.from).push(edge.to);
    neighbors.get(edge.to).push(edge.from);
    assert.ok(edge.x1 === edge.x2 || edge.y1 === edge.y2,'corridor is orthogonal');
    for (const hub of hubs) {
      const h = layout.unitHalf;
      const overlapsInterior = edge.x1 === edge.x2 ?
        edge.x1 > hub.x-h && edge.x1 < hub.x+h &&
          Math.max(Math.min(edge.y1,edge.y2),hub.y-h) < Math.min(Math.max(edge.y1,edge.y2),hub.y+h) :
        edge.y1 > hub.y-h && edge.y1 < hub.y+h &&
          Math.max(Math.min(edge.x1,edge.x2),hub.x-h) < Math.min(Math.max(edge.x1,edge.x2),hub.x+h);
      assert.ok(!overlapsInterior,'corridor does not overlap a unit interior');
    }
  }
  for (let i = 0; i < layout.corridors.length; i++) {
    for (let j = i + 1; j < layout.corridors.length; j++) {
      const a = layout.corridors[i], b = layout.corridors[j];
      const ah = a.y1 === a.y2, bh = b.y1 === b.y2;
      const between = (value,one,two) => value > Math.min(one,two) && value < Math.max(one,two);
      let overlaps = false;
      if (ah && bh && a.y1 === b.y1) {
        overlaps = Math.max(Math.min(a.x1,a.x2),Math.min(b.x1,b.x2)) <
          Math.min(Math.max(a.x1,a.x2),Math.max(b.x1,b.x2));
      } else if (!ah && !bh && a.x1 === b.x1) {
        overlaps = Math.max(Math.min(a.y1,a.y2),Math.min(b.y1,b.y2)) <
          Math.min(Math.max(a.y1,a.y2),Math.max(b.y1,b.y2));
      } else if (ah !== bh) {
        const h = ah ? a : b, v = ah ? b : a;
        overlaps = between(v.x1,h.x1,h.x2) && between(h.y1,v.y1,v.y2);
      }
      assert.ok(!overlaps,'separate corridors do not overlap or cross');
    }
  }
  const reached = new Set(['root']), queue = ['root'];
  for (let i = 0; i < queue.length; i++) {
    for (const next of neighbors.get(queue[i])) {
      if (!reached.has(next)) {reached.add(next);queue.push(next);}
    }
  }
  assert.equal(reached.size,hubs.length,'all units connect to all-feeds center');
  for (const room of rooms) {
    const hub = hubs.find(n => n.unit === room.unit);
    assert.ok(Math.abs(room.x-hub.x)+layout.roomSize/2 < layout.unitHalf);
    assert.ok(Math.abs(room.y-hub.y)+layout.roomSize/2 < layout.unitHalf);
  }
}
const actual = create(entries);
assert.equal(actual.nodes.filter(n => n.kind === 'room' && n.entry).length,entries.length,
  'each actual recording occupies exactly one room');
console.log('hospital layout geometry tests passed');
