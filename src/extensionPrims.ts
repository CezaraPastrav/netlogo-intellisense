/**
 * Primitives contributed by bundled NetLogo extensions.
 *
 * These only exist when the model declares the extension in `extensions [ ... ]`,
 * so completion offers them conditionally and the undefined-name check treats
 * them as defined only for models that load the extension.
 */

export interface ExtensionPrimitive {
  name: string;
  kind: "command" | "reporter";
  description: string;
}

type Table = Record<string, ExtensionPrimitive[]>;

const c = (name: string, description: string): ExtensionPrimitive => ({
  name,
  kind: "command",
  description,
});
const r = (name: string, description: string): ExtensionPrimitive => ({
  name,
  kind: "reporter",
  description,
});

export const EXTENSION_PRIMITIVES: Table = {
  table: [
    r("table:make", "Create a new empty table."),
    r("table:get", "Report the value for a key; error if absent."),
    r("table:get-or-default", "Report the value for a key, or a default."),
    c("table:put", "Set the value for a key."),
    c("table:remove", "Remove a key and its value."),
    c("table:clear", "Remove all entries from the table."),
    r("table:has-key?", "Report true if the table contains the key."),
    r("table:keys", "Report a list of the table's keys."),
    r("table:values", "Report a list of the table's values."),
    r("table:length", "Report the number of entries."),
    r("table:to-list", "Report the table as a list of [key value] pairs."),
    r("table:from-list", "Build a table from a list of [key value] pairs."),
    r("table:group-agents", "Group an agentset into a table by a reporter."),
    r("table:group-items", "Group a list into a table by a reporter."),
    r("table:counts", "Report a table of item counts."),
    r("table:is-table?", "Report true if the value is a table."),
  ],
  csv: [
    r("csv:from-row", "Parse one CSV line into a list."),
    r("csv:from-string", "Parse a CSV string into a list of lists."),
    r("csv:from-file", "Read a CSV file into a list of lists."),
    r("csv:to-row", "Format a list as one CSV line."),
    r("csv:to-string", "Format a list of lists as a CSV string."),
    c("csv:to-file", "Write a list of lists to a CSV file."),
  ],
  profiler: [
    c("profiler:start", "Start collecting profiling data."),
    c("profiler:stop", "Stop collecting profiling data."),
    c("profiler:reset", "Discard all collected profiling data."),
    r("profiler:report", "Report the profiling results as a string."),
    r("profiler:calls", "Report how many times a procedure was called."),
    r("profiler:exclusive-time", "Report time spent in a procedure itself."),
    r("profiler:inclusive-time", "Report time spent in a procedure and its callees."),
  ],
  rnd: [
    r("rnd:weighted-one-of", "Pick one agent with probability proportional to a reporter."),
    r("rnd:weighted-n-of", "Pick n agents without replacement, weighted."),
    r("rnd:weighted-n-of-with-repeats", "Pick n agents with replacement, weighted."),
    r("rnd:weighted-one-of-list", "Pick one list item, weighted."),
    r("rnd:weighted-n-of-list", "Pick n list items without replacement, weighted."),
    r("rnd:weighted-n-of-list-with-repeats", "Pick n list items with replacement, weighted."),
  ],
  matrix: [
    r("matrix:make-constant", "Create a matrix filled with one value."),
    r("matrix:make-identity", "Create an identity matrix."),
    r("matrix:from-row-list", "Create a matrix from a list of rows."),
    r("matrix:from-column-list", "Create a matrix from a list of columns."),
    r("matrix:to-row-list", "Report the matrix as a list of rows."),
    r("matrix:to-column-list", "Report the matrix as a list of columns."),
    r("matrix:get", "Report the value at a row and column."),
    c("matrix:set", "Set the value at a row and column."),
    r("matrix:dimensions", "Report [rows columns]."),
    r("matrix:times", "Multiply matrices."),
    r("matrix:plus", "Add matrices."),
    r("matrix:transpose", "Report the transpose."),
    r("matrix:inverse", "Report the inverse."),
    r("matrix:solve", "Solve a linear system."),
    r("matrix:is-matrix?", "Report true if the value is a matrix."),
  ],
  array: [
    r("array:from-list", "Create an array from a list."),
    r("array:to-list", "Report the array as a list."),
    r("array:item", "Report the item at an index."),
    c("array:set", "Set the item at an index."),
    r("array:length", "Report the array length."),
    r("array:is-array?", "Report true if the value is an array."),
  ],
  nw: [
    c("nw:set-context", "Set the turtle and link sets used by network primitives."),
    r("nw:get-context", "Report the current network context."),
    r("nw:turtles-in-radius", "Turtles within a network distance."),
    r("nw:distance-to", "Network distance to a turtle."),
    r("nw:weighted-distance-to", "Weighted network distance to a turtle."),
    r("nw:path-to", "Shortest path to a turtle, as links."),
    r("nw:turtles-on-path-to", "Shortest path to a turtle, as turtles."),
    r("nw:mean-path-length", "Mean shortest path length."),
    r("nw:betweenness-centrality", "Betweenness centrality of the caller."),
    r("nw:closeness-centrality", "Closeness centrality of the caller."),
    r("nw:eigenvector-centrality", "Eigenvector centrality of the caller."),
    r("nw:page-rank", "PageRank of the caller."),
    r("nw:clustering-coefficient", "Clustering coefficient of the caller."),
    r("nw:maximal-cliques", "All maximal cliques in the network."),
    r("nw:weak-component-clusters", "Weakly connected components."),
    c("nw:generate-preferential-attachment", "Generate a preferential attachment network."),
    c("nw:generate-random", "Generate an Erdos-Renyi random network."),
    c("nw:generate-small-world", "Generate a small-world network."),
    c("nw:generate-ring", "Generate a ring network."),
    c("nw:generate-star", "Generate a star network."),
    c("nw:generate-lattice-2d", "Generate a 2D lattice network."),
    c("nw:save-matrix", "Save the network as a matrix file."),
    c("nw:load-matrix", "Load a network from a matrix file."),
  ],
  gis: [
    r("gis:load-dataset", "Load a GIS dataset from a file."),
    c("gis:set-transformation", "Map GIS coordinates onto NetLogo coordinates."),
    c("gis:set-transformation-ds", "Set transformation with an explicit scale."),
    c("gis:set-world-envelope", "Set the world envelope in GIS coordinates."),
    r("gis:world-envelope", "Report the world envelope."),
    r("gis:envelope-of", "Report the envelope of a dataset or feature."),
    c("gis:apply-coverage", "Copy dataset values onto patch variables."),
    c("gis:draw", "Draw a vector dataset."),
    c("gis:fill", "Fill polygons of a vector dataset."),
    r("gis:feature-list-of", "Report the features of a vector dataset."),
    r("gis:property-value", "Report a feature's property value."),
    r("gis:property-names", "Report the property names of a dataset."),
    r("gis:intersecting", "Patches or turtles intersecting a dataset."),
    r("gis:centroid-of", "Report the centroid of a feature."),
    c("gis:apply-raster", "Copy raster values onto a patch variable."),
  ],
  time: [
    r("time:create", "Create a time value from a string."),
    r("time:create-with-format", "Create a time value with an explicit format."),
    r("time:show", "Format a time value as a string."),
    r("time:plus", "Add a duration to a time value."),
    r("time:difference-between", "Report the difference between two times."),
    r("time:is-before?", "Report true if one time precedes another."),
    r("time:is-after?", "Report true if one time follows another."),
    r("time:get", "Report a component of a time value."),
    c("time:anchor-to-ticks", "Anchor a time value to the tick counter."),
  ],
  palette: [
    c("palette:set-color", "Set the caller's color from a palette."),
    r("palette:scale-gradient", "Report a color from a gradient."),
    r("palette:scheme-colors", "Report the colors of a named scheme."),
  ],
  sound: [
    c("sound:play-note", "Play a note on an instrument."),
    c("sound:play-drum", "Play a percussion sound."),
    c("sound:play-note-later", "Schedule a note."),
    r("sound:instruments", "Report the list of instrument names."),
    r("sound:drums", "Report the list of drum names."),
  ],
  bitmap: [
    r("bitmap:import", "Load an image file."),
    r("bitmap:from-view", "Capture the view as an image."),
    c("bitmap:copy-to-drawing", "Draw an image into the drawing layer."),
    c("bitmap:copy-to-pcolors", "Copy an image onto patch colors."),
    r("bitmap:scaled", "Report a scaled copy of an image."),
    r("bitmap:width", "Report an image's width."),
    r("bitmap:height", "Report an image's height."),
    c("bitmap:export", "Write an image to a file."),
  ],
  py: [
    c("py:setup", "Start a Python session."),
    c("py:run", "Run Python statements."),
    r("py:runresult", "Run a Python expression and report its value."),
    c("py:set", "Set a Python variable from NetLogo."),
    r("py:python", "Report the path of the configured Python 3."),
  ],
  ls: [
    c("ls:create-models", "Create child models."),
    c("ls:load-headless-model", "Load a model without a GUI."),
    c("ls:ask", "Run commands in child models."),
    r("ls:report", "Report a value from child models."),
    r("ls:of", "Report a value from a child model."),
    c("ls:let", "Bind a variable inside child models."),
    c("ls:close", "Close child models."),
    r("ls:models", "Report the list of child model ids."),
  ],
};

/** All primitives contributed by the given extension names. */
export function primitivesForExtensions(
  extensions: string[]
): ExtensionPrimitive[] {
  const out: ExtensionPrimitive[] = [];
  for (const ext of extensions) {
    const prims = EXTENSION_PRIMITIVES[ext.toLowerCase()];
    if (prims) out.push(...prims);
  }
  return out;
}

/** True if we have a catalog for this extension. */
export function isKnownExtension(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    EXTENSION_PRIMITIVES,
    name.toLowerCase()
  );
}
