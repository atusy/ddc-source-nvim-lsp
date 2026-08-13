export function isClientAllowed(
  name: string,
  allowedServers: string[] | null,
  _deniedServers: string[] | null,
): boolean {
  return allowedServers === null || allowedServers.includes(name);
}
