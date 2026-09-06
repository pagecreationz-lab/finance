function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function isAuthorizedRequest(request: Request) {
  if (isLocalHost(new URL(request.url).hostname)) return true;

  const expectedUser = process.env.FUNDFLOW_ADMIN_USER;
  const expectedPassword = process.env.FUNDFLOW_ADMIN_PASSWORD;
  if (!expectedUser || !expectedPassword) return false;

  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return false;

  try {
    const credentials = atob(header.slice(6));
    const separator = credentials.indexOf(':');
    if (separator < 0) return false;
    return (
      credentials.slice(0, separator) === expectedUser &&
      credentials.slice(separator + 1) === expectedPassword
    );
  } catch {
    return false;
  }
}

export function unauthorizedResponse() {
  const configured =
    Boolean(process.env.FUNDFLOW_ADMIN_USER) &&
    Boolean(process.env.FUNDFLOW_ADMIN_PASSWORD);

  return new Response(configured ? 'Authentication required' : 'FundFlow admin access is not configured', {
    status: configured ? 401 : 503,
    headers: configured
      ? { 'WWW-Authenticate': 'Basic realm="FundFlow Admin", charset="UTF-8"' }
      : undefined,
  });
}
