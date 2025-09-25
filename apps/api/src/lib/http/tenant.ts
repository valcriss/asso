import type { IncomingHttpHeaders } from 'http';

const tenantHeaderCandidates = ['x-organization-id', 'x-tenant-id', 'x-org-id'] as const;

export function getTenantIdentifier(headers: IncomingHttpHeaders): string | null {
  for (const headerName of tenantHeaderCandidates) {
    const value = headers[headerName];

    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }

    if (Array.isArray(value)) {
      const candidate = value.find((item) => typeof item === 'string' && item.trim() !== '');
      if (candidate) {
        return candidate.trim();
      }
    }
  }

  return null;
}
