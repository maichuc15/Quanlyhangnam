import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import * as xb from 'xrblocks';

import {MONTH_NAMES_VI} from '../constants';
import {FamilyStore} from '../store/familyStore';
import {EventBeacon} from './EventBeacon';

const TABLE_RADIUS = 0.44;
const BEACON_RING_RADIUS = 0.34;
const TABLE_Y = 0.92;
const TABLE_Z = -1.02;

/**
 * 3D WebXR Spatial Calendar Pedestal, Lunar-Solar 12-Month Dial,
 * Interactive 3D Event Beacons, and Real-Time 3D Financial Vessels.
 */
export class SpatialCalendarStage extends xb.Script {
  private store: FamilyStore;
  private unsubscribe?: () => void;

  private stageRoot = new THREE.Group();
  private dialTurntable = new THREE.Group();
  private beaconsGroup = new THREE.Group();
  private beacons = new Map<string, EventBeacon>();

  private budgetFillMesh?: THREE.Mesh;
  private fundFillMesh?: THREE.Mesh;
  private fundFillMat?: THREE.MeshStandardMaterial;
  private budgetFillMat?: THREE.MeshStandardMaterial;

  private targetTurntableY = 0;
  private autoRotate = false;
  private targetBudgetRatio = 0.6;
  private targetFundRatio = 0.65;
  private currentBudgetRatio = 0.6;
  private currentFundRatio = 0.65;

  private envTexture?: THREE.Texture;
  private dialTexture?: THREE.CanvasTexture;
  private contactShadowTex?: THREE.CanvasTexture;
  private disposables: {geometries: THREE.BufferGeometry[]; materials: THREE.Material[]} = {
    geometries: [],
    materials: [],
  };

  constructor(store: FamilyStore) {
    super();
    this.store = store;
    this.name = 'Bàn Lịch Gia Đình 3D';
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.disposables.geometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.disposables.materials.push(mat);
    return mat;
  }

  init() {
    this.setupLightingAndEnvironment();

    this.stageRoot.position.set(0, TABLE_Y, TABLE_Z);
    this.add(this.stageRoot);

    this.buildPedestalAndDial();
    this.buildFinancialVessels();

    this.dialTurntable.add(this.beaconsGroup);
    this.stageRoot.add(this.dialTurntable);

    this.syncFromStore();
    this.unsubscribe = this.store.subscribe(() => this.syncFromStore());
  }

