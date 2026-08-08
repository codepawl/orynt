import{expect,test}from"bun:test";import{calculate,recallMemory}from"../src/calculator";test("calculator",()=>{expect(calculate(2,"+",3)).toBe(5);expect(calculate(8,"/",0)).toBe("Error")});

test("recalls stored memory or zero when memory is empty",()=>{expect(recallMemory(42)).toBe(42);expect(recallMemory(null)).toBe(0)});
