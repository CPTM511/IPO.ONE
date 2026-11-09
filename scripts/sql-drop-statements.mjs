// Migration rollback coverage concerns the actual dropped objects, independent
// of optional IF EXISTS or whether a statement lists multiple objects.
export function droppedSqlObjects(sql, kind) {
  if(!['TABLE','FUNCTION','TYPE','INDEX'].includes(kind))throw new TypeError('Unsupported SQL object kind');
  const source=sql.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/--[^\n]*/g,' ');
  const names=new Set();
  for(const match of source.matchAll(new RegExp(`\\bDROP\\s+${kind}\\s+(?:IF\\s+EXISTS\\s+)?([^;]+);`,'gi'))){
    const values=[];let depth=0,start=0;
    for(let i=0;i<match[1].length;i++){
      if(match[1][i]==='(')depth++;else if(match[1][i]===')')depth--;
      else if(match[1][i]===',' && depth===0){values.push(match[1].slice(start,i));start=i+1;}
    }
    values.push(match[1].slice(start));
    for(const value of values){
      const name=value.trim().match(/^([a-z_][a-z_0-9]*)(?:\s*\([^)]*\))?(?:\s+(?:CASCADE|RESTRICT))?$/i)?.[1];
      if(name)names.add(name.toLowerCase());
    }
  }
  return names;
}
