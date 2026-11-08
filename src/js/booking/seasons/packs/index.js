// Holiday packs (row 1, round 11): one file per holiday, loaded only when that holiday is on.
// `seasons/packs/<id>.js` (the id of calendar.js) default-exports `build(kit)` and returns the decor
// (what it may return is in seasons/kit.js). A holiday without a file is a stub: the registry, the
// menu and the plate work, the decor is empty. Vite splits every file into its own chunk.

const files = import.meta.glob(['./*.js', '!./index.js']);

/** The module of a holiday's pack, or null (a stub). */
export async function loadPack(id) {
  const load = files[`./${id}.js`];
  return load ? load() : null;
}
export const packIds = () => Object.keys(files).map((f) => f.slice(2, -3));
