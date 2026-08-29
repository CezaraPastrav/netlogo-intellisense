import { NetLogoSymbol } from "./parser";

/**
 * Declaring `breed [wolves wolf]` implicitly defines a family of primitives
 * (create-wolves, wolves-here, is-wolf?, ...). None of these appear in the
 * dictionary and none are written down anywhere in the source, so completion
 * and the undefined-name check both need them generated.
 */

export type GeneratedKind = "command" | "reporter";

export interface GeneratedPrimitive {
  name: string;
  kind: GeneratedKind;
  description: string;
  /** The breed declaration this was generated from, e.g. "wolves". */
  breed: string;
}

/** Primitives implied by `breed [<plural> <singular>]`. */
export function turtleBreedPrimitives(
  plural: string,
  singular: string
): GeneratedPrimitive[] {
  const p = plural;
  const s = singular;
  const out: Array<[string, GeneratedKind, string]> = [
    [`create-${p}`, "command", `Create new ${p} and run the given commands on them.`],
    [`create-ordered-${p}`, "command", `Create new ${p} evenly spaced by heading.`],
    [`hatch-${p}`, "command", `The current turtle creates new ${p}, inheriting its variables.`],
    [`sprout-${p}`, "command", `The current patch creates new ${p} on itself.`],
    [`${p}-here`, "reporter", `The ${p} standing on the caller's patch.`],
    [`${p}-at`, "reporter", `The ${p} on the patch at the given offset.`],
    [`${p}-on`, "reporter", `The ${p} standing on the given patch or agentset.`],
    [`is-${s}?`, "reporter", `Reports true if the given value is a ${s}.`],
    [`${p}-own`, "command", `Declare variables belonging to ${p}.`],
    [`${s}`, "reporter", `The ${s} with the given who number, or nobody.`],
    [`${p}`, "reporter", `The agentset of all ${p}.`],
  ];
  return out.map(([name, kind, description]) => ({
    name,
    kind,
    description,
    breed: plural,
  }));
}

/** Primitives implied by a directed or undirected link breed. */
export function linkBreedPrimitives(
  plural: string,
  singular: string,
  directed: boolean
): GeneratedPrimitive[] {
  const p = plural;
  const s = singular;
  const out: Array<[string, GeneratedKind, string]> = [
    [`${p}`, "reporter", `The agentset of all ${p}.`],
    [`${p}-own`, "command", `Declare variables belonging to ${p}.`],
    [`is-${s}?`, "reporter", `Reports true if the given value is a ${s}.`],
    [`my-${p}`, "reporter", `The ${p} connected to the calling turtle.`],
    [`${s}-neighbors`, "reporter", `Turtles connected to the caller by ${p}.`],
    [`${s}-neighbor?`, "reporter", `Reports true if connected to the given turtle by a ${s}.`],
    [`${s}-with`, "reporter", `The ${s} between the caller and the given turtle.`],
  ];

  if (directed) {
    out.push(
      [`create-${s}-to`, "command", `Create a ${s} from the caller to the given turtle.`],
      [`create-${p}-to`, "command", `Create ${p} from the caller to the given turtles.`],
      [`create-${s}-from`, "command", `Create a ${s} from the given turtle to the caller.`],
      [`create-${p}-from`, "command", `Create ${p} from the given turtles to the caller.`],
      [`my-in-${p}`, "reporter", `Incoming ${p} of the calling turtle.`],
      [`my-out-${p}`, "reporter", `Outgoing ${p} of the calling turtle.`],
      [`in-${s}-neighbors`, "reporter", `Turtles with a ${s} pointing at the caller.`],
      [`out-${s}-neighbors`, "reporter", `Turtles the caller points at via ${p}.`],
      [`in-${s}-neighbor?`, "reporter", `Reports true if the given turtle points at the caller.`],
      [`out-${s}-neighbor?`, "reporter", `Reports true if the caller points at the given turtle.`],
      [`in-${s}-from`, "reporter", `The incoming ${s} from the given turtle.`],
      [`out-${s}-to`, "reporter", `The outgoing ${s} to the given turtle.`]
    );
  } else {
    out.push(
      [`create-${s}-with`, "command", `Create a ${s} between the caller and the given turtle.`],
      [`create-${p}-with`, "command", `Create ${p} between the caller and the given turtles.`]
    );
  }

  return out.map(([name, kind, description]) => ({
    name,
    kind,
    description,
    breed: plural,
  }));
}

/** Generate every breed-derived primitive implied by the given symbols. */
export function generateBreedPrimitives(
  symbols: NetLogoSymbol[]
): GeneratedPrimitive[] {
  const out: GeneratedPrimitive[] = [];
  for (const sym of symbols) {
    if (sym.kind === "breed" && sym.extra) {
      out.push(...turtleBreedPrimitives(sym.name, sym.extra));
    } else if (sym.kind === "link-breed" && sym.extra) {
      // The parser does not currently distinguish directed from undirected,
      // so offer both families rather than hiding valid primitives.
      out.push(...linkBreedPrimitives(sym.name, sym.extra, true));
      out.push(...linkBreedPrimitives(sym.name, sym.extra, false));
    }
  }
  // De-duplicate by name, keeping the first description.
  const seen = new Set<string>();
  return out.filter((g) => {
    const key = g.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
