export type Outcome={status:"pass"|"fail";code:string};export const finalize=(status:Outcome["status"]):Outcome=>({status,code:status==="pass"?"verification_passed":"verification_failed"});