  private setupLightingAndEnvironment() {
    // 3-point warm/cool studio rig calibrated for PBR metals & spatial legibility
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1.5);
    this.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff4e0, 2.2);
    keyLight.position.set(1.8, 3.6, 2.0);
    this.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 1.15);
    rimLight.position.set(-2.2, 2.0, -2.5);
    this.add(rimLight);

    // Procedural RoomEnvironment reflections for brushed brass and glass vessels
    try {
      const renderer = xb.core.renderer;
      const scene = xb.core.scene;
      if (renderer && scene && 'capabilities' in renderer) {
        const pmrem = new THREE.PMREMGenerator(renderer as THREE.WebGLRenderer);
        const rt = pmrem.fromScene(new RoomEnvironment(), 0.04);
        this.envTexture = rt.texture;
        scene.environment = this.envTexture;
        pmrem.dispose();
      }
    } catch {
      // Safe fallback when environment generation is unsupported
    }
  }

  private createDialTexture(): THREE.CanvasTexture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      const cx = size / 2;
      const cy = size / 2;

      // Deep indigo-slate lacquer dial background
      const bgGrad = ctx.createRadialGradient(cx, cy, 40, cx, cy, size / 2);
      bgGrad.addColorStop(0, '#1e293b');
      bgGrad.addColorStop(0.65, '#0f172a');
      bgGrad.addColorStop(1, '#09101f');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, size, size);

      // Subtle concentric golden rings
      const rings = [470, 395, 295, 165];
      rings.forEach((r, idx) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = idx === 0 ? 'rgba(212, 175, 55, 0.7)' : 'rgba(148, 163, 184, 0.25)';
        ctx.lineWidth = idx === 0 ? 4 : 2;
        ctx.stroke();
      });

      // 12 Month divisions + Vietnamese month labels
      for (let m = 0; m < 12; m++) {
        const angle = (m / 12) * Math.PI * 2 - Math.PI / 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(cx + cos * 165, cy + sin * 165);
        ctx.lineTo(cx + cos * 470, cy + sin * 470);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Month label placed at mid-sector
        const midAngle = ((m + 0.5) / 12) * Math.PI * 2 - Math.PI / 2;
        const tx = cx + Math.cos(midAngle) * 432;
        const ty = cy + Math.sin(midAngle) * 432;
        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(midAngle + Math.PI / 2);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '600 28px "Be Vietnam Pro", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`T${m + 1}`, 0, 0);
        ctx.restore();
      }

      // Center crest
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 32px "Be Vietnam Pro", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LỊCH GIA ĐÌNH', cx, cy - 22);

      ctx.fillStyle = '#93c5fd';
      ctx.font = '500 24px "Be Vietnam Pro", Arial, sans-serif';
      ctx.fillText('ÂM · DƯƠNG 2026', cx, cy + 20);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const renderer = xb.core.renderer as THREE.WebGLRenderer | undefined;
    if (renderer?.capabilities?.getMaxAnisotropy) {
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }
    this.dialTexture = texture;
    return texture;
  }

  private createContactShadowTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(128, 128, 16, 128, 128, 124);
      grad.addColorStop(0, 'rgba(2, 6, 23, 0.55)');
      grad.addColorStop(0.65, 'rgba(2, 6, 23, 0.22)');
      grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.contactShadowTex = tex;
    return tex;
  }

  private buildPedestalAndDial() {
    // 1. Stepped architectural lathe pedestal
    const profile: THREE.Vector2[] = [
      new THREE.Vector2(0.0, -0.14),
      new THREE.Vector2(0.32, -0.14),
      new THREE.Vector2(0.30, -0.115),
      new THREE.Vector2(0.24, -0.095),
      new THREE.Vector2(0.22, -0.045),
      new THREE.Vector2(TABLE_RADIUS + 0.025, -0.032),
      new THREE.Vector2(TABLE_RADIUS + 0.032, -0.014),
      new THREE.Vector2(TABLE_RADIUS + 0.015, 0.0),
      new THREE.Vector2(0.0, 0.0),
    ];
    const baseGeo = this.trackGeo(new THREE.LatheGeometry(profile, 48));
    const baseMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x162033,
        roughness: 0.45,
        metalness: 0.35,
      }),
    );
    const pedestal = new THREE.Mesh(baseGeo, baseMat);
    pedestal.xb = {pointerEvents: 'none'};
    this.stageRoot.add(pedestal);

    // 2. Brushed brass perimeter bezel
    const bezelGeo = this.trackGeo(new THREE.TorusGeometry(TABLE_RADIUS + 0.016, 0.011, 16, 64));
    const brassMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        roughness: 0.22,
        metalness: 0.88,
      }),
    );
    const bezel = new THREE.Mesh(bezelGeo, brassMat);
    bezel.rotation.x = Math.PI / 2;
    bezel.position.y = -0.002;
    bezel.xb = {pointerEvents: 'none'};
    this.stageRoot.add(bezel);

    // 3. Soft contact shadow disc beneath pedestal
    const shadowGeo = this.trackGeo(new THREE.PlaneGeometry(1.15, 1.15));
    const shadowMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: this.createContactShadowTexture(),
        transparent: true,
        depthWrite: false,
      }),
    );
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.145;
    shadowPlane.xb = {pointerEvents: 'none'};
    this.stageRoot.add(shadowPlane);

    // 4. Rotating calendar dial top plate
    const dialGeo = this.trackGeo(new THREE.CylinderGeometry(TABLE_RADIUS, TABLE_RADIUS, 0.008, 48));
    const dialTopMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: this.createDialTexture(),
        roughness: 0.32,
        metalness: 0.18,
      }),
    );
    const dialSideMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.5,
        metalness: 0.4,
      }),
    );
    const dialMesh = new THREE.Mesh(dialGeo, [dialSideMat, dialTopMat, dialSideMat]);
    dialMesh.position.y = 0.004;
    dialMesh.xb = {pointerEvents: 'none'};
    this.dialTurntable.add(dialMesh);

    // 5. Center decorative lotus-brass hub
    const hubGeo = this.trackGeo(new THREE.CylinderGeometry(0.058, 0.072, 0.022, 24));
    const hubMesh = new THREE.Mesh(hubGeo, brassMat);
    hubMesh.position.y = 0.018;
    hubMesh.xb = {pointerEvents: 'none'};
    this.dialTurntable.add(hubMesh);

    const crystalGeo = this.trackGeo(new THREE.OctahedronGeometry(0.028, 0));
    const crystalMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        emissive: 0x2563eb,
        emissiveIntensity: 0.55,
        roughness: 0.14,
        metalness: 0.35,
      }),
    );
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystal.position.y = 0.056;
    crystal.xb = {pointerEvents: 'none'};
    this.dialTurntable.add(crystal);
  }

  private buildFinancialVessels() {
    const vesselPositions: {x: number; key: 'budget' | 'fund'; color: number}[] = [
      {x: -0.58, key: 'budget', color: 0x2563eb},
      {x: 0.58, key: 'fund', color: 0x16a34a},
    ];

    const capGeo = this.trackGeo(new THREE.CylinderGeometry(0.058, 0.064, 0.016, 24));
    const brassMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        roughness: 0.25,
        metalness: 0.85,
      }),
    );
    const glassGeo = this.trackGeo(new THREE.CylinderGeometry(0.052, 0.052, 0.22, 28, 1, true));
    const glassMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );

    for (const v of vesselPositions) {
      const group = new THREE.Group();
      group.position.set(v.x, -0.02, 0.08);
      group.xb = {pointerEvents: 'none'};

      const base = new THREE.Mesh(capGeo, brassMat);
      base.position.y = 0.008;
      group.add(base);

      const topRingGeo = this.trackGeo(new THREE.TorusGeometry(0.053, 0.0045, 10, 28));
      const topRing = new THREE.Mesh(topRingGeo, brassMat);
      topRing.rotation.x = Math.PI / 2;
      topRing.position.y = 0.236;
      group.add(topRing);

      // Fill column pivoted from bottom (unit height 0.20, scaled on Y)
      const fillGeo = this.trackGeo(new THREE.CylinderGeometry(0.042, 0.042, 0.2, 24));
      fillGeo.translate(0, 0.1, 0);
      const fillMat = this.trackMat(
        new THREE.MeshStandardMaterial({
          color: v.color,
          emissive: v.color,
          emissiveIntensity: 0.45,
          roughness: 0.25,
          metalness: 0.25,
        }),
      );
      const fillMesh = new THREE.Mesh(fillGeo, fillMat);
      fillMesh.position.y = 0.018;
      group.add(fillMesh);

      const glass = new THREE.Mesh(glassGeo, glassMat);
      glass.position.y = 0.126;
      glass.renderOrder = 3;
      group.add(glass);

      if (v.key === 'budget') {
        this.budgetFillMesh = fillMesh;
        this.budgetFillMat = fillMat;
      } else {
        this.fundFillMesh = fillMesh;
        this.fundFillMat = fillMat;
      }

      this.stageRoot.add(group);
    }
  }

  toggleAutoRotate(): boolean {
    this.autoRotate = !this.autoRotate;
    return this.autoRotate;
  }

  rotateDialBy(deltaRadians: number) {
    this.autoRotate = false;
    this.targetTurntableY += deltaRadians;
  }

  focusMonth(month: number) {
    // Rotate dial so the requested month faces +Z (toward the viewer)
    const sectorAngle = ((month - 0.5) / 12) * Math.PI * 2;
    this.targetTurntableY = -sectorAngle + Math.PI;
  }

  private syncFromStore() {
    const state = this.store.getState();
    const events = this.store.getFamilyEvents();
    const summary = this.store.getFinancialSummary();

    // Update 3D financial vessel target levels
    this.targetBudgetRatio = THREE.MathUtils.clamp(
      summary.annualBudget > 0 ? summary.remainingBudget / summary.annualBudget : 0,
      0.04,
      1.0,
    );
    const fundScaleMax = Math.max(summary.fundTotalIn, 15_000_000);
    this.targetFundRatio = THREE.MathUtils.clamp(
      summary.fundBalance / fundScaleMax,
      0.04,
      1.0,
    );

    if (this.budgetFillMat) {
      const col = summary.remainingBudget < 0 ? 0xdc2626 : 0x2563eb;
      this.budgetFillMat.color.setHex(col);
      this.budgetFillMat.emissive.setHex(col);
    }
    if (this.fundFillMat) {
      const col = summary.fundBalance < 2_000_000 ? 0xf59e0b : 0x16a34a;
      this.fundFillMat.color.setHex(col);
      this.fundFillMat.emissive.setHex(col);
    }

    // Rebuild EventBeacons on the 12-month dial
    for (const beacon of this.beacons.values()) {
      this.beaconsGroup.remove(beacon);
      beacon.dispose();
    }
    this.beacons.clear();

    // Group events by month to fan out same-month events cleanly without overlap
    const monthBuckets = new Map<number, number>();
    const visibleEvents = events.slice(0, 14);
    let selectedAngle: number | null = null;

    visibleEvents.forEach((ev, idx) => {
      const month = Number(ev.eventDate.slice(5, 7)) || 1;
      const day = Number(ev.eventDate.slice(8, 10)) || 15;
      const bucketCount = monthBuckets.get(month) ?? 0;
      monthBuckets.set(month, bucketCount + 1);

      const angle = (((month - 1) + day / 31) / 12) * Math.PI * 2 - Math.PI / 2;
      const radialOffset = bucketCount % 2 === 0 ? 0 : -0.085;
      const radius = BEACON_RING_RADIUS + radialOffset;

      const beacon = new EventBeacon(ev, idx * 0.7, (pickedId) => {
        this.store.selectEvent(pickedId);
      });
      beacon.position.set(Math.cos(angle) * radius, 0.082, Math.sin(angle) * radius);
      beacon.setBaseHeight(0.082);
      const isSelected = ev.id === state.selectedEventId;
      beacon.setSelected(isSelected);
      if (isSelected) {
        selectedAngle = angle;
      }

      this.beaconsGroup.add(beacon);
      this.beacons.set(ev.id, beacon);
    });

    if (selectedAngle !== null && !this.autoRotate) {
      // Gently turn selected event toward viewer (+Z is PI/2 in XZ sin/cos)
      this.targetTurntableY = selectedAngle - Math.PI / 2;
    }

    // Keep MONTH_NAMES_VI referenced cleanly if needed for accessibility
    this.dialTurntable.name = `Đĩa lịch 12 tháng (${MONTH_NAMES_VI[state.selectedMonth - 1]})`;
  }

  update() {
    const dt = Math.min(xb.getDeltaTime() || 0.016, 0.05);

    if (this.autoRotate) {
      this.targetTurntableY += dt * 0.35;
    }
    this.dialTurntable.rotation.y = THREE.MathUtils.damp(
      this.dialTurntable.rotation.y,
      this.targetTurntableY,
      5.5,
      dt,
    );

    // Smoothly animate 3D financial vessel columns
    this.currentBudgetRatio = THREE.MathUtils.damp(
      this.currentBudgetRatio,
      this.targetBudgetRatio,
      6,
      dt,
    );
    this.currentFundRatio = THREE.MathUtils.damp(
      this.currentFundRatio,
      this.targetFundRatio,
      6,
      dt,
    );

    if (this.budgetFillMesh) {
      this.budgetFillMesh.scale.y = this.currentBudgetRatio;
    }
    if (this.fundFillMesh) {
      this.fundFillMesh.scale.y = this.currentFundRatio;
    }
  }

  dispose() {
    this.unsubscribe?.();
    for (const beacon of this.beacons.values()) {
      beacon.dispose();
    }
    this.beacons.clear();
    for (const g of this.disposables.geometries) g.dispose();
    for (const m of this.disposables.materials) m.dispose();
    this.dialTexture?.dispose();
    this.contactShadowTex?.dispose();
    this.envTexture?.dispose();
  }
}
