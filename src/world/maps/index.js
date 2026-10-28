// Every playable map. Each entry: { id, name, tagline, swatch, exposure, build(arena) }.
import rift from './rift.js';
import sakura from './sakura.js';
import neon from './neon.js';
import glacier from './glacier.js';
import inferno from './inferno.js';

export const MAPS = [rift, sakura, neon, glacier, inferno];
export const DEFAULT_MAP = 'rift';

export function mapById(id) {
  return MAPS.find((m) => m.id === id) || MAPS[0];
}
