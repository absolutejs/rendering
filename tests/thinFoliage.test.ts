import {expect,test} from 'bun:test';
import {DoubleSide,ShaderLib} from 'three';
import {createThinFoliageMaterial,cloneRenderMaterial} from '../src/index';
test('thin foliage validates transmission and preserves clone shader ownership',()=>{
 for(const value of [-1,1.1,NaN,Infinity]) expect(()=>createThinFoliageMaterial({leafTransmission:value})).toThrow();
 const original=createThinFoliageMaterial();
 const clone=cloneRenderMaterial(original);
 expect(original.side).toBe(DoubleSide);
 expect(clone.onBeforeCompile).toBe(original.onBeforeCompile);
 expect(clone.customProgramCacheKey()).toBe(original.customProgramCacheKey());
 original.dispose(); clone.dispose();
});
test('thin foliage retains standard lighting and requires a supported shader',()=>{
 const material=createThinFoliageMaterial({leafTransmission:0});
 const shader={vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader,uniforms:{}} as Parameters<typeof material.onBeforeCompile>[0];
 material.onBeforeCompile(shader,{} as any);
 expect(shader.uniforms.absLeafTransmission.value).toBe(0);
 expect(shader.fragmentShader).toContain('#include <lights_physical_pars_fragment>');
 expect(shader.fragmentShader).toContain('#include <tonemapping_fragment>');
 expect(()=>material.onBeforeCompile({...shader,fragmentShader:''},{} as any)).toThrow();
 material.dispose();
});
