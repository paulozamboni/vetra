export function operationsBase(env:Record<string,string|undefined>){
 if(!env.VETRA_OPERATIONS_URL||!env.VETRA_OPERATIONS_TOKEN)throw Error('Operations unavailable');
 const base=new URL(env.VETRA_OPERATIONS_URL),local=['127.0.0.1','localhost'].includes(base.hostname),docker=env.VETRA_DEPLOY_TARGET==='node'&&base.origin==='http://operations:8080';
 if(base.username||base.password||base.search||base.hash||base.pathname!=='/'||base.protocol!=='https:'&&!(base.protocol==='http:'&&(local||docker)))throw Error('Invalid operations origin');
 return {base,headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.VETRA_OPERATIONS_TOKEN,...(docker?{'X-Forwarded-Proto':'https'}:{})}};
}
