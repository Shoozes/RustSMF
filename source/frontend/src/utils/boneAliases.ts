import * as THREE from 'three';

type MixamoAliasDefinition = {
  source: string;
  parent: string | null;
  alias: string;
};

const MIXAMO_MINIMAL_ALIASES: MixamoAliasDefinition[] = [
  { source: 'SMF_Node_2', parent: null, alias: 'mixamorig:Hips' },
  { source: 'SMF_Node_3', parent: 'SMF_Node_2', alias: 'mixamorig:Spine' },
  { source: 'SMF_Node_4', parent: 'SMF_Node_3', alias: 'mixamorig:Spine1' },
  { source: 'SMF_Node_6', parent: 'SMF_Node_4', alias: 'mixamorig:Neck' },
  { source: 'SMF_Node_8', parent: 'SMF_Node_6', alias: 'mixamorig:Head' },
  { source: 'SMF_Node_10', parent: 'SMF_Node_8', alias: 'mixamorig:HeadTop_End' },
  { source: 'SMF_Node_12', parent: 'SMF_Node_4', alias: 'mixamorig:LeftArm' },
  { source: 'SMF_Node_13', parent: 'SMF_Node_12', alias: 'mixamorig:LeftForeArm' },
  { source: 'SMF_Node_14', parent: 'SMF_Node_13', alias: 'mixamorig:LeftHand' },
  { source: 'SMF_Node_15', parent: 'SMF_Node_14', alias: 'mixamorig:LeftHandEnd' },
  { source: 'SMF_Node_17', parent: 'SMF_Node_4', alias: 'mixamorig:RightArm' },
  { source: 'SMF_Node_18', parent: 'SMF_Node_17', alias: 'mixamorig:RightForeArm' },
  { source: 'SMF_Node_19', parent: 'SMF_Node_18', alias: 'mixamorig:RightHand' },
  { source: 'SMF_Node_21', parent: 'SMF_Node_19', alias: 'mixamorig:RightHandEnd' },
  { source: 'SMF_Node_23', parent: null, alias: 'mixamorig:LeftUpLeg' },
  { source: 'SMF_Node_24', parent: 'SMF_Node_23', alias: 'mixamorig:LeftLeg' },
  { source: 'SMF_Node_25', parent: 'SMF_Node_24', alias: 'mixamorig:LeftFoot' },
  { source: 'SMF_Node_27', parent: 'SMF_Node_25', alias: 'mixamorig:LeftToeBase' },
  { source: 'SMF_Node_29', parent: 'SMF_Node_27', alias: 'mixamorig:LeftToe_End' },
  { source: 'SMF_Node_31', parent: null, alias: 'mixamorig:RightUpLeg' },
  { source: 'SMF_Node_32', parent: 'SMF_Node_31', alias: 'mixamorig:RightLeg' },
  { source: 'SMF_Node_33', parent: 'SMF_Node_32', alias: 'mixamorig:RightFoot' },
  { source: 'SMF_Node_35', parent: 'SMF_Node_33', alias: 'mixamorig:RightToeBase' },
  { source: 'SMF_Node_37', parent: 'SMF_Node_35', alias: 'mixamorig:RightToe_End' },
];

export type BoneAliasMap = ReadonlyMap<string, string>;

export function deriveMixamoMinimalBoneAliases(bones: readonly THREE.Bone[]): BoneAliasMap {
  if (bones.length !== MIXAMO_MINIMAL_ALIASES.length) return new Map();
  const byName = new Map(bones.map((bone) => [bone.name, bone]));

  for (const definition of MIXAMO_MINIMAL_ALIASES) {
    const bone = byName.get(definition.source);
    if (!bone) return new Map();
    const parentName = bone.parent instanceof THREE.Bone ? bone.parent.name : null;
    if (parentName !== definition.parent) return new Map();
  }

  return new Map(MIXAMO_MINIMAL_ALIASES.map(({ source, alias }) => [source, alias]));
}

export function formatBoneDisplayName(sourceName: string, aliases: BoneAliasMap): string {
  const alias = aliases.get(sourceName);
  return alias ? `${sourceName} · ${alias.replace(/^mixamorig:/, '')}` : sourceName;
}
