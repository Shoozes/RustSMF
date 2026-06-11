import {
  Object3D,
  Vector3,
  OctahedronGeometry,
  MeshBasicMaterial,
  Mesh,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  LinearFilter
} from 'three';

function shortenBoneName(originalName) {
  let name = originalName;
  name = name.replace(/mixamorig/gi, '');
  name = name.replace(/\bLeft\b/gi, 'L');
  name = name.replace(/\bRight\b/gi, 'R');
  name = name.replace(/ForeArm/gi, 'Fore');
  name = name.replace(/UpLeg/gi, 'UpLg');
  name = name.replace(/[_\s]+/g, ' ');
  name = name.trim();
  return name || 'Bone';
}

function createLabelSprite(text, parameters = {}) {
  const fontface = parameters.fontface || "Arial";
  const fontsize = parameters.fontsize || 24 * 18; // Scaled for 180-unit scene
  const borderThickness = parameters.borderThickness || 2 * 18; // Scaled
  const borderColor = parameters.borderColor || { r: 0, g: 0, b: 0, a: 1.0 };
  const backgroundColor = parameters.backgroundColor || { r: 0, g: 0, b: 0, a: 0.5 };
  const textColor = parameters.textColor || "white";
  const resolutionScale = 2;
  const depthTest = parameters.depthTest !== undefined ? parameters.depthTest : false;

  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = `${fontsize}px ${fontface}`;
  const textWidth = measureCtx.measureText(text).width;

  const canvas = document.createElement('canvas');
  canvas.width = (textWidth + borderThickness * 2) * resolutionScale;
  canvas.height = (fontsize * 1.4 + borderThickness * 2) * resolutionScale;

  const ctx = canvas.getContext('2d');
  ctx.scale(resolutionScale, resolutionScale);
  ctx.fillStyle = `rgba(${backgroundColor.r},${backgroundColor.g},${backgroundColor.b},${backgroundColor.a})`;
  ctx.fillRect(0, 0, canvas.width / resolutionScale, canvas.height / resolutionScale);
  ctx.strokeStyle = `rgba(${borderColor.r},${borderColor.g},${borderColor.b},${borderColor.a})`;
  ctx.lineWidth = borderThickness;
  ctx.strokeRect(0, 0, canvas.width / resolutionScale, canvas.height / resolutionScale);
  ctx.font = `${fontsize}px ${fontface}`;
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    text,
    (canvas.width / resolutionScale) * 0.5,
    (canvas.height / resolutionScale) * 0.5
  );

  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;

  const spriteMaterial = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest,
    depthWrite: false
  });

  const sprite = new Sprite(spriteMaterial);
  sprite.scale.set(1, canvas.height / canvas.width, 1);
  return sprite;
}

export class CustomSkeletonHelper extends Object3D {
  constructor(skinnedMesh, options = {}) {
    super();
    this.isSkeletonHelper = true;
    this.skinnedMesh = skinnedMesh;
    this.skeleton = skinnedMesh.skeleton;
    this.bones = this.skeleton.bones;
    this.boneHelpers = [];
    this.labels = [];
    this.skeletonScale = options.skeletonScale !== undefined ? options.skeletonScale : 1;
    this.maxBoneVisualLength = options.maxBoneVisualLength || 1.0 * 18; // Scaled for 180-unit scene
    this.depthTest = options.depthTest !== undefined ? options.depthTest : false;

    this._initHelpers();
    this._initLabels();
  }

  _isBoneOrEndNode(obj) {
    if (obj.isBone) return true;
    const nameLC = (obj.name || '').toLowerCase();
    return nameLC.includes('end') || nameLC.includes('top') || nameLC.includes('tip');
  }

  _isLeafBone(bone) {
    return !bone.children.some(child => this._isBoneOrEndNode(child));
  }

  _initHelpers() {
    this.bones.forEach(bone => {
      bone.children.forEach(child => {
        if (this._isBoneOrEndNode(child)) {
          const boneMaterial = new MeshBasicMaterial({ color: 0x00ff00, wireframe: true, depthTest: this.depthTest });
          const boneMesh = new Mesh(new OctahedronGeometry(1), boneMaterial);
          this.add(boneMesh);

          const parentColor = this._isLeafBone(bone) ? 0xff0000 : 0xffff00;
          const parentMesh = new Mesh(
            new OctahedronGeometry(1),
            new MeshBasicMaterial({ color: parentColor, wireframe: true, depthTest: this.depthTest })
          );
          this.add(parentMesh);

          const childColor = this._isLeafBone(child) ? 0xff0000 : 0xffff00;
          const childMesh = new Mesh(
            new OctahedronGeometry(1),
            new MeshBasicMaterial({ color: childColor, wireframe: true, depthTest: this.depthTest })
          );
          this.add(childMesh);

          this.boneHelpers.push({
            parentBone: bone,
            childBone: child,
            boneMesh,
            parentMesh,
            childMesh
          });
        }
      });
    });
  }

