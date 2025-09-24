// src/types/keymap.ts

/** Layers a single physical key can have (base, shift, alt, etc.) */
export type KeyLayers = {
  base?: string;
  shift?: string;
  alt?: string;
  altShift?: string;
  ctrl?: string;
  ctrlShift?: string;
  label?: string; // optional display override
};

/** Convenience type: full mapping of physical code -> layers */
export type Keymap = Record<string, KeyLayers>;

/** Shape of a user-provided keymap JSON file */
export interface UserKeymapFile {
  id: string;               // unique id for this layout/scheme
  label?: string;           // human-readable label
  inherits?: string;        // optional: inherit from a built-in
  keys: Record<string, KeyLayers>;
}
