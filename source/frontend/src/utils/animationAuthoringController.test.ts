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
});
