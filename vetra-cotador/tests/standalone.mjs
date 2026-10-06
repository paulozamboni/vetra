// Build with VETRA_DEPLOY_TARGET=node before running this smoke test.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const port=3501;
const server=spawn(process.execPath,['dist/standalone/server.js'],{
  env:{...process.env,PORT:String(port),HOST:'127.0.0.1',VINEXT_TRUSTED_HOSTS:'seguro.example.invalid',VETRA_API_LOGIN:'',VETRA_API_PASSWORD:''},
  stdio:['ignore','pipe','pipe'],
});
let logs='';
server.stdout.on('data',data=>{logs+=data;});
server.stderr.on('data',data=>{logs+=data;});
try{
  let response;
  const end=Date.now()+15000;
  while(Date.now()<end){
    if(server.exitCode!==null)throw new Error('Standalone server failed: '+logs);
    try{response=await fetch(`http://127.0.0.1:${port}/`);break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  assert(response,'Standalone did not start');
  assert.equal(response.status,200);
  assert.match(await response.text(),/Vetra/);
  const proxyRequest=await fetch(`http://127.0.0.1:${port}/api/orders`,{
    method:'POST',headers:{'Content-Type':'application/json',origin:'https://seguro.example.invalid','X-Forwarded-Host':'seguro.example.invalid','X-Forwarded-Proto':'https'},body:'{}',
  });
  // Invalid payload is 400; incorrect proxy origin would be 403.
  assert.equal(proxyRequest.status,400);
  const foreign=await fetch(`http://127.0.0.1:${port}/api/orders`,{
    method:'POST',headers:{'Content-Type':'application/json',origin:'https://elsewhere.invalid','X-Forwarded-Host':'seguro.example.invalid','X-Forwarded-Proto':'https'},body:'{}',
  });
  assert.equal(foreign.status,403);
  console.log('Node standalone: homepage, HTTPS proxy origin and foreign-origin rejection passed.');
}finally{server.kill();}
