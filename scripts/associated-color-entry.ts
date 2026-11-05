import * as T from 'three';
import {associateAlphaColor, configureAssociatedColorMap} from '../src/index';
(window as any).verifyAssociatedColor=()=>{
 const renderer=new T.WebGLRenderer({antialias:false});renderer.setSize(4,4);
 const target=new T.WebGLRenderTarget(4,4),scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
 const geometry=new T.PlaneGeometry(2,2);const uv=geometry.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,.5,.5);
 const rows=[];
 for(const hidden of [[0,255,0],[0,0,255],[255,255,255],[0,0,0]]){
  const source=new Uint8Array([255,0,0,255,...hidden,0]);
  const texture=new T.DataTexture(associateAlphaColor(source),2,1);texture.colorSpace=T.SRGBColorSpace;texture.minFilter=T.LinearFilter;texture.magFilter=T.LinearFilter;texture.needsUpdate=true;
  const material=new T.MeshBasicMaterial({map:texture,toneMapped:false,transparent:true,blending:T.NoBlending});configureAssociatedColorMap(material);
  const mesh=new T.Mesh(geometry,material);scene.add(mesh);renderer.setRenderTarget(target);renderer.render(scene,camera);
  const pixel=new Uint8Array(4);renderer.readRenderTargetPixels(target,2,2,1,1,pixel);
  rows.push({hidden,pixel:[...pixel]});scene.remove(mesh);material.dispose();texture.dispose();
 }
 geometry.dispose();target.dispose();const textures=renderer.info.memory.textures,geometries=renderer.info.memory.geometries,glError=renderer.getContext().getError();renderer.dispose();
 return {rows,textures,geometries,glError};
};
