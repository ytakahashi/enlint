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

/**
 * The desktop layer mixes code for two runtimes: `host` and the entry point run
 * in Deno, `ui` runs in the webview, and `protocol` is the contract both sides
 * compile against. A mix-up only surfaces when bundling or at run time, so the
 * split is enforced here.
 */
const DESKTOP_AREAS = ["entry", "host", "protocol", "ui"] as const;

type DesktopArea = (typeof DESKTOP_AREAS)[number];

const DESKTOP_ENTRY_PATH = "desktop/main.ts";
/** `deno bundle` output: the UI compiled for the webview, classified as `ui`. */
const DESKTOP_BUNDLE_DIRECTORY = "_dist";

const ALLOWED_DESKTOP_DEPENDENCIES: Readonly<
  Record<DesktopArea, ReadonlySet<DesktopArea | "infra" | "core">>
> = {
  entry: new Set(["host", "protocol", "infra", "core"]),
  host: new Set(["host", "protocol", "infra", "core"]),
  protocol: new Set(["protocol", "core"]),
  ui: new Set(["ui", "protocol", "core"]),
};

/** Import attribute types that load a file as data rather than as a module. */
const ASSET_IMPORT_TYPES: ReadonlySet<string> = new Set(["text", "bytes"]);

const JEV_ADAPTER_PATH = "infra/jev/jev_evaluator.ts";
const OPENAI_ADAPTER_PATH = "infra/llm/openai_advisor.ts";
const DIFF_ADAPTER_PATH = "desktop/ui/diff.ts";
const CORE_PUBLIC_ENTRYPOINT = "core/mod.ts";
const PACKAGE_MANIFEST_PATH = "deno.json";
const VERSION_MODULE_PATH = "cli/version.ts";
const DENO_NAMESPACE = "Deno";
const CORE_NO_DENO_API_MESSAGE =
  "core must not depend on Deno APIs; use Web standard APIs instead";
const DESKTOP_PLACEMENT_MESSAGE =
  `desktop modules must be ${DESKTOP_ENTRY_PATH} or live under desktop/host, desktop/protocol, or desktop/ui`;
const WEBVIEW_NO_DENO_API_MESSAGE =
  "desktop/ui and desktop/protocol run in the webview and must not use Deno APIs";

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
        const desktopArea = layer === "desktop"
          ? getDesktopArea(path)
          : undefined;
        if (layer === "desktop" && desktopArea === undefined) {
          // Placement is a property of the file, so report it once, even for a
          // module without imports, and skip import checks that would only
          // repeat it.
          return {
            Program(node) {
              context.report({ node, message: DESKTOP_PLACEMENT_MESSAGE });
            },
          };
        }

        const check = (
          node: {
            source: Deno.lint.Expression | null;
            attributes?: Deno.lint.ImportAttribute[];
          },
        ) => {
          const source = node.source;
          if (
            source === null || source.type !== "Literal" ||
            typeof source.value !== "string"
          ) {
            return;
          }

          const message = violationOf(
            path,
            layer,
            desktopArea,
            source.value,
            isAssetImport(node.attributes ?? []),
          );
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

        return denoApiVisitor(context, CORE_NO_DENO_API_MESSAGE);
      },
    },

    "webview-no-deno-api": {
      create(context) {
        const path = toRepositoryPath(context.filename);
        const area = getDesktopArea(path);
        // Tests run under Deno's test runner rather than in the webview.
        if ((area !== "ui" && area !== "protocol") || isTestModule(path)) {
          return {};
        }

        return denoApiVisitor(context, WEBVIEW_NO_DENO_API_MESSAGE);
      },
    },
  },
};

function denoApiVisitor(
  context: Deno.lint.RuleContext,
  message: string,
): Deno.lint.LintVisitor {
  return {
    Identifier(node) {
      if (node.name === DENO_NAMESPACE && !isPropertyName(node)) {
        context.report({ node, message });
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
        context.report({ node: node.property, message });
      }
    },
  };
}

