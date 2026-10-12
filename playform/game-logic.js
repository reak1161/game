// Small, independently usable rules for the interaction studies. No network or game imports.
globalThis.PlayformLogic = (() => {
  const shapes = { I:[[0,0],[1,0],[2,0],[3,0]], O:[[0,0],[1,0],[0,1],[1,1]], T:[[0,0],[1,0],[2,0],[1,1]], L:[[0,0],[0,1],[0,2],[1,2]] };
  function rotate(type, turns=0) {
    let cells=shapes[type].map(p=>p.slice());
    for(let n=0;n<((turns%4)+4)%4;n++){
      cells=cells.map(([x,y])=>[-y,x]);
      const minX=Math.min(...cells.map(p=>p[0])),minY=Math.min(...cells.map(p=>p[1]));
      cells=cells.map(([x,y])=>[x-minX,y-minY]);
    }
    return cells;
  }
  function placement(board,size,cells,x,y) {
    const points=cells.map(([dx,dy])=>[x+dx,y+dy]);
    return {points,valid:points.every(([px,py])=>px>=0&&py>=0&&px<size&&py<size&&!board[py*size+px])};
  }
  function connection(board,size,team) {
    const queue=[],parent=new Map();
    for(let n=0;n<size;n++){
      const i=team===1?n:n*size;
      if(board[i]===team){queue.push(i);parent.set(i,null);}
    }
    for(let head=0;head<queue.length;head++){
      const i=queue[head],x=i%size,y=Math.floor(i/size);
      if(team===1?y===size-1:x===size-1){const path=[];for(let p=i;p!==null;p=parent.get(p))path.unshift(p);return path;}
      for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
        const ni=ny*size+nx;
        if(nx>=0&&ny>=0&&nx<size&&ny<size&&board[ni]===team&&!parent.has(ni)){parent.set(ni,i);queue.push(ni);}
      }
    }
    return [];
  }
  function attack(hp,shield,power,bonus=0) {
    const blocked=Math.min(shield,power+bonus),damage=power+bonus-blocked;
    return {hp:Math.max(0,hp-damage),shield:shield-blocked,blocked,damage};
  }
  return {rotate,placement,connection,attack};
})();
