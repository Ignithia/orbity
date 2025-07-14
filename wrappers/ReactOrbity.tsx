import React, { useEffect, useRef } from "react";
import Orbity, { OrbityOptions, OrbityTag } from "../index.d";

export interface ReactOrbityProps extends OrbityOptions {
  tags: OrbityTag[];
  style?: React.CSSProperties;
  className?: string;
  onTagClick?: (tag: OrbityTag) => void;
  onTagHover?: (tag: OrbityTag) => void;
  onTagLeave?: (tag: OrbityTag) => void;
  width?: number;
  height?: number;
}

const ReactOrbity: React.FC<ReactOrbityProps> = ({
  tags,
  style,
  className,
  onTagClick,
  onTagHover,
  onTagLeave,
  width,
  height,
  ...options
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbityRef = useRef<Orbity | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      orbityRef.current = new Orbity(canvasRef.current, options);
      orbityRef.current.setTags(tags);
      if (onTagClick)
        orbityRef.current.on("tagClick", (tag?: OrbityTag) => {
          if (tag) onTagClick(tag);
        });
      if (onTagHover)
        orbityRef.current.on("tagHover", (tag?: OrbityTag) => {
          if (tag) onTagHover(tag);
        });
      if (onTagLeave)
        orbityRef.current.on("tagLeave", (tag?: OrbityTag) => {
          if (tag) onTagLeave(tag);
        });
    }
    return () => {
      orbityRef.current?.destroy();
    };
    // eslint-disable-next-line
  }, [JSON.stringify(options)]);

  useEffect(() => {
    orbityRef.current?.setTags(tags);
  }, [tags]);

  return (
    <canvas
      ref={canvasRef}
      width={width || 800}
      height={height || 600}
      style={style}
      className={className}
      tabIndex={0}
      aria-label="3D tag cloud visualization"
      role="img"
    />
  );
};

export default ReactOrbity;
