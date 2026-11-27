'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { OfficeGroup, OfficeLayout, OfficePerson, SeatState } from './layout';

export interface Office3DProps {
  layout: OfficeLayout;
  /** Masa sahipleri (slug → ad). */
  people: Map<string, OfficePerson>;
  /** Oda etiket ve renkleri (grup kimliği → görünüm). */
  groups: Map<string, OfficeGroup>;
  activity: Map<string, { state: SeatState }>;
  /** Süzgece uyan roller (null = hepsi). Uymayanlar soluk çizilir. */
  matches: Set<string> | null;
  selected: string | null;
  onSelect(slug: string | null): void;
  /** WebGL açılamazsa çağrılır (sayfa liste görünümüne düşer). */
  onUnavailable(): void;
}

interface SeatRef { slug: string; x: number; z: number; division: string }
const cssVar = (name: string, fallback: string) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};
const DESK_Y = 0.74;

/** Bölüm etiketi: canvas dokulu sprite (font yüklemeden okunur). */
function labelSprite(text: string, sub: string, color: string, ink: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(10,12,26,.78)';
  g.beginPath(); g.roundRect(4, 14, 504, 100, 28); g.fill();
  g.fillStyle = color; g.beginPath(); g.roundRect(22, 40, 14, 48, 7); g.fill();
  g.fillStyle = ink; g.font = '700 44px "Plus Jakarta Sans", system-ui, sans-serif'; g.textBaseline = 'middle';
  g.fillText(text, 52, 58, 340);
  g.fillStyle = 'rgba(255,255,255,.62)'; g.font = '600 26px "Plus Jakarta Sans", system-ui, sans-serif';
  g.textAlign = 'right'; g.fillText(sub, 486, 62);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(7.6, 1.9, 1);
  return s;
}

/**
 * 3B ofis: bölüm başına bir oda, rol başına bir masa + avatar (InstancedMesh; 283 rol tek çizim çağrısı).
 * Çalışan rol: parlak avatar, yanan ekran, zeminde nabız halkası ve ışık sütunu. Son 24 saatte çalışan: yanan ekran.
 */
