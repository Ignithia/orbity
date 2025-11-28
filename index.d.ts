// Type definitions for Orbity.js
// Project: https://github.com/Ignithia/orbity.js
// Definitions by: Ignithia <https://www.ryanvdv-portfolio.be/>

export interface OrbityTag {
    text?: string;
    color?: string;
    fontSize?: number;
    imageUrl?: string;
    svg?: string;
}

export interface OrbityOptions {
    radius?: number;
    speed?: number;
    easing?: number;
    paused?: boolean;
    enableTouch?: boolean;
    enableOrientation?: boolean;
    maxVelocity?: number;
    shape?: string;
    enableDrag?: boolean;
    enableClick?: boolean;
    autoSpin?: boolean;
    hoverEffect?: boolean;
    clickEffect?: boolean;
    hoverScale?: number;
    hoverColor?: string;
    hoverOpacity?: number;
    customFont?: string;
    customFontWeight?: string;
    majorRadius?: number;
    minorRadius?: number;
    easingProfile?: string;
    customEaseIn?: number;
    customFriction?: number;
    autoEasing?: boolean;
    minVelocityThreshold?: number;
}

export type OrbityEvent = 'tagClick' | 'tagHover' | 'tagLeave' | 'pause' | 'resume';

export default class Orbity {
    constructor(canvas: HTMLCanvasElement, options?: OrbityOptions);
    setTags(tags: OrbityTag[]): void;
    addTag(tag: OrbityTag): void;
    removeTag(index: number): void;
    updateTag(index: number, data: Partial<OrbityTag>): void;
    clearTags(): void;
    updateOptions(options: Partial<OrbityOptions>): void;
    undo(): void;
    redo(): void;
    pause(): void;
    resume(): void;
    destroy(): void;
    on(event: OrbityEvent, callback: (tag?: OrbityTag) => void): void;
    off(event: OrbityEvent, callback?: (tag?: OrbityTag) => void): void;
    tags: OrbityTag[];
    settings: OrbityOptions;
}
