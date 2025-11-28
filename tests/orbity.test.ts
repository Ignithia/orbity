import { describe, it, expect, beforeEach } from 'vitest';
import Orbity from '../src/orbity';

describe('Orbity Core Features', () => {
  let canvas: HTMLCanvasElement;
  let orbity: Orbity;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    orbity = new Orbity(canvas, { radius: 100 });
  });

  it('should add a tag', () => {
    orbity.setTags([]);
    orbity.addTag({ text: 'Test', color: '#fff' });
    expect(orbity.tags.length).toBe(1);
    expect(orbity.tags[0].text).toBe('Test');
  });

  it('should remove a tag', () => {
    orbity.setTags([{ text: 'A', color: '#fff' }, { text: 'B', color: '#000' }]);
    orbity.removeTag(0);
    expect(orbity.tags.length).toBe(1);
    expect(orbity.tags[0].text).toBe('B');
  });

  it('should update a tag', () => {
    orbity.setTags([{ text: 'A', color: '#fff' }]);
    orbity.updateTag(0, { text: 'B' });
    expect(orbity.tags[0].text).toBe('B');
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
});
