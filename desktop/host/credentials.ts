export type CredentialName = "TYPESAFE_API_KEY" | "OPENAI_API_KEY";

/** Resolves a credential, or returns undefined when it is not configured. */
export type CredentialResolver = (
  name: CredentialName,
) => Promise<string | undefined>;

export type CommandOutput = {
  readonly code: number;
  readonly stdout: string;
};

/** Runs a program without a shell. Injected so tests never spawn processes. */
export type CommandRunner = (
  program: string,
  args: readonly string[],
) => Promise<CommandOutput>;

export type CredentialSources = {
  readonly getEnv: (name: string) => string | undefined;
  readonly runCommand: CommandRunner;
};

export class CredentialLookupError extends Error {
  override readonly name = "CredentialLookupError";
}

// Keychain items are registered by the user with
// `security add-generic-password -s enlint -a <variable name> -w`. Reading
// through /usr/bin/security makes that tool, not the app, the accessing
// client, so rebuilding the ad-hoc signed app does not trigger an access
// prompt.
const SECURITY_PROGRAM = "/usr/bin/security";
const KEYCHAIN_SERVICE = "enlint";
/** `security` exit status for "The specified item could not be found". */
const ITEM_NOT_FOUND_EXIT_CODE = 44;

/**
 * Looks up the environment first, then the macOS Keychain.
 *
 * Apps launched from Finder or the Dock do not inherit shell exports, so the
 * Keychain is what makes them work; the environment still wins so a terminal
 * launch can override it.
 */
export function createCredentialResolver(
  sources: CredentialSources,
): CredentialResolver {
  return async (name) => {
    const fromEnv = sources.getEnv(name);
    if (fromEnv !== undefined && fromEnv.trim().length > 0) {
      return fromEnv;
    }

    const { code, stdout } = await sources.runCommand(SECURITY_PROGRAM, [
      "find-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      name,
      "-w",
    ]);
    if (code === ITEM_NOT_FOUND_EXIT_CODE) {
      return undefined;
    }
    if (code !== 0) {
      throw new CredentialLookupError(
        `${SECURITY_PROGRAM} exited with status ${code} while reading ${name}`,
      );
    }
    // `-w` prints the password followed by a newline.
    const fromKeychain = stdout.trim();
    return fromKeychain.length > 0 ? fromKeychain : undefined;
  };
}
