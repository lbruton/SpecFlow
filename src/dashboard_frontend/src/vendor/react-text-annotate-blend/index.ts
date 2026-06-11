/**
 * Vendored from react-text-annotate-blend v1.2.0 (MIT License, Copyright (c) 2021 smhaley)
 * https://github.com/smhaley/react-text-annotate-blend
 *
 * Vendored in SFLW-47: upstream is unmaintained (1.2.0 is the final release) and
 * its peer range caps at React 18, blocking the React 19 upgrade. The TypeScript
 * source is copied verbatim (LICENSE alongside) and type-checked by the dashboard
 * tsconfig under @types/react 19. The npm dependency is removed.
 */
import { AnnotateTag, AnnotateBlendTag } from './types/annotate-types';
import TextAnnotateBlend from './components/TextAnnotateBlend';
import TextAnnotate from './components/TextAnnotate';

export { TextAnnotate, TextAnnotateBlend };
export type { AnnotateTag, AnnotateBlendTag };
