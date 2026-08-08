import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { makeAnimationEditState } from './animationEdits';
import {
  createAnimationAuthoringController,
  type AnimationAuthoringControllerOptions,
} from './animationAuthoringController';

function makeControllerFixture() {
  const bone = new THREE.Bone();
  bone.name = 'Tip';
  const skeleton = new THREE.Skeleton([bone]);
  const clip = new THREE.AnimationClip('Idle', 1, []);
  const baseClipsRef = { current: [clip] };
  const animationRestPoseRef = {
    current: {
      Tip: {
        position: [0, 0, 0] as [number, number, number],
        quaternion: [0, 0, 0, 1] as [number, number, number, number],
      },
    },
  };
  const animationEditStateRef = { current: makeAnimationEditState() };
  const playbackState = {
    currentClipName: 'Idle',
    currentTime: 0.25,
    duration: 1,
    scrub: (_time: number) => {},
    setCurrentClipName: (_name: string) => {},
    setCurrentTime: (_time: number) => {},
    setDuration: (_duration: number) => {},
  };
  const playbackRef = { current: playbackState };
  playbackState.scrub = (time: number) => { playbackState.currentTime = time; };
  playbackState.setCurrentClipName = (name: string) => { playbackState.currentClipName = name; };
  playbackState.setCurrentTime = (time: number) => { playbackState.currentTime = time; };
  playbackState.setDuration = (duration: number) => { playbackState.duration = duration; };
  const statuses: string[] = [];
  const history: string[] = [];
  const options: AnimationAuthoringControllerOptions = {
    baseClipsRef,
    animationEditStateRef,
    playbackRef,
    skeleton,
    animationRestPoseRef,
    selectedBoneName: 'Tip',
    animationSnapStep: 0.25,
    setAnimationEditState: (state) => { animationEditStateRef.current = state; },
    setAnimationSnapStep: () => {},
    commitAnimationEditState: (state) => { animationEditStateRef.current = state; },
    captureAnimationWorkspaceSnapshot: () => ({
      baseClips: baseClipsRef.current.map((item) => item.clone()),
      animationEditState: animationEditStateRef.current,
      currentClipName: playbackRef.current.currentClipName,
      currentTime: playbackRef.current.currentTime,
    }),
    applyAnimationWorkspaceSnapshot: (snapshot) => {
      baseClipsRef.current = snapshot.baseClips;
      animationEditStateRef.current = snapshot.animationEditState;
      playbackRef.current.currentClipName = snapshot.currentClipName;
      playbackRef.current.currentTime = snapshot.currentTime;
      playbackRef.current.duration = baseClipsRef.current[0]?.duration ?? 0;
      return true;
    },
    pushAnimationHistory: (label) => { history.push(label); return true; },
    pushAnimationWorkspaceHistory: (label) => { history.push(label); return true; },
    getSourceAnimationClipMetadata: () => ({ loop: true, sampleFrameMultiplier: 1 }),
    setStatus: (message) => { statuses.push(message); },
  };
  const controller = createAnimationAuthoringController(options);
  return { controller, options, animationEditStateRef, animationRestPoseRef, baseClipsRef, skeleton, playbackRef, history, statuses };
}