  _initLabels() {
    const skipKeywords = ["index", "middle", "pinky", "ring", "thumb", "toe", "toebase"];
    this.bones.forEach(bone => {
      const boneNameLC = bone.name.toLowerCase();
      if (skipKeywords.some(k => boneNameLC.includes(k))) return;
      const shortName = shortenBoneName(bone.name);
      const label = createLabelSprite(shortName, {
        fontsize: 24 * 18, // Scaled for 180-unit scene
        fontface: "Arial",
        textColor: "white",
        backgroundColor: { r: 0, g: 0, b: 0, a: 0.5 },
        borderThickness: 2 * 18,
        depthTest: this.depthTest
      });
      this.add(label);
      this.labels.push({ bone, label });
    });
  }

  setDepthTest(depthTest) {
    this.depthTest = depthTest;
    this.boneHelpers.forEach(({ boneMesh, parentMesh, childMesh }) => {
      boneMesh.material.depthTest = depthTest;
      parentMesh.material.depthTest = depthTest;
      childMesh.material.depthTest = depthTest;
      boneMesh.material.needsUpdate = true;
      parentMesh.material.needsUpdate = true;
      childMesh.material.needsUpdate = true;
    });
    this.labels.forEach(({ label }) => {
      label.material.depthTest = depthTest;
      label.material.needsUpdate = true;
    });
  }

  updateMatrixWorld(force) {
    const model = this.skinnedMesh && this.skinnedMesh.parent;
    if (!model || typeof model.getWorldScale !== 'function') {
      super.updateMatrixWorld(force);
      return;
    }

    const scaleFactor = 18; // 180 / 10 for app's scene scale
    const boneThickness = 0.05 * scaleFactor;
    const jointSize = 0.1 * scaleFactor;
    const labelSize = 0.25 * scaleFactor;
    const labelOffset = 0.01 * scaleFactor;
    const visualLength = Math.min(this.maxBoneVisualLength, this.maxBoneVisualLength * scaleFactor);

    const worldScale = model.getWorldScale(new Vector3());
    const inverseScale = new Vector3(
      worldScale.x !== 0 ? 1 / worldScale.x : 1,
      worldScale.y !== 0 ? 1 / worldScale.y : 1,
      worldScale.z !== 0 ? 1 / worldScale.z : 1
    );

    const tmpParentPos = new Vector3();
    const tmpChildPos = new Vector3();
    const tmpMid = new Vector3();

    this.boneHelpers.forEach(({ parentBone, childBone, boneMesh, parentMesh, childMesh }) => {
      tmpParentPos.setFromMatrixPosition(parentBone.matrixWorld);
      tmpChildPos.setFromMatrixPosition(childBone.matrixWorld);

      const parentLocal = model.worldToLocal(tmpParentPos.clone());
      const childLocal = model.worldToLocal(tmpChildPos.clone());
      tmpMid.copy(parentLocal).add(childLocal).multiplyScalar(0.5);

      const worldDist = tmpParentPos.distanceTo(tmpChildPos);

      boneMesh.position.copy(tmpMid);
      boneMesh.lookAt(tmpChildPos);
      boneMesh.scale.set(boneThickness, boneThickness, worldDist * 0.5).multiply(inverseScale);

      parentMesh.position.copy(parentLocal);
      parentMesh.scale.set(jointSize, jointSize, jointSize).multiply(inverseScale);

      childMesh.position.copy(childLocal);
      childMesh.scale.set(jointSize, jointSize, jointSize).multiply(inverseScale);
    });

    this.labels.forEach(({ bone, label }) => {
      const pos = new Vector3().setFromMatrixPosition(bone.matrixWorld);
      pos.y += labelOffset;
      label.position.copy(model.worldToLocal(pos.clone()));
      label.scale.set(labelSize, labelSize * (label.material.map.image.height / label.material.map.image.width), labelSize).multiply(inverseScale);
    });

    super.updateMatrixWorld(force);
  }
}
