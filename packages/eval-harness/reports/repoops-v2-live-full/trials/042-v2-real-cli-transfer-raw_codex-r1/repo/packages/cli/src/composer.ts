export function frame(rows:string[]){return rows.filter((row,index)=>index===0||row!==rows[index-1]).join("\n")}
