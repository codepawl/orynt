export function calculate(a:number, op:string, b:number){if(op==="+")return a+b;if(op==="-")return a-b;if(op==="*")return a*b;if(op==="/")return b===0?"Error":a/b;throw new Error("operator")}

export function recallMemory(memory: number | null): number {
  return memory ?? 0;
}