describe('animation authoring controller', () => {
  it('snaps and records selected-bone keyframes through the guarded context', () => {
    const { controller, animationEditStateRef, playbackRef, history, statuses } = makeControllerFixture();
    assert.equal(controller.snapPlaybackTime(0.37), 0.25);
    controller.insertAnimationKeyframeAtTime(0.37);
    assert.deepEqual(
      animationEditStateRef.current.editsByClip.Idle?.Tip?.map((key) => key.time),
      [0.25],
    );
    assert.equal(playbackRef.current.currentTime, 0.25);
    assert.equal(history.length, 1);
    assert.match(statuses.at(-1) ?? '', /Inserted animation keyframe/);
  });

  it('reports a useful guard status instead of mutating without a selected bone', () => {
    const fixture = makeControllerFixture();
    const controller = createAnimationAuthoringController({
      ...fixture.options,
      selectedBoneName: '',
    });
    controller.insertAnimationKeyframe();
    assert.match(fixture.statuses.at(-1) ?? '', /Select a bone/);
    assert.equal(fixture.history.length, 0);
  });

  it('creates a rest-pose animation when the model has no source clips', () => {
    const fixture = makeControllerFixture();
    fixture.baseClipsRef.current = [];
    fixture.playbackRef.current.currentClipName = '';
    fixture.playbackRef.current.duration = 0;
    fixture.skeleton.bones[0].position.x = 4;

    fixture.controller.createAnimationFromPose({
      requestedName: 'Rest Start',
      duration: 2,
      initialPose: 'rest',
    });

    assert.deepEqual(fixture.baseClipsRef.current.map((clip) => clip.name), ['Rest Start']);
    assert.equal(fixture.playbackRef.current.currentClipName, 'Rest Start');
    assert.equal(fixture.playbackRef.current.duration, 2);
    const positionTrack = fixture.baseClipsRef.current[0].tracks.find(
      (track) => track.name === 'Tip.position',
    );
    assert.ok(positionTrack);
    assert.deepEqual(Array.from(positionTrack!.values), [0, 0, 0, 0, 0, 0]);
    assert.equal(fixture.animationEditStateRef.current.dirtyClipNames.includes('Rest Start'), true);
    assert.match(fixture.statuses.at(-1) ?? '', /Created animation clip Rest Start from the rest pose/);
    assert.equal(fixture.history.length, 1);
  });

  it('fails closed with a useful status when bone names are ambiguous', () => {
    const fixture = makeControllerFixture();
    const duplicate = new THREE.Bone();
    duplicate.name = 'Tip';
    fixture.skeleton.bones[0].add(duplicate);
    fixture.skeleton.bones = [fixture.skeleton.bones[0], duplicate];

    fixture.controller.createAnimationFromPose({
      requestedName: 'Ambiguous',
      duration: 1,
      initialPose: 'current',
    });

    assert.match(fixture.statuses.at(-1) ?? '', /bone name Tip is ambiguous/i);
    assert.deepEqual(fixture.baseClipsRef.current.map((clip) => clip.name), ['Idle']);
    assert.equal(fixture.history.length, 0);
  });

  it('applies branch scope key edits as one history transaction', () => {
    const fixture = makeControllerFixture();
    const child = new THREE.Bone();
    child.name = 'Child';
    fixture.skeleton.bones[0].add(child);
    fixture.skeleton.bones.push(child);
    const scopeChanges: string[] = [];
    const controller = createAnimationAuthoringController({
      ...fixture.options,
      animationScope: 'branch',
      setAnimationScope: (scope) => { scopeChanges.push(scope); },
    });

    controller.insertAnimationKeyframeAtTime(0.5);

    assert.deepEqual(Object.keys(fixture.animationEditStateRef.current.editsByClip.Idle ?? {}).sort(), ['Child', 'Tip']);
    assert.equal(fixture.history.length, 1);
    assert.match(fixture.statuses.at(-1) ?? '', /Inserted branch animation keyframes/);
    controller.changeAnimationScope('rig');
    assert.deepEqual(scopeChanges, ['rig']);
  });

  it('rejects a scoped paste when the clipboard scope or skeleton fingerprint no longer matches', () => {
    const fixture = makeControllerFixture();
    const child = new THREE.Bone();
    child.name = 'Child';
    fixture.skeleton.bones[0].add(child);
    fixture.skeleton.bones.push(child);
    const branchController = createAnimationAuthoringController({
      ...fixture.options,
      animationScope: 'branch',
    });
    branchController.copySelectedAnimationKeyframe();
    const before = fixture.animationEditStateRef.current;

    const boneController = createAnimationAuthoringController({
      ...fixture.options,
      animationScope: 'bone',
    });
    boneController.pasteAnimationKeyframe();
    assert.equal(fixture.animationEditStateRef.current.editsByClip.Idle, before.editsByClip.Idle);
    assert.match(fixture.statuses.at(-1) ?? '', /do not match the active bone scope/i);

    const fingerprintController = createAnimationAuthoringController({
      ...fixture.options,
      animationScope: 'branch',
    });
    child.name = 'Renamed';
    fingerprintController.pasteAnimationKeyframe();
    assert.match(fixture.statuses.at(-1) ?? '', /different skeleton/i);

    const broaderScopeFixture = makeControllerFixture();
    const broaderChild = new THREE.Bone();
    broaderChild.name = 'Child';
    broaderScopeFixture.skeleton.bones[0].add(broaderChild);
    broaderScopeFixture.skeleton.bones.push(broaderChild);
    const boneSourceController = createAnimationAuthoringController({
      ...broaderScopeFixture.options,
      animationScope: 'bone',
    });
    boneSourceController.copySelectedAnimationKeyframe();
    const branchTargetController = createAnimationAuthoringController({
      ...broaderScopeFixture.options,
      animationScope: 'branch',
    });
    const unchanged = broaderScopeFixture.animationEditStateRef.current;
    branchTargetController.pasteAnimationKeyframe();
    assert.equal(broaderScopeFixture.animationEditStateRef.current, unchanged);
    assert.match(broaderScopeFixture.statuses.at(-1) ?? '', /do not match the active branch scope/i);
  });

  it('sets a bounded clip duration as one workspace edit and rejects shortening below a key', () => {
    const fixture = makeControllerFixture();

    fixture.controller.changeAnimationClipDuration(2);
    assert.equal(fixture.animationEditStateRef.current.durationByClip.Idle, 2);
    assert.equal(fixture.history.length, 1);
    assert.match(fixture.statuses.at(-1) ?? '', /duration to 2\.00s/i);

    fixture.controller.insertAnimationKeyframeAtTime(0.75);
    assert.equal(fixture.history.length, 2);
    fixture.controller.changeAnimationClipDuration(0.5);
    assert.equal(fixture.animationEditStateRef.current.durationByClip.Idle, 2);
    assert.equal(fixture.history.length, 2);
    assert.match(fixture.statuses.at(-1) ?? '', /cannot be shorter than the latest key at 0\.75s/i);
  });

  it('retimes the active clip as one workspace edit and preserves relative playback time', () => {
    const fixture = makeControllerFixture();

    fixture.controller.changeAnimationClipRetime(2);

    assert.equal(fixture.baseClipsRef.current[0].duration, 2);
    assert.equal(fixture.playbackRef.current.duration, 2);
    assert.equal(fixture.playbackRef.current.currentTime, 0.5);
    assert.equal(fixture.animationEditStateRef.current.durationByClip.Idle, 2);
    assert.equal(fixture.history.length, 1);
    assert.match(fixture.statuses.at(-1) ?? '', /Retimed animation clip Idle from 1\.00s to 2\.00s/i);
  });

  it('trims the active clip into one workspace edit and shifts playback into the trimmed range', () => {
    const fixture = makeControllerFixture();

    fixture.controller.changeAnimationClipTrim(0.25, 0.75);

    assert.equal(fixture.baseClipsRef.current[0].duration, 0.5);
    assert.equal(fixture.playbackRef.current.duration, 0.5);
    assert.equal(fixture.playbackRef.current.currentTime, 0);
    assert.equal(fixture.animationEditStateRef.current.durationByClip.Idle, 0.5);
    assert.equal(fixture.history.length, 1);
    assert.match(fixture.statuses.at(-1) ?? '', /Trimmed animation clip Idle to 0\.50s/i);
  });

  it('locks a selected bone as one edit and rejects subsequent key authoring', () => {
    const fixture = makeControllerFixture();

    fixture.controller.toggleAnimationBoneLock();
    assert.deepEqual(fixture.animationEditStateRef.current.lockedBonesByClip.Idle, ['Tip']);
    assert.equal(fixture.history.length, 1);

    fixture.controller.insertAnimationKeyframeAtTime(0.5);
    assert.equal(fixture.animationEditStateRef.current.editsByClip.Idle, undefined);
    assert.equal(fixture.history.length, 1);
    assert.match(fixture.statuses.at(-1) ?? '', /all bones.*locked/i);
  });
});
