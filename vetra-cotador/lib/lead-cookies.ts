export const LEAD_VISITOR_COOKIE='vetra_lead_visitor';
export const LEAD_SEEN_COOKIE='vetra_lead_seen';
export function leadCookies(request:Request){
 const values=new Map((request.headers.get('cookie')||'').split(';').map(v=>{const i=v.indexOf('=');return [v.slice(0,i).trim(),v.slice(i+1).trim()] as const;}));
 const raw=values.get(LEAD_VISITOR_COOKIE)||'';
 return {visitorId:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)?raw:crypto.randomUUID(),seen:values.get(LEAD_SEEN_COOKIE)==='1'};
}
export function setLeadCookies(headers:Headers,visitorId:string,secure:boolean,seen=true){
 const flags='; Path=/; Max-Age=15552000; SameSite=Lax; HttpOnly'+(secure?'; Secure':'');
 headers.append('Set-Cookie',LEAD_VISITOR_COOKIE+'='+visitorId+flags);
 if(seen)headers.append('Set-Cookie',LEAD_SEEN_COOKIE+'=1'+flags);
}
