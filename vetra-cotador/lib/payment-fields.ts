export const digits=(value:string)=>value.replace(/\D/g,'');
export function maskCpf(value:string){return digits(value).slice(0,11).replace(/^(\d{3})(\d)/,'$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3').replace(/(\d{3})(\d{1,2})$/,'$1-$2');}
export function validCpf(value:string){
  const d=digits(value);
  if(d.length!==11||/^(\d)\1{10}$/.test(d))return false;
  for(let n=9;n<=10;n++){let sum=0;for(let i=0;i<n;i++)sum+=Number(d[i])*(n+1-i);const check=(sum*10)%11; if((check===10?0:check)!==Number(d[n]))return false;}
  return true;
}
export const isAmex=(value:string)=>/^3[47]/.test(digits(value));
export function maskCardNumber(value:string){const d=digits(value).slice(0,isAmex(value)?15:19);return isAmex(d)?[d.slice(0,4),d.slice(4,10),d.slice(10)].filter(Boolean).join(' '):d.replace(/(.{4})/g,'$1 ').trim();}
export function validCardNumber(value:string){const d=digits(value);if(d.length<13||d.length>19||/^(\d)\1+$/.test(d)||isAmex(d)&&d.length!==15)return false;let sum=0;for(let i=d.length-1,double=false;i>=0;i--,double=!double){let n=Number(d[i]);if(double){n*=2;if(n>9)n-=9;}sum+=n;}return sum%10===0;}
export const maskExpiry=(value:string)=>digits(value).slice(0,4).replace(/^(\d{2})(\d)/,'$1/$2');
export function validExpiry(value:string,now=new Date()){if(!/^\d{2}\/\d{2}$/.test(value))return false;const [month,year]=value.split('/').map(Number);return month>=1&&month<=12&&(2000+year>now.getFullYear()||2000+year===now.getFullYear()&&month>=now.getMonth()+1);}
export const validCvv=(value:string,card:string)=>new RegExp(`^\\d{${isAmex(card)?4:3}}$`).test(value);
