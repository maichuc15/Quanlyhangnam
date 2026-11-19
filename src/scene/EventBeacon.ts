import * as THREE from 'three';
import * as xb from 'xrblocks';

import {EVENT_TYPE_META, PRIORITY_META, URGENCY_META} from '../constants';
import {EventPriority, EventType, FamilyEvent} from '../types';
import {audioFeedback} from '../utils/audioFeedback';
import {getDaysDifference, getTimeUrgency} from '../utils/lunarCalendar';

/**
 * Interactive composite 3D Event Sculpture placed on the Spatial Calendar Ring.
 * Built from multiple procedural PBR parts (plinth, stem, emblem silhouette, priority halo)
 * so every event in the VR space is directly pointable, hoverable, and clickable.
 */
export class EventBeacon extends xb.MeshScript {
  readonly eventId: string;
  private eventData: FamilyEvent;
  private onPick: (eventId: string) => void;
  private isSelected = false;
  private isHovered = false;
  private baseY = 0;
  private phaseOffset: number;

  private visualGroup = new THREE.Group();
  private emblemGroup = new THREE.Group();
  private haloRing?: THREE.Mesh;
  private glowCoreMat?: THREE.MeshStandardMaterial;
  private disposables: {geometries: THREE.BufferGeometry[]; materials: THREE.Material[]} = {
    geometries: [],
    materials: [],
  };

  constructor(eventData: FamilyEvent, phaseOffset: number, onPick: (eventId: string) => void) {
    // Invisible simplified hit cylinder for crisp, forgiving XR raycasting
    const hitGeometry = new THREE.CylinderGeometry(0.055, 0.055, 0.16, 12);
    const hitMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    super(hitGeometry, hitMaterial);
    this.disposables.geometries.push(hitGeometry);
    this.disposables.materials.push(hitMaterial);

    this.eventId = eventData.id;
    this.eventData = eventData;
    this.phaseOffset = phaseOffset;
    this.onPick = onPick;
    this.name = `Sự kiện 3D: ${eventData.title}`;

    this.visualGroup.xb = {pointerEvents: 'none'};
    this.add(this.visualGroup);
    this.buildCompositeSculpture();
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.disposables.geometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.disposables.materials.push(mat);
    return mat;
  }

