export async function serverEnv():Promise<Record<string,string|undefined>> {
  try {
    const { env } = await import('cloudflare:workers');
    return env as unknown as Record<string,string|undefined>;
  } catch { return process.env; }
}
