// Optional access gate. If ACCESS_PASSWORD is set (a real client deployment), the
// dashboard's read and write endpoints require a matching token in the x-access header.
// If it is unset (the public demo), everything is open. This lets one codebase serve
// both a viewable showcase and a locked-down client instance.
export function authRequired() {
  return !!process.env.ACCESS_PASSWORD;
}

export function checkAuth(req) {
  if (!authRequired()) return true;
  const given = req.headers?.['x-access'] || (req.query && req.query.access) || '';
  return given && given === process.env.ACCESS_PASSWORD;
}
