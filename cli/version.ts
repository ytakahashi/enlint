// The package manifest is the single source of truth for the version, so a
// release only has to bump deno.json. The import keeps the value in the module
// graph, which means no file read and no permission at runtime.
import denoConfig from "../deno.json" with { type: "json" };

export const VERSION: string = denoConfig.version;
