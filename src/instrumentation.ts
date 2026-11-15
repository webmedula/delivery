// Roda uma vez quando o servidor do Next sobe.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { startDemoResetJob } = await import("./demo-reset-job");
  startDemoResetJob();
}
