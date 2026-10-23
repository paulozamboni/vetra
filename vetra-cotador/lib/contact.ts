export function validPhone(value:string){const digits=value.replace(/\D/g,'');return /^\+?[0-9().\-\s]+$/.test(value.trim())&&digits.length>=10&&digits.length<=15;}
export function normalizePhone(value:string){return (value.trim().startsWith('+')?'+':'')+value.replace(/\D/g,'');}

export function maskPhone(value:string){
 const digits=value.replace(/\D/g,'').slice(0,15);
 let local=digits,prefix='';
 if(value.trim().startsWith('+')){
  if(!digits.startsWith('55'))return '+'+digits;
  prefix='+55 ';local=digits.slice(2);
 }else if(digits.startsWith('55')&&digits.length>11&&digits.length<=13){prefix='+55 ';local=digits.slice(2);}
 if(local.length>11)return prefix+local;
 if(!local)return prefix;
 if(local.length<3)return prefix+'('+local;
 const area=local.slice(0,2),number=local.slice(2),split=number.length>8?5:4;
 return prefix+'('+area+') '+number.slice(0,split)+(number.length>split?'-'+number.slice(split):'');
}
