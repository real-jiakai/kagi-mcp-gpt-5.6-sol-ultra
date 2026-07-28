export type KagiErrorCode =
  | "configuration"
  | "authentication"
  | "forbidden"
  | "filter_rejected"
  | "rate_limited"
  | "timeout"
  | "upstream"
  | "parser_changed";

export class KagiSessionError extends Error {
  readonly code: KagiErrorCode;
  readonly publicMessage: string;
  readonly retryable: boolean;

  constructor(
    code: KagiErrorCode,
    publicMessage: string,
    options: { retryable?: boolean; cause?: unknown } = {},
  ) {
    super(publicMessage, { cause: options.cause });
    this.name = "KagiSessionError";
    this.code = code;
    this.publicMessage = publicMessage;
    this.retryable = options.retryable ?? false;
  }
}

export function publicError(error: unknown): {
  code: KagiErrorCode | "unexpected";
  message: string;
  retryable: boolean;
} {
  if (error instanceof KagiSessionError) {
    return {
      code: error.code,
      message: error.publicMessage,
      retryable: error.retryable,
    };
  }

  return {
    code: "unexpected",
    message: "The Kagi request failed unexpectedly. Restart the local MCP server and try again.",
    retryable: false,
  };
}
