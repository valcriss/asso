import { STATUS_CODES } from 'node:http';

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
}

export type ProblemDetailInit = {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  cause?: unknown;
};

export class HttpProblemError extends Error {
  public readonly status: number;

  public readonly type: string;

  public readonly title: string;

  public readonly detail?: string;

  public readonly instance?: string;

  public constructor(init: ProblemDetailInit) {
    super(init.detail ?? init.title);
    this.name = 'HttpProblemError';
    this.status = init.status;
    this.type = init.type ?? 'about:blank';
    this.title = init.title;
    this.detail = init.detail;
    this.instance = init.instance;

    if (init.cause !== undefined) {
      this.cause = init.cause;
    }
  }
}

export function isHttpProblemError(error: unknown): error is HttpProblemError {
  return error instanceof HttpProblemError;
}

export function toProblemDetail(error: unknown, instance?: string): ProblemDetail {
  const normalizedError = normalizeError(error);
  const status = normalizedError.status ?? 500;
  const title = normalizedError.title ?? STATUS_CODES[status] ?? 'Error';
  const detail = normalizedError.detail;
  const type = normalizedError.type ?? 'about:blank';

  return {
    type,
    title,
    status,
    detail,
    instance,
  } satisfies ProblemDetail;
}

interface NormalizedError {
  status?: number;
  type?: string;
  title?: string;
  detail?: string;
}

function normalizeError(error: unknown): NormalizedError {
  if (error instanceof HttpProblemError) {
    return {
      status: error.status,
      type: error.type,
      title: error.title,
      detail: error.detail,
    } satisfies NormalizedError;
  }

  if (isFastifyError(error)) {
    const status = error.statusCode ?? 500;
    const title = error.code ?? STATUS_CODES[status] ?? 'Error';
    const detail = status >= 500 ? undefined : error.message;

    return {
      status,
      title,
      type: 'about:blank',
      detail,
    } satisfies NormalizedError;
  }

  if (isErrorWithStatus(error)) {
    const status = error.status ?? 500;
    const title = STATUS_CODES[status] ?? error.name ?? 'Error';
    const detail = status >= 500 ? undefined : error.message;

    return {
      status,
      title,
      type: 'about:blank',
      detail,
    } satisfies NormalizedError;
  }

  if (error instanceof Error) {
    return {
      status: 500,
      title: error.name,
      type: 'about:blank',
      detail: undefined,
    } satisfies NormalizedError;
  }

  return {
    status: 500,
    title: STATUS_CODES[500] ?? 'Internal Server Error',
    type: 'about:blank',
  } satisfies NormalizedError;
}

interface FastifyLikeError {
  statusCode?: number;
  message: string;
  code?: string;
}

function isFastifyError(error: unknown): error is FastifyLikeError {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return 'message' in error;
}

interface ErrorWithStatus {
  status?: number;
  message: string;
  name?: string;
}

function isErrorWithStatus(error: unknown): error is ErrorWithStatus {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return 'message' in error && 'status' in error;
}
