import { readFileSync, writeFileSync, existsSync } from 'node:fs';
if(process.stdin.isTTY) process.stdin.setRawMode(true);
console.log('Ready for credential JSON on stdin (input hidden).');
let input = await new Promise(resolve=>{let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{text+=chunk;if(/[\r\n]/.test(text)){process.stdin.pause();resolve(text.trim());}});});
if(process.stdin.isTTY) process.stdin.setRawMode(false);
const credentials = JSON.parse(input);
const file = '.env.local';
let content = existsSync(file) ? readFileSync(file, 'utf8') : '';
for (const [key, value] of Object.entries(credentials)) {
  if (!['VETRA_API_LOGIN', 'VETRA_API_PASSWORD'].includes(key) || typeof value !== 'string') throw new Error('Invalid configuration');
  content = content.replace(new RegExp('^' + key + '=.*\\r?\\n?', 'gm'), '');
  content += '\n' + key + '=' + JSON.stringify(value) + '\n';
}
writeFileSync(file, content, { mode: 0o600 });
console.log('Server-only local credentials configured.');
process.exit(0);
