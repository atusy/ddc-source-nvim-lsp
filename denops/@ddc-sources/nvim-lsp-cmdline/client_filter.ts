export function isClientAllowed(
  name: string,
  allowedServers: string[] | null,
  deniedServers: string[] | null,
): boolean {
  return (allowedServers === null || allowedServers.includes(name)) &&
    !(deniedServers?.includes(name) ?? false);
}
