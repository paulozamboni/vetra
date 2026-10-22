export function validPhone(value:string){const digits=value.replace(/\D/g,'');return /^\+?[0-9().\-\s]+$/.test(value.trim())&&digits.length>=10&&digits.length<=15;}
export function normalizePhone(value:string){return (value.trim().startsWith('+')?'+':'')+value.replace(/\D/g,'');}
