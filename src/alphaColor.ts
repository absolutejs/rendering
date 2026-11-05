import type { PreparedMipLevel } from './preparedMipTexture';
export type AlphaColorOptions = {
  /** RGB byte encoding; alpha is always linear. Defaults to sRGB. */
  colorSpace?: 'srgb' | 'linear';
  /** Input pixels, not bytes. Default 262144; hard maximum 1048576. */
  maximumPixels?: number;
};
const linear = Array.from({length:256},(_,i)=> {
 const v=i/255; return v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4;
});
function contract(data: Uint8Array, options: AlphaColorOptions) {
 const maximum=options.maximumPixels ?? 262144;
 const space=options.colorSpace ?? 'srgb';
 if(!Number.isSafeInteger(maximum)||maximum<1||maximum>1048576 || !['srgb','linear'].includes(space) || !(data instanceof Uint8Array) || data.length===0 || data.length%4 || data.length/4>maximum)
  throw Error('Invalid bounded alpha-color input');
 return space;
}
function encode(value:number,space:'srgb'|'linear') {
 const v=Math.max(0,Math.min(1,value));
 return Math.round(255*(space==='linear'?v:v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055));
}
/** Copy straight RGBA8 into alpha-associated RGB, multiplying in linear light.
 * Keeps alpha exact. Sampling must decode RGB by sampled alpha before applying
 * ordinary surface lighting; setting a framebuffer blend flag is not a substitute.
 */
export function associateAlphaColor(data: Uint8Array, options: AlphaColorOptions = {}): Uint8Array {
 const space=contract(data,options),out=data.slice();
 for(let i=0;i<data.length;i+=4)for(let c=0;c<3;c++) {
  const color=space==='linear'?data[i+c]!/255:linear[data[i+c]!]!;
  out[i+c]=encode(color*data[i+3]!/255,space);
 }
 return out;
}
/** Area-box reduction of straight RGBA8, weighting linear RGB by original alpha.
 * Returns owned, straight-color bytes. Odd edge texels participate proportionally;
 * a 3x1 source reduces all three texels, rather than dropping the last column.
 * Apply coverage correction and associateAlphaColor only to stored output copies,
 * never to the source of the next reduction. RGBA8 rounding remains explicit.
 */
export function downsampleAlphaColor(level: PreparedMipLevel, options: AlphaColorOptions = {}): PreparedMipLevel {
 const space=contract(level?.data,options);
 if(!Number.isSafeInteger(level.width)||!Number.isSafeInteger(level.height)||level.width<1||level.height<1||level.width*level.height*4!==level.data.length)
  throw Error('Invalid alpha-color dimensions');
 const width=Math.max(1,Math.floor(level.width/2)),height=Math.max(1,Math.floor(level.height/2));
 if(width===level.width && height===level.height)return {width,height,data:level.data.slice()};
 const out=new Uint8Array(width*height*4),sx=level.width/width,sy=level.height/height;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
  const x0=x*sx,x1=(x+1)*sx,y0=y*sy,y1=(y+1)*sy;
  let weight=0,red=0,green=0,blue=0;
  for(let j=Math.floor(y0);j<Math.ceil(y1);j++)for(let i=Math.floor(x0);i<Math.ceil(x1);i++) {
   const area=(Math.min(i+1,x1)-Math.max(i,x0))*(Math.min(j+1,y1)-Math.max(j,y0));
   const at=(Math.min(j,level.height-1)*level.width+Math.min(i,level.width-1))*4;
   const a=level.data[at+3]!/255*area;weight+=a;
   red+=(space==='linear'?level.data[at]!/255:linear[level.data[at]!]!)*a;
   green+=(space==='linear'?level.data[at+1]!/255:linear[level.data[at+1]!]!)*a;
   blue+=(space==='linear'?level.data[at+2]!/255:linear[level.data[at+2]!]!)*a;
  }
  const at=(y*width+x)*4;
  out[at]=encode(weight?red/weight:0,space);out[at+1]=encode(weight?green/weight:0,space);out[at+2]=encode(weight?blue/weight:0,space);
  out[at+3]=Math.round(255*weight/(sx*sy));
 }
 return {width,height,data:out};
}
