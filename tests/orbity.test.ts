// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Orbity from '../src/orbity';

function pointerEvent(type: string, x: number, y: number, pointerType = 'mouse'): MouseEvent {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: pointerType },
  });
  return event;
}

describe('Orbity Core Features', () => {
  let canvas: HTMLCanvasElement;
  let orbity: Orbity;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getContext', {
      value: () => ({ setTransform: vi.fn() }),
    });
    orbity = new Orbity(canvas, { radius: 100 });
  });

  it('should add a tag', () => {
    orbity.setTags([]);
    orbity.addTag({ text: 'Test', color: '#fff' });
    expect(orbity.tags.length).toBe(1);
    expect(orbity.getTags()[0].text).toBe('Test');
  });

  it('should remove a tag', () => {
    orbity.setTags([{ text: 'A', color: '#fff' }, { text: 'B', color: '#000' }]);
    orbity.removeTag(0);
    expect(orbity.tags.length).toBe(1);
    expect(orbity.getTags()[0].text).toBe('B');
  });

  it('should update a tag', () => {
    orbity.setTags([{ text: 'A', color: '#fff' }]);
    orbity.updateTag(0, { text: 'B' });
    expect(orbity.getTags()[0].text).toBe('B');
  });

  it('should undo and redo tag actions', () => {
    orbity.setTags([]);
    orbity.addTag({ text: 'A', color: '#fff' });
    orbity.addTag({ text: 'B', color: '#000' });
    orbity.removeTag(0);
    expect(orbity.tags.length).toBe(1);
    orbity.undo();
    expect(orbity.tags.length).toBe(2);
    orbity.redo();
    expect(orbity.tags.length).toBe(1);
  });

  it('should update options', () => {
    orbity.updateOptions({ radius: 200, speed: 0.5 });
    expect(orbity.settings.radius).toBe(200);
    expect(orbity.settings.speed).toBe(0.5);
  });

  it('should auto-spin by default', () => {
    orbity._step(1);
    expect(orbity.rotation.x).not.toBe(0);
    expect(orbity.rotation.y).not.toBe(0);
  });

  it('should continue auto-spinning while a tag is hovered', () => {
    orbity.setTags([{ text: 'Hovered', color: '#fff' }]);
    orbity._hoveredTag = orbity.tags[0];

    expect(orbity._targetVelocity().y).toBeGreaterThan(0);
  });

  it.each([
    { pointerType: 'mouse', deltaX: 20, deltaY: 0, axis: 'y', direction: -1 },
    { pointerType: 'mouse', deltaX: -20, deltaY: 0, axis: 'y', direction: 1 },
    { pointerType: 'mouse', deltaX: 0, deltaY: 20, axis: 'x', direction: 1 },
    { pointerType: 'mouse', deltaX: 0, deltaY: -20, axis: 'x', direction: -1 },
    { pointerType: 'touch', deltaX: 20, deltaY: 0, axis: 'y', direction: -1 },
    { pointerType: 'touch', deltaX: -20, deltaY: 0, axis: 'y', direction: 1 },
    { pointerType: 'touch', deltaX: 0, deltaY: 20, axis: 'x', direction: 1 },
    { pointerType: 'touch', deltaX: 0, deltaY: -20, axis: 'x', direction: -1 },
  ])('should rotate with a $pointerType drag in the pointer direction', ({ pointerType, deltaX, deltaY, axis, direction }) => {
    canvas.dispatchEvent(pointerEvent('pointerdown', 100, 100, pointerType));
    canvas.dispatchEvent(pointerEvent('pointermove', 100 + deltaX, 100 + deltaY, pointerType));

    const target = orbity._target;
    if (!target) throw new Error('Drag did not create a rotation target.');
    expect(target[axis as 'x' | 'y'] * direction).toBeGreaterThan(0);
  });

  it('should reverse drag direction when invertDrag is enabled', () => {
    orbity.updateOptions({ invertDrag: true });
    canvas.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    canvas.dispatchEvent(pointerEvent('pointermove', 120, 100));

    const target = orbity._target;
    if (!target) throw new Error('Horizontal drag did not create a rotation target.');
    expect(target.y).toBeGreaterThan(0);
  });

  it('should finish easing to the drag target before handing off inertia', () => {
    canvas.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    canvas.dispatchEvent(pointerEvent('pointermove', 120, 100));
    canvas.dispatchEvent(pointerEvent('pointerup', 120, 100));

    const handoff = orbity._handoff;
    expect(handoff).not.toBeNull();
    expect(orbity._target).not.toBeNull();
    for (let i = 0; i < 100 && orbity._target; i++) orbity._step(1);
    expect(orbity._target).toBeNull();
    expect(orbity.velocity).toEqual(handoff);
  });
});
