// 動かない小さなメッシュ (城・門・櫓・名所など) を、材質ごとに 1 つのメッシュにまとめる (描く回数を減らして軽くする)
import * as THREE from '../vendor/three.module.min.js';

export function mergeStatic(scene, roots, skip = new Set()) {
  const buckets = new Map(), victims = [];
  for (const r of roots) {
    r.updateMatrixWorld(true);
    r.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible || skip.has(o)) return;
      if (Array.isArray(o.material) || !o.geometry || !o.geometry.attributes.position) return;
      for (let p = o; p; p = p.parent) if (skip.has(p)) return;
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      if (!g.attributes.normal) g.computeVertexNormals();
      const key = o.material.uuid + '|' + (g.attributes.uv ? 'u' : '') + (g.attributes.color ? 'c' : '');
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, list: [] });
      buckets.get(key).list.push(g);
      victims.push(o);
    });
  }
  for (const o of victims) o.parent && o.parent.remove(o);
  let n = 0;
  for (const { mat, list } of buckets.values()) {
    const hasUv = !!list[0].attributes.uv, hasCol = !!list[0].attributes.color;
    let count = 0;
    for (const g of list) count += g.attributes.position.count;
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = hasUv ? new Float32Array(count * 2) : null, col = hasCol ? new Float32Array(count * 3) : null;
    let k = 0;
    for (const g of list) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array.subarray(0, c * 3), k * 3);
      nor.set(g.attributes.normal.array.subarray(0, c * 3), k * 3);
      if (uv) uv.set(g.attributes.uv.array.subarray(0, c * 2), k * 2);
      if (col) col.set(g.attributes.color.array.subarray(0, c * 3), k * 3);
      k += c;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.matrixAutoUpdate = false;
    scene.add(m);
    n++;
  }
  return { merged: victims.length, meshes: n };
}
