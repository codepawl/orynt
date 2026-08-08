import{expect,test}from"bun:test";import{finalize}from"./index";test("failure outcome",()=>expect(finalize("fail").code).toBe("verification_failed"));
