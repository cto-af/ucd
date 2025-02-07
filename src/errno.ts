export function isErrno(e: unknown): e is NodeJS.ErrnoException {
  return (e instanceof Error) &&
    Object.prototype.hasOwnProperty.call(e, 'code');
}

export function errCode(e: unknown, code: string): boolean {
  return isErrno(e) && (e.code === code);
}
