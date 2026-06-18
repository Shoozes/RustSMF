import * as THREE from 'three';

export interface ModernSkeletonHelperOptions {
  colorBone?: number;
  colorLeaf?: number;
  colorJoint?: number;
  boneThickness?: number;
  jointRadius?: number;
  showBones?: boolean;
  showLeafs?: boolean;
  showJoints?: boolean;
  depthTest?: boolean;
}

type BoneMeshItem = {
  parent: THREE.Bone;
  child: THREE.Bone;
  mesh: THREE.Mesh;
  isLeaf: boolean;
};

type JointMeshItem = {
  bone: THREE.Bone;
  mesh: THREE.Mesh;
};

export type DisposableSkeletonHelper = THREE.Object3D & { dispose?: () => void };

function markHelperObject(object: THREE.Object3D, bone?: THREE.Bone): void {
  object.userData = {
    ...object.userData,
    export: false,
    helper: true,
    isModernSkeletonHelperPart: true,
    boneName: bone?.name,
    boneObject: bone,
  };
  object.frustumCulled = false;
}

function makeDiamondBoneGeometry(): THREE.BufferGeometry {
  const width = 1;
  const neck = 0.2;
  const length = 1;
  const vertices = [
    0, 0, 0, width, 0, neck, 0, -width, neck,
    0, 0, 0, 0, -width, neck, -width, 0, neck,
    0, 0, 0, -width, 0, neck, 0, width, neck,
    0, 0, 0, 0, width, neck, width, 0, neck,
    0, 0, length, 0, -width, neck, width, 0, neck,
    0, 0, length, -width, 0, neck, 0, -width, neck,
    0, 0, length, 0, width, neck, -width, 0, neck,
    0, 0, length, width, 0, neck, 0, width, neck,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function getBones(root: THREE.Object3D): THREE.Bone[] {
  const bones: THREE.Bone[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Bone) {
      bones.push(object);
    }
  });
  return bones;
}

function estimateAverageBoneLength(root: THREE.Object3D, bones: THREE.Bone[]): number {
  root.updateMatrixWorld(true);
  let total = 0;
  let count = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  for (const bone of bones) {
    bone.getWorldPosition(a);
    for (const child of bone.children) {
      if (child instanceof THREE.Bone) {
        child.getWorldPosition(b);
        total += a.distanceTo(b);
        count += 1;
      }
    }
  }

  return count > 0 ? total / count : 1;
}

export class ModernSkeletonHelper extends THREE.Group {
  readonly root: THREE.Object3D;

  private readonly boneGeometry = makeDiamondBoneGeometry();
  private readonly jointGeometry = new THREE.OctahedronGeometry(1, 0);
  private readonly boneMaterial: THREE.MeshBasicMaterial;
  private readonly leafMaterial: THREE.MeshBasicMaterial;
  private readonly jointMaterial: THREE.MeshBasicMaterial;
  private readonly boneItems: BoneMeshItem[] = [];
  private readonly jointItems: JointMeshItem[] = [];
  private readonly averageBoneLength: number;
  private readonly baseBoneThickness: number;
  private readonly baseJointRadius: number;
  private readonly showBones: boolean;
  private readonly showLeafs: boolean;
  private readonly showJoints: boolean;

  constructor(root: THREE.Object3D, options: ModernSkeletonHelperOptions = {}) {
    super();
    this.name = 'ModernSkeletonHelper';
    this.root = root;
    this.renderOrder = 999;
    markHelperObject(this);

    const {
      colorBone = 0x7dd3fc,
      colorLeaf = 0xfacc15,
      colorJoint = 0x38bdf8,
      boneThickness = 0.06,
      jointRadius = 0.085,
      showBones = true,
      showLeafs = true,
      showJoints = true,
      depthTest = false,
    } = options;

    this.showBones = showBones;
    this.showLeafs = showLeafs;
    this.showJoints = showJoints;
    this.baseBoneThickness = boneThickness;
    this.baseJointRadius = jointRadius;

    this.boneMaterial = new THREE.MeshBasicMaterial({
      color: colorBone,
      depthTest,
      depthWrite: false,
      transparent: true,
      opacity: 0.7,
      wireframe: true,
    });
    this.leafMaterial = new THREE.MeshBasicMaterial({
      color: colorLeaf,
      depthTest,
      depthWrite: false,
      transparent: true,
      opacity: 0.75,
      wireframe: true,
    });
    this.jointMaterial = new THREE.MeshBasicMaterial({
      color: colorJoint,
      depthTest,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
      wireframe: true,
    });

    const bones = getBones(root);
    this.averageBoneLength = Math.max(0.1, estimateAverageBoneLength(root, bones));
    this.build(bones);
  }

  private build(bones: THREE.Bone[]): void {
    for (const bone of bones) {
      const joint = new THREE.Mesh(this.jointGeometry, this.jointMaterial);
      joint.matrixAutoUpdate = false;
      joint.visible = this.showJoints;
      markHelperObject(joint, bone);
      this.add(joint);
      this.jointItems.push({ bone, mesh: joint });

      for (const child of bone.children) {
        if (!(child instanceof THREE.Bone)) continue;
        const isLeaf = child.children.every((grandchild) => !(grandchild instanceof THREE.Bone));
        const mesh = new THREE.Mesh(this.boneGeometry, isLeaf ? this.leafMaterial : this.boneMaterial);
        mesh.matrixAutoUpdate = false;
        mesh.visible = isLeaf ? this.showLeafs : this.showBones;
        markHelperObject(mesh, child);
        this.add(mesh);
        this.boneItems.push({ parent: bone, child, mesh, isLeaf });
      }
    }
  }

  override updateMatrixWorld(force?: boolean): void {
    const thickness = this.baseBoneThickness * this.averageBoneLength;
    const jointRadius = this.baseJointRadius * this.averageBoneLength;
    const parentPos = new THREE.Vector3();
    const childPos = new THREE.Vector3();
    const localPos = new THREE.Vector3();

    for (const item of this.jointItems) {
      item.mesh.visible = this.showJoints;
      item.bone.getWorldPosition(localPos);
      this.worldToLocal(localPos);
      item.mesh.position.copy(localPos);
      item.mesh.scale.setScalar(jointRadius);
      item.mesh.updateMatrix();
    }

    for (const item of this.boneItems) {
      item.mesh.visible = item.isLeaf ? this.showLeafs : this.showBones;
      item.parent.getWorldPosition(parentPos);
      item.child.getWorldPosition(childPos);
      const distance = parentPos.distanceTo(childPos);
      localPos.copy(parentPos);
      this.worldToLocal(localPos);
      item.mesh.position.copy(localPos);
      item.mesh.lookAt(childPos);
      item.mesh.scale.set(thickness, thickness, Math.max(distance, 0.0001));
      item.mesh.updateMatrix();
    }

    super.updateMatrixWorld(force);
  }

  dispose(): void {
    this.boneGeometry.dispose();
    this.jointGeometry.dispose();
    this.boneMaterial.dispose();
    this.leafMaterial.dispose();
    this.jointMaterial.dispose();
  }
}

export function findBoneNameFromSkeletonHelperHit(hit: THREE.Intersection): string | null {
  let object: THREE.Object3D | null = hit.object;
  while (object) {
    const name = object.userData?.boneName;
    if (typeof name === 'string' && name.length > 0) {
      return name;
    }
    object = object.parent;
  }
  return null;
}
