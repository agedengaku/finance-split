export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(payload.error || 'The request could not be completed.', response.status)
  }

  return (response.status === 204 ? null : response.json()) as Promise<T>
}
