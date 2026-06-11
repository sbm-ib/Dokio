export default function handler(req: any, res: any): void {
  res.status(200).json({
    ok: true,
    node: process.version,
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    ts: new Date().toISOString(),
  })
}