function violationOf(
  path: string,
  layer: ProductLayer,
  desktopArea: DesktopArea | undefined,
  specifier: string,
  isAsset: boolean,
): string | undefined {
  if (isTypeSafeSpecifier(specifier) && path !== JEV_ADAPTER_PATH) {
    return `@typesafe-ai/sdk may only be imported by ${JEV_ADAPTER_PATH}`;
  }
  if (isOpenAiSpecifier(specifier) && path !== OPENAI_ADAPTER_PATH) {
    return `openai may only be imported by ${OPENAI_ADAPTER_PATH}`;
  }
  if (isDiffSpecifier(specifier) && path !== DIFF_ADAPTER_PATH) {
    return `diff may only be imported by ${DIFF_ADAPTER_PATH}`;
  }

  const target = resolveTargetPath(path, specifier);
  if (target === undefined) {
    return externalImportViolation(path, layer, specifier);
  }

  // The manifest is the single source of truth for the version, and importing
  // it is how the CLI avoids duplicating that value. It is not a layer, so pin
  // the exception to the one module that derives the version from it.
  if (target === PACKAGE_MANIFEST_PATH) {
    return path === VERSION_MODULE_PATH
      ? undefined
      : `${PACKAGE_MANIFEST_PATH} may only be imported by ${VERSION_MODULE_PATH}`;
  }

  const targetLayer = getLayer(target);
  // Published modules must use Core's public entry point. Adjacent *_test.ts
  // modules are excluded from publication and may inspect internal contracts;
  // other test helpers remain subject to this rule until explicitly excluded.
  if (
    layer !== "core" && targetLayer === "core" &&
    target !== CORE_PUBLIC_ENTRYPOINT && !isTestModule(path)
  ) {
    return `${layer} production modules must import Core through ${CORE_PUBLIC_ENTRYPOINT}`;
  }
  if (
    targetLayer === undefined ||
    !ALLOWED_LAYER_DEPENDENCIES[layer].has(targetLayer)
  ) {
    return `${layer} may not depend on ${
      targetLayer ?? "files outside product layers"
    }`;
  }

  return desktopArea !== undefined
    ? desktopAreaViolation(desktopArea, target, targetLayer, isAsset)
    : undefined;
}

function externalImportViolation(
  path: string,
  layer: ProductLayer,
  specifier: string,
): string | undefined {
  if (isTestModule(path) && isStdAssertSpecifier(specifier)) {
    return undefined;
  }
  if (layer === "core") {
    return "core modules may not import external packages";
  }
  // The protocol is compiled into both runtimes and describes JSON values, so
  // a package imported here would ship to both sides for no reason.
  if (getDesktopArea(path) === "protocol") {
    return "desktop/protocol modules may not import external packages";
  }
  return undefined;
}

function desktopAreaViolation(
  area: DesktopArea,
  target: string,
  targetLayer: ProductLayer,
  isAsset: boolean,
): string | undefined {
  const dependency = desktopDependencyOf(target, targetLayer);
  if (
    dependency !== undefined &&
    ALLOWED_DESKTOP_DEPENDENCIES[area].has(dependency)
  ) {
    return undefined;
  }
  // The composition root hands the UI's HTML, CSS, and bundle to the host, so
  // it may load ui files, but only as data: webview code must never run in
  // Deno. No other area gets this exception; the host receives the assets
  // rather than reading them.
  if (area === "entry" && dependency === "ui") {
    return isAsset
      ? undefined
      : `${DESKTOP_ENTRY_PATH} may import desktop/ui only as text or bytes`;
  }

  const targetLabel = dependency === undefined
    ? "files outside desktop areas"
    : desktopLabel(dependency);
  return `${desktopLabel(area)} may not depend on ${targetLabel}`;
}

/**
 * Classifies an import target that the layer rule already allows for desktop,
 * so only desktop areas, infra, and core remain.
 */
function desktopDependencyOf(
  target: string,
  targetLayer: ProductLayer,
): DesktopArea | "infra" | "core" | undefined {
  switch (targetLayer) {
    case "infra":
    case "core":
      return targetLayer;
    case "desktop":
      return getDesktopArea(target);
    default:
      return undefined;
  }
}

function desktopLabel(dependency: DesktopArea | "infra" | "core"): string {
  switch (dependency) {
    case "entry":
      return DESKTOP_ENTRY_PATH;
    case "infra":
    case "core":
      return dependency;
    default:
      return `desktop/${dependency}`;
  }
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

function isTypeSafeSpecifier(specifier: string): boolean {
  return specifier === "@typesafe-ai/sdk" ||
    specifier.startsWith("@typesafe-ai/sdk/") ||
    /^npm:@typesafe-ai\/sdk(?:@|\/|$)/.test(specifier);
}

function isOpenAiSpecifier(specifier: string): boolean {
  return specifier === "openai" || specifier.startsWith("openai/") ||
    /^npm:openai(?:@|\/|$)/.test(specifier);
}

function isDiffSpecifier(specifier: string): boolean {
  return specifier === "diff" || specifier.startsWith("diff/") ||
    /^npm:diff(?:@|\/|$)/.test(specifier);
}

function isAssetImport(attributes: readonly Deno.lint.ImportAttribute[]) {
  return attributes.some(({ key, value }) =>
    (key.type === "Identifier" ? key.name : key.value) === "type" &&
    typeof value.value === "string" && ASSET_IMPORT_TYPES.has(value.value)
  );
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

function getDesktopArea(path: string): DesktopArea | undefined {
  if (path === DESKTOP_ENTRY_PATH) {
    return "entry";
  }
  const [layer, area, ...rest] = path.split("/");
  if (layer !== "desktop" || rest.length === 0) {
    return undefined;
  }
  if (area === DESKTOP_BUNDLE_DIRECTORY) {
    return "ui";
  }
  return DESKTOP_AREAS.find((candidate) =>
    candidate !== "entry" && candidate === area
  );
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
