import test from 'node:test';
import assert from 'node:assert/strict';
import './game-logic.js';
const {rotate,placement,connection,attack}=globalThis.PlayformLogic;
test('four rotations preserve shape; negative rotation equals three clockwise turns',()=>{
  for(const type of ['I','O','T','L']){assert.deepEqual(rotate(type,4),rotate(type));assert.deepEqual(rotate(type,-1),rotate(type,3));assert.equal(new Set(rotate(type,1).map(String)).size,4);}
});
test('placement rejects both occupied cells and coordinates beyond either edge',()=>{
  const b=Array(225).fill(0);b[16]=2;
  assert.equal(placement(b,15,rotate('O'),4,4).valid,true);
  for(const [x,y] of [[0,0],[14,14],[-1,5],[5,-1]])assert.equal(placement(b,15,rotate('O'),x,y).valid,false);
});
test('connection must join the proper edges through orthogonal cells of the same team',()=>{
  const b=Array(225).fill(0);for(let y=0;y<15;y++)if(y<6||y>9)b[y*15+7]=1;
  assert.deepEqual(connection(b,15,1),[]);
  placement(b,15,rotate('I',1),7,6).points.forEach(([x,y])=>b[y*15+x]=1);
  assert.equal(connection(b,15,1).length,15);
  b[7*15+7]=2;assert.deepEqual(connection(b,15,1),[]);
  const diagonal=Array(9).fill(0);[0,4,8].forEach(i=>diagonal[i]=1);assert.deepEqual(connection(diagonal,3,1),[]);
  assert.equal(connection([2,2,2,0,0,0,0,0,0],3,2).length,3);
});
test('shield absorbs first, wolf bonus is included, HP never becomes negative',()=>{
  assert.deepEqual(attack(8,1,2),{hp:7,shield:0,blocked:1,damage:1});
  assert.deepEqual(attack(8,4,2,1),{hp:8,shield:1,blocked:3,damage:0});
  assert.equal(attack(1,0,3).hp,0);
});
