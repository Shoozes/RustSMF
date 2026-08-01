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
    applyAnimationWorkspaceSnapshot: () => true,
    pushAnimationHistory: (label) => { history.push(label); return true; },
    pushAnimationWorkspaceHistory: (label) => { history.push(label); return true; },
    getSourceAnimationClipMetadata: () => ({ loop: true, sampleFrameMultiplier: 1 }),
    setStatus: (message) => { statuses.push(message); },
  };
  const controller = createAnimationAuthoringController(options);
  return { controller, options, animationEditStateRef, playbackRef, history, statuses };
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
});
