export function calculate(a:number, op:string, b:number){if(op==="+")return a+b;if(op==="-")return a-b;if(op==="*")return a*b;if(op==="/")return b===0?"Error":a/b;throw new Error("operator")}