  private buildCompositeSculpture() {
    const daysUntil = getDaysDifference(this.eventData.eventDate);
    const urgency = getTimeUrgency(daysUntil);
    const urgencyColor = URGENCY_META[urgency].colorHex;
    const priorityColor = PRIORITY_META[this.eventData.priority].colorHex;
    const typeColor = EVENT_TYPE_META[this.eventData.eventType].colorHex;

    // 1. Primary grounded brass/slate stepped plinth (bottom-center aligned at y = -0.07)
    const plinthGeo = this.trackGeo(new THREE.CylinderGeometry(0.036, 0.044, 0.016, 24));
    const plinthMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.42,
        metalness: 0.65,
      }),
    );
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.y = -0.068;
    this.visualGroup.add(plinth);

    // 2. Urgency collar ring around plinth
    const collarGeo = this.trackGeo(new THREE.TorusGeometry(0.038, 0.0045, 12, 28));
    const collarMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: urgencyColor,
        emissive: urgencyColor,
        emissiveIntensity: daysUntil >= 0 && daysUntil <= 3 ? 0.9 : 0.45,
        roughness: 0.25,
        metalness: 0.4,
      }),
    );
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = -0.058;
    this.visualGroup.add(collar);

    // 3. Slender brass stem
    const stemGeo = this.trackGeo(new THREE.CylinderGeometry(0.005, 0.008, 0.05, 14));
    const brassMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        roughness: 0.22,
        metalness: 0.88,
      }),
    );
    const stem = new THREE.Mesh(stemGeo, brassMat);
    stem.position.y = -0.035;
    this.visualGroup.add(stem);

    // 4. Floating emblem group (type-specific multi-part sculpture)
    this.emblemGroup.position.y = 0.025;
    this.visualGroup.add(this.emblemGroup);

    const coreMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: typeColor,
        emissive: typeColor,
        emissiveIntensity: 0.35,
        roughness: 0.2,
        metalness: 0.3,
      }),
    );
    this.glowCoreMat = coreMat;

    const accentMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.35,
        roughness: 0.18,
        metalness: 0.82,
      }),
    );

    if (this.eventData.eventType === EventType.WEDDING) {
      // Interlocking twin wedding rings + ruby jewel
      const ringGeo = this.trackGeo(new THREE.TorusGeometry(0.024, 0.005, 14, 28));
      const r1 = new THREE.Mesh(ringGeo, accentMat);
      r1.position.x = -0.011;
      r1.rotation.y = 0.45;
      const r2 = new THREE.Mesh(ringGeo, accentMat);
      r2.position.x = 0.011;
      r2.rotation.y = -0.45;
      r2.rotation.x = 0.5;
      const gemGeo = this.trackGeo(new THREE.OctahedronGeometry(0.012, 0));
      const gem = new THREE.Mesh(gemGeo, coreMat);
      gem.position.y = 0.024;
      this.emblemGroup.add(r1, r2, gem);
    } else if (
      this.eventData.eventType === EventType.DEATH_ANNIVERSARY ||
      this.eventData.eventType === EventType.CLAN_CEREMONY ||
      this.eventData.eventType === EventType.FUNERAL
    ) {
      // Traditional memorial lantern (top cap, ribbed body, warm inner flame, bottom tassel cap)
      const capGeo = this.trackGeo(new THREE.CylinderGeometry(0.014, 0.024, 0.012, 8));
      const topCap = new THREE.Mesh(capGeo, brassMat);
      topCap.position.y = 0.028;
      const botCap = new THREE.Mesh(capGeo, brassMat);
      botCap.rotation.x = Math.PI;
      botCap.position.y = -0.024;
      const bodyGeo = this.trackGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.044, 8));
      const body = new THREE.Mesh(bodyGeo, coreMat);
      body.position.y = 0.002;
      const finialGeo = this.trackGeo(new THREE.ConeGeometry(0.008, 0.018, 8));
      const finial = new THREE.Mesh(finialGeo, accentMat);
      finial.position.y = 0.042;
      this.emblemGroup.add(topCap, body, botCap, finial);
    } else if (
      this.eventData.eventType === EventType.BIRTHDAY ||
      this.eventData.eventType === EventType.FULL_MONTH ||
      this.eventData.eventType === EventType.FIRST_BIRTHDAY
    ) {
      // Tiered celebration cake / gift crown
      const tier1Geo = this.trackGeo(new THREE.CylinderGeometry(0.028, 0.03, 0.02, 20));
      const tier1 = new THREE.Mesh(tier1Geo, coreMat);
      tier1.position.y = -0.006;
      const tier2Geo = this.trackGeo(new THREE.CylinderGeometry(0.019, 0.02, 0.016, 20));
      const tier2 = new THREE.Mesh(tier2Geo, accentMat);
      tier2.position.y = 0.012;
      const flameGeo = this.trackGeo(new THREE.ConeGeometry(0.006, 0.016, 12));
      const flame = new THREE.Mesh(flameGeo, accentMat);
      flame.position.y = 0.028;
      this.emblemGroup.add(tier1, tier2, flame);
    } else {
      // Faceted crystal prism inside brass orbit frame
      const prismGeo = this.trackGeo(new THREE.OctahedronGeometry(0.024, 0));
      const prism = new THREE.Mesh(prismGeo, coreMat);
      const orbitGeo = this.trackGeo(new THREE.TorusGeometry(0.031, 0.003, 10, 24));
      const orbit = new THREE.Mesh(orbitGeo, brassMat);
      orbit.rotation.x = Math.PI / 3;
      this.emblemGroup.add(prism, orbit);
    }

    // 5. Priority halo indicator ring (distinct from urgency collar)
    const haloRadius = this.eventData.priority === EventPriority.IMPORTANT ? 0.046 : 0.042;
    const haloGeo = this.trackGeo(new THREE.TorusGeometry(haloRadius, 0.0028, 10, 32));
    const haloMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: priorityColor,
        emissive: priorityColor,
        emissiveIntensity: this.eventData.priority === EventPriority.IMPORTANT ? 0.9 : 0.4,
        roughness: 0.2,
        metalness: 0.6,
      }),
    );
    this.haloRing = new THREE.Mesh(haloGeo, haloMat);
    this.haloRing.rotation.x = Math.PI / 2;
    this.haloRing.position.y = 0.025;
    this.visualGroup.add(this.haloRing);
  }

  setBaseHeight(y: number) {
    this.baseY = y;
    this.position.y = y;
  }

  setSelected(selected: boolean) {
    this.isSelected = selected;
  }

  onHoverEnter(event: xb.HoverEvent) {
    this.isHovered = true;
    event.stopPropagation();
  }

  onHoverExit(event: xb.HoverEvent) {
    this.isHovered = false;
    event.stopPropagation();
  }

  onObjectSelectStart(event: xb.SelectEvent) {
    audioFeedback.playSelect();
    this.onPick(this.eventId);
    event.stopPropagation();
  }

  onObjectTouchStart(event: xb.ObjectTouchStartEvent) {
    event.preventDefault();
    audioFeedback.playSelect();
    this.onPick(this.eventId);
    event.stopPropagation();
  }

  update() {
    const dt = Math.min(xb.getDeltaTime() || 0.016, 0.05);
    const t = performance.now() * 0.001 + this.phaseOffset;

    const targetScale = this.isSelected ? 1.28 : this.isHovered ? 1.15 : 1.0;
    const nextScale = THREE.MathUtils.damp(this.visualGroup.scale.x, targetScale, 10, dt);
    this.visualGroup.scale.setScalar(nextScale);

    const bobAmp = this.isSelected ? 0.014 : 0.006;
    const targetEmblemY = 0.025 + Math.sin(t * 2.2) * bobAmp + (this.isSelected ? 0.016 : 0);
    this.emblemGroup.position.y = THREE.MathUtils.damp(this.emblemGroup.position.y, targetEmblemY, 8, dt);
    this.emblemGroup.rotation.y += dt * (this.isSelected ? 1.35 : 0.45);

    if (this.haloRing) {
      this.haloRing.rotation.z = t * 0.8;
      this.haloRing.position.y = this.emblemGroup.position.y;
    }

    if (this.glowCoreMat) {
      const targetEmissive = this.isSelected ? 1.0 : this.isHovered ? 0.72 : 0.35;
      this.glowCoreMat.emissiveIntensity = THREE.MathUtils.damp(
        this.glowCoreMat.emissiveIntensity,
        targetEmissive,
        10,
        dt,
      );
    }

    this.position.y = this.baseY;
  }

  dispose() {
    for (const g of this.disposables.geometries) g.dispose();
    for (const m of this.disposables.materials) m.dispose();
  }
}
