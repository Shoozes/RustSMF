export interface AuthoringDirtyFlags {
  pose: boolean;
  animation: boolean;
  skin: boolean;
  editorHistory: boolean;
  externalHistory?: boolean;
}

export const UNSAVED_REPLACEMENT_MESSAGE =
  'Unsaved authoring changes will be replaced by the selected model.';

export function hasPendingAuthoringChanges(flags: AuthoringDirtyFlags): boolean {
  return flags.pose
    || flags.animation
    || flags.skin
    || flags.editorHistory
    || flags.externalHistory === true;
}