export function Office3D({ layout, people, groups, activity, matches, selected, onSelect, onUnavailable }: Office3DProps) {
  const divisionOf = (id: string): OfficeGroup => groups.get(id) ?? { label: id, color: '#8c93ff' };
  const host = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  // Sahne bir kez kurulur; değişen girdiler ref üzerinden okunur.
  const live = useRef({ activity, matches, selected, onSelect });
  live.current = { activity, matches, selected, onSelect };
  const api = useRef<{ refresh(): void } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
    catch { onUnavailable(); return; }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.setAttribute('aria-hidden', 'true');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    const span = Math.max(layout.width, layout.depth);
    // Tüm ofis kadraja sığsın: uzaklık görüş açısı + en-boy oranından hesaplanır (resize'da yeniden).
    const ELEV = 0.9; // rad (~52°)
    const fit = (aspect: number) => {
      const half = THREE.MathUtils.degToRad(camera.fov / 2);
      const need = Math.max(layout.depth * 0.5 * Math.sin(ELEV) + 2.5, (layout.width * 0.64) / Math.max(aspect, 0.4));
      return need / Math.tan(half);
    };
    let framed = false;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.15; controls.minDistance = 6; controls.maxDistance = span * 2.4;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a1c2e, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 1.25);
    sun.position.set(18, 40, 22); scene.add(sun);

    const floorMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(layout.width + 14, layout.depth + 14), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; scene.add(floor);
    const applyTheme = () => {
      const canvas = cssVar('--canvas', '#080a17');
      scene.background = new THREE.Color(canvas);
      scene.fog = new THREE.Fog(canvas, span * 2.2, span * 5);
      floorMat.color.set(cssVar('--card', '#151827'));
    };
    applyTheme();
    const themeObs = new MutationObserver(applyTheme);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Odalar: halı + alçak cam duvarlar + etiket.
    const disposables: Array<{ dispose(): void }> = [floor.geometry, floorMat];
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x9fb0ff, transparent: true, opacity: 0.16, roughness: 0.2, metalness: 0.1 });
    disposables.push(wallMat);
    const seats: SeatRef[] = [];
    for (const room of layout.rooms) {
      const div = divisionOf(room.division);
      const carpetMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(div.color).multiplyScalar(0.34), roughness: 1 });
      const carpet = new THREE.Mesh(new THREE.PlaneGeometry(room.w, room.d), carpetMat);
      carpet.rotation.x = -Math.PI / 2; carpet.position.set(room.x + room.w / 2, 0, room.z + room.d / 2); scene.add(carpet);
      disposables.push(carpet.geometry, carpetMat);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(room.w, 0.02, room.d)), new THREE.LineBasicMaterial({ color: div.color, transparent: true, opacity: 0.7 }));
      edge.position.set(room.x + room.w / 2, 0.02, room.z + room.d / 2); scene.add(edge);
      disposables.push(edge.geometry, edge.material as THREE.Material);
      const wall = (w: number, d: number, x: number, z: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.25, d), wallMat);
        m.position.set(x, 0.625, z); scene.add(m); disposables.push(m.geometry);
      };
      wall(room.w, 0.08, room.x + room.w / 2, room.z);
      wall(0.08, room.d, room.x, room.z + room.d / 2);
      wall(0.08, room.d, room.x + room.w, room.z + room.d / 2);
      const label = labelSprite(div.label, `${room.seats.length}`, div.color, '#f0f0f7');
      label.position.set(room.x + room.w / 2, 2.5, room.z + 0.1); scene.add(label);
      disposables.push(label.material.map!, label.material);
      for (const s of room.seats) seats.push({ slug: s.slug, x: s.x, z: s.z, division: room.division });
    }
    const index = new Map(seats.map((s, i) => [s.slug, i]));
    const n = seats.length;

    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m); disposables.push(geo, mat);
      return m;
    };
    const desks = mk(new THREE.BoxGeometry(1.2, 0.07, 0.68), new THREE.MeshStandardMaterial({ color: 0x3a4060, roughness: 0.7 }));
    const legs = mk(new THREE.BoxGeometry(1.08, DESK_Y, 0.06), new THREE.MeshStandardMaterial({ color: 0x23273d, roughness: 0.9 }));
    const screens = mk(new THREE.BoxGeometry(0.56, 0.36, 0.04), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const bodies = mk(new THREE.CapsuleGeometry(0.2, 0.42, 4, 10), new THREE.MeshStandardMaterial({ roughness: 0.55 }));
    const heads = mk(new THREE.SphereGeometry(0.17, 14, 12), new THREE.MeshStandardMaterial({ roughness: 0.45 }));

    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const S = new THREE.Vector3(1, 1, 1);
    const P = new THREE.Vector3();
    const put = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, scale = 1) => {
      P.set(x, y, z); S.set(scale, scale, scale); M.compose(P, Q, S); mesh.setMatrixAt(i, M);
    };
    seats.forEach((s, i) => {
      put(desks, i, s.x, DESK_Y, s.z - 0.25);
      put(legs, i, s.x, DESK_Y / 2, s.z - 0.52);
      put(screens, i, s.x, DESK_Y + 0.26, s.z - 0.48);
      put(bodies, i, s.x, 0.62, s.z + 0.32);
      put(heads, i, s.x, 1.12, s.z + 0.32);
    });
    [desks, legs, screens, bodies, heads].forEach((m) => { m.instanceMatrix.needsUpdate = true; });

    // Çalışan roller için efektler (halka + ışık sütunu) ve seçim halkası.
    const fx = new THREE.Group(); scene.add(fx);
    const ringGeo = new THREE.RingGeometry(0.5, 0.62, 40);
    const beamGeo = new THREE.CylinderGeometry(0.34, 0.5, 6, 20, 1, true);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xccff00, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xccff00, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const selMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
    const selRing = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.84, 48), selMat);
    selRing.rotation.x = -Math.PI / 2; selRing.visible = false; scene.add(selRing);
    disposables.push(ringGeo, beamGeo, ringMat, beamMat, selMat, selRing.geometry);

    let working: number[] = [];
    const col = new THREE.Color();
    const refresh = () => {
      const { activity: act, matches: mt, selected: sel } = live.current;
      working = [];
      fx.clear();
      seats.forEach((s, i) => {
        const state = act.get(s.slug)?.state ?? 'idle';
        const dim = mt ? !mt.has(s.slug) : false;
        const base = new THREE.Color(divisionOf(s.division).color);
        col.copy(base).multiplyScalar(state === 'working' ? 1.25 : state === 'recent' ? 0.95 : 0.5);
        if (dim) col.multiplyScalar(0.28);
        bodies.setColorAt(i, col);
        col.set(state === 'idle' ? 0xb8bdd6 : 0xffffff); if (dim) col.multiplyScalar(0.3); else if (state === 'idle') col.multiplyScalar(0.75);
        heads.setColorAt(i, col);
        col.set(state === 'working' ? 0xccff00 : state === 'recent' ? 0x00f0ff : 0x1c2036); if (dim) col.multiplyScalar(0.4);
        screens.setColorAt(i, col);
        if (state === 'working') {
          working.push(i);
          const ring = new THREE.Mesh(ringGeo, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.04, s.z + 0.32); fx.add(ring);
          const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.set(s.x, 3, s.z + 0.32); fx.add(beam);
        }
      });
      [bodies, heads, screens].forEach((m) => { if (m.instanceColor) m.instanceColor.needsUpdate = true; });
      const si = sel ? index.get(sel) : undefined;
      selRing.visible = si !== undefined;
      if (si !== undefined) selRing.position.set(seats[si].x, 0.05, seats[si].z + 0.32);
    };
    refresh();
    api.current = { refresh };

    // İşaretçi: üzerine gelince ad, tıklayınca seç (sürükleme tıklama sayılmaz).
    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    let down: { x: number; y: number } | null = null;
    let hovered: string | null = null;
    const pick = (e: PointerEvent): string | null => {
      const r = renderer.domElement.getBoundingClientRect();
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, camera);
      const hit = ray.intersectObjects([bodies, heads, desks, screens], false)[0];
      return hit && hit.instanceId !== undefined ? seats[hit.instanceId].slug : null;
    };
    const onMove = (e: PointerEvent) => {
      const slug = pick(e);
      if (slug !== hovered) { hovered = slug; setHover(slug); renderer.domElement.style.cursor = slug ? 'pointer' : 'grab'; }
      const tip = tipRef.current;
      if (tip) { const r = el.getBoundingClientRect(); tip.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`; }
    };
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) live.current.onSelect(pick(e));
      down = null;
    };
    const onLeave = () => { hovered = null; setHover(null); };
    const dom = renderer.domElement;
    dom.addEventListener('pointermove', onMove); dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointerup', onUp); dom.addEventListener('pointerleave', onLeave);

    const resize = () => {
      const w = el.clientWidth || 800;
      const h = el.clientHeight || 520;
      renderer.setSize(w, h, false);
      dom.style.width = '100%'; dom.style.height = '100%';
      camera.aspect = w / h; camera.updateProjectionMatrix();
      if (!framed) {
        const dist = fit(w / h);
        controls.target.set(0, 0, layout.depth * 0.06);
        camera.position.set(0, Math.sin(ELEV) * dist, layout.depth * 0.06 + Math.cos(ELEV) * dist);
        controls.maxDistance = dist * 1.6;
        controls.update();
        framed = true;
      }
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);

    const clock = new THREE.Clock();
    const v = new THREE.Vector3();
    renderer.setAnimationLoop(() => {
      const t = clock.getElapsedTime();
      controls.update();
      if (!reduced) {
        for (const i of working) {
          const s = seats[i];
          const bob = Math.sin(t * 5 + i) * 0.045;
          put(heads, i, s.x, 1.12 + bob, s.z + 0.32);
          put(bodies, i, s.x, 0.62 + bob * 0.4, s.z + 0.32);
        }
        if (working.length) { heads.instanceMatrix.needsUpdate = true; bodies.instanceMatrix.needsUpdate = true; }
        const pulse = 1 + ((t * 0.9) % 1) * 0.9;
        fx.children.forEach((c, k) => { if (k % 2 === 0) c.scale.setScalar(pulse); });
        ringMat.opacity = 0.9 - ((t * 0.9) % 1) * 0.75;
        selRing.rotation.z = t * 0.6;
      }
      // Çalışan rollerin adları: 3B konum → ekran konumu (HTML katmanı).
      const box = labelsRef.current;
      if (box) {
        const w = el.clientWidth;
        const h = el.clientHeight;
        Array.from(box.children).forEach((node) => {
          const d = node as HTMLElement;
          const i = index.get(d.dataset.slug ?? '');
          if (i === undefined) { d.style.display = 'none'; return; }
          v.set(seats[i].x, 1.75, seats[i].z + 0.32).project(camera);
          const off = v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05;
          d.style.display = off ? 'none' : 'block';
          d.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
        });
      }
      renderer.render(scene, camera);
    });

    return () => {
      api.current = null;
      renderer.setAnimationLoop(null);
      ro.disconnect(); themeObs.disconnect(); controls.dispose();
      dom.removeEventListener('pointermove', onMove); dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointerup', onUp); dom.removeEventListener('pointerleave', onLeave);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      dom.remove();
    };
    // Sahne yalnızca yerleşim değişince yeniden kurulur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  useEffect(() => { api.current?.refresh(); }, [activity, matches, selected]);

  const workingSlugs = [...activity.entries()].filter(([, a]) => a.state === 'working').map(([slug]) => slug).slice(0, 14);
  const pinned = selected && !workingSlugs.includes(selected) ? [...workingSlugs, selected] : workingSlugs;
  const hoverRole = hover ? people.get(hover) : null;
  const hoverGroup = hover ? layout.rooms.find((r) => r.seats.some((x) => x.slug === hover))?.division : undefined;
  return (
    <div ref={host} className="agency-stage" role="img" aria-label="Üç boyutlu ajans ofisi: bölüm odaları, masalar ve çalışan roller. Aynı bilgi Liste görünümünde metin olarak bulunur.">
      <div ref={labelsRef} className="agency-labels" aria-hidden="true">
        {pinned.map((slug) => {
          const r = people.get(slug);
          const isWorking = workingSlugs.includes(slug);
          return r ? <div key={slug} data-slug={slug} className={`agency-tag ${isWorking ? 'is-working' : ''}`}>{r.image ? <img src={r.image} alt="" /> : r.emoji ? `${r.emoji} ` : ''}{r.name}{isWorking ? ' · çalışıyor' : ''}</div> : null;
        })}
      </div>
      <div ref={tipRef} className="agency-tip" aria-hidden="true" style={{ opacity: hoverRole ? 1 : 0 }}>
        {hoverRole && <><strong>{hoverRole.emoji ? `${hoverRole.emoji} ` : ''}{hoverRole.name}</strong>{hoverGroup && <span>{divisionOf(hoverGroup).label}</span>}</>}
      </div>
    </div>
  );
}
