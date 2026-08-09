import{expect,test}from"bun:test";import{frame}from"./composer";test("frame",()=>expect(frame(["a","a","b","b","a"])).toBe("a\nb\na"));
