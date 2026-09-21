const REPOSITORY_ROOT = new URL("../", import.meta.url);
/** Synthetic root used to resolve relative specifiers without touching disk. */
const RESOLUTION_ROOT = new URL("file:///enlint/");

const PRODUCT_LAYERS = ["core", "infra", "cli", "desktop"] as const;

type ProductLayer = (typeof PRODUCT_LAYERS)[number];

const ALLOWED_LAYER_DEPENDENCIES: Readonly<
  Record<ProductLayer, ReadonlySet<ProductLayer>>
> = {
  core: new Set(["core"]),
  infra: new Set(["infra", "core"]),
  cli: new Set(["cli", "infra", "core"]),
  desktop: new Set(["desktop", "infra", "core"]),
};

const AI_ADAPTER_PATH = "infra/jev/jev_evaluator.ts";
const OPENAI_ADAPTER_PATH = "infra/llm/openai_advisor.ts";
const DENO_NAMESPACE = "Deno";
const CORE_NO_DENO_API_MESSAGE =
  "core must not depend on Deno APIs; use Web standard APIs instead";

/**
 * Repository-specific lint rules.
 *
 * `core` holds the evaluation logic and stays free of the outer layers and of
 * any runtime-specific API, so that a presentation layer can be rebuilt on a
 * different runtime without touching it.
 */
const plugin: Deno.lint.Plugin = {
  name: "enlint",
  rules: {
    "layer-dependencies": {
      create(context) {
        const path = toRepositoryPath(context.filename);
        const layer = getLayer(path);
        if (layer === undefined) {
          return {};
        }

        const check = (
          node: { source: Deno.lint.Expression | null },
        ) => {
          const source = node.source;
          if (
            source === null || source.type !== "Literal" ||
            typeof source.value !== "string"
          ) {
            return;
          }

          const message = violationOf(path, layer, source.value);
          if (message !== undefined) {
            context.report({ node: source, message });
          }
        };

        return {
          ImportDeclaration: check,
          ImportExpression: check,
          ExportAllDeclaration: check,
          ExportNamedDeclaration: check,
        };
      },
    },

    "core-no-deno-api": {
      create(context) {
        const path = toRepositoryPath(context.filename);
        // Core tests are excluded from publishing and use Deno's test runner;
        // the runtime-independent constraint applies to product modules.
        if (getLayer(path) !== "core" || isTestModule(path)) {
          return {};
        }

        return {
          Identifier(node) {
            if (node.name === DENO_NAMESPACE && !isPropertyName(node)) {
              context.report({ node, message: CORE_NO_DENO_API_MESSAGE });
            }
          },

          // `globalThis.Deno` reads as a property name above, so match it here.
          MemberExpression(node) {
            if (
              !node.computed &&
              node.object.type === "Identifier" &&
              node.object.name === "globalThis" &&
              node.property.type === "Identifier" &&
              node.property.name === DENO_NAMESPACE
            ) {
              context.report({
                node: node.property,
                message: CORE_NO_DENO_API_MESSAGE,
              });
            }
          },
        };
      },
    },
  },
};

function violationOf(
  path: string,
  layer: ProductLayer,
  specifier: string,
): string | undefined {
  // The AI SDK's evaluate API is experimental, so its blast radius is one file.
  if (isAiSpecifier(specifier) && path !== AI_ADAPTER_PATH) {
    return `ai may only be imported by ${AI_ADAPTER_PATH}`;
  }
  if (isOpenAiSpecifier(specifier) && path !== OPENAI_ADAPTER_PATH) {
    return `openai may only be imported by ${OPENAI_ADAPTER_PATH}`;
  }

  const target = resolveTargetPath(path, specifier);
  if (target === undefined) {
    if (layer !== "core") {
      return undefined;
    }
    if (isTestModule(path) && isStdAssertSpecifier(specifier)) {
      return undefined;
    }
    return "core modules may not import external packages";
  }

  const targetLayer = getLayer(target);
  if (
    targetLayer !== undefined &&
    ALLOWED_LAYER_DEPENDENCIES[layer].has(targetLayer)
  ) {
    return undefined;
  }

  return `${layer} may not depend on ${
    targetLayer ?? "files outside product layers"
  }`;
}

/** Returns the repository path a specifier points at, or undefined if external. */
function resolveTargetPath(
  path: string,
  specifier: string,
): string | undefined {
  for (const layer of ["core", "infra"] as const) {
    const prefix = `#${layer}/`;
    if (specifier.startsWith(prefix)) {
      return `${layer}/${specifier.slice(prefix.length)}`;
    }
  }

  if (!/^(?:\.\.?\/|\/|file:)/.test(specifier)) {
    return undefined;
  }

  const resolved = new URL(specifier, new URL(path, RESOLUTION_ROOT));
  return resolved.href.startsWith(RESOLUTION_ROOT.href)
    ? decodeURIComponent(resolved.href.slice(RESOLUTION_ROOT.href.length))
    : "";
}

function isAiSpecifier(specifier: string): boolean {
  return specifier === "ai" || specifier.startsWith("ai/") ||
    /^npm:ai(?:@|\/|$)/.test(specifier);
}

function isOpenAiSpecifier(specifier: string): boolean {
  return specifier === "openai" || specifier.startsWith("openai/") ||
    /^npm:openai(?:@|\/|$)/.test(specifier);
}

function isStdAssertSpecifier(specifier: string): boolean {
  return specifier === "@std/assert" || specifier.startsWith("@std/assert/");
}

function isTestModule(path: string): boolean {
  return /_test\.[cm]?[jt]sx?$/.test(path);
}

function getLayer(path: string): ProductLayer | undefined {
  const firstSegment = path.split("/", 1)[0];
  return PRODUCT_LAYERS.find((layer) => layer === firstSegment);
}

/**
 * `deno lint` reports absolute paths while `Deno.lint.runPlugin` reports the
 * path it was given, so both forms are accepted.
 */
function toRepositoryPath(filename: string): string {
  return filename.startsWith(REPOSITORY_ROOT.pathname)
    ? filename.slice(REPOSITORY_ROOT.pathname.length)
    : filename;
}

/**
 * Distinguishes `Deno.env` from `other.Deno` and `{ Deno: 1 }`, which share the
 * identifier name without referring to the global.
 *
 * Scope is deliberately not analysed: a local binding named `Deno` would be
 * reported, and is expected to be silenced with a deno-lint-ignore comment
 * rather than paid for with a scope tracker.
 */
function isPropertyName(node: Deno.lint.Identifier): boolean {
  const parent = node.parent;

  if (parent.type === "MemberExpression") {
    return parent.property === node && !parent.computed;
  }

  if (parent.type === "TSQualifiedName") {
    return parent.right === node;
  }

  if (parent.type === "Property" || parent.type === "TSPropertySignature") {
    return parent.key === node && !parent.computed;
  }

  return false;
}

export default plugin;
