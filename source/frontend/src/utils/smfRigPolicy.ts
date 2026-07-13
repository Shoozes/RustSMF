export type SmfRigPolicyId = 'rename' | 'structure' | 'bind-transform' | 'mirror' | 'reset';

export interface SmfRigPolicy {
  id: SmfRigPolicyId;
  label: string;
  supported: boolean;
  reason: string;
}

export type SmfRigControl =
  | 'rename'
  | 'reparent'
  | 'create-child'
  | 'delete'
  | 'detach-connect'
  | 'move'
  | 'rotate'
  | 'spin'
  | 'snap'
  | 'mirror'
  | 'reset';

export const SMF_RIG_POLICIES: Readonly<Record<SmfRigPolicyId, SmfRigPolicy>> = {
  rename: {
    id: 'rename',
    label: 'Names',
    supported: false,
    reason: 'SMF v11/v12 node records have no persisted name field; indexed SMF_Node_N names remain canonical.',
  },
  structure: {
    id: 'structure',
    label: 'Structure',
    supported: false,
    reason: 'SMF structure edits would rewrite parent/isBone records, head nodes, skin indices, and animation node identity.',
  },
  'bind-transform': {
    id: 'bind-transform',
    label: 'Bind transforms',
    supported: false,
    reason: 'SMF bind transforms require a coordinated rig-space rewrite of indexed heads and every animation frame; use pose tools instead.',
  },
  mirror: {
    id: 'mirror',
    label: 'Mirror',
    supported: false,
    reason: 'The owned legacy Rig source has no mirror command, and SMF nodes carry no left/right pairing metadata.',
  },
  reset: {
    id: 'reset',
    label: 'Bind reset',
    supported: true,
    reason: 'Reset restores the selected deform bone local bind transform without changing node, head, skin, or animation identity.',
  },
};

const CONTROL_POLICY: Readonly<Record<SmfRigControl, SmfRigPolicyId>> = {
  rename: 'rename',
  reparent: 'structure',
  'create-child': 'structure',
  delete: 'structure',
  'detach-connect': 'structure',
  move: 'bind-transform',
  rotate: 'bind-transform',
  spin: 'bind-transform',
  snap: 'bind-transform',
  mirror: 'mirror',
  reset: 'reset',
};

export function getSmfRigControlPolicy(control: SmfRigControl): SmfRigPolicy {
  return SMF_RIG_POLICIES[CONTROL_POLICY[control]];
}

export function listSmfRigPolicies(): SmfRigPolicy[] {
  return (Object.keys(SMF_RIG_POLICIES) as SmfRigPolicyId[]).map((id) => SMF_RIG_POLICIES[id]);
}
