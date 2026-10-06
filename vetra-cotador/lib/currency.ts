// Exact decimal multiplication and half-up rounding; no binary float rounding.
function decimal(value:number|string){
  const text=String(value);
  if(!/^\d+(?:\.\d{1,8})?$/.test(text))throw new Error('Invalid decimal');
  const [whole,fraction='']=text.split('.');
  return {units:BigInt(whole+fraction),scale:BigInt(10)**BigInt(fraction.length)};
}
export function usdToBrl(value:number|string,rate:number|string){
  const amount=decimal(value),fx=decimal(rate);
  if(fx.units<=BigInt(0))throw new Error('Invalid exchange rate');
  const divisor=amount.scale*fx.scale;
  const numerator=amount.units*fx.units*BigInt(100);
  const cents=numerator/divisor+(numerator%divisor*BigInt(2)>=divisor?BigInt(1):BigInt(0));
  if(cents>BigInt('999999999999'))throw new Error('Amount exceeds limit');
  return Number(cents)/100;
}
