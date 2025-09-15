// Removed proxy. Keeping file present to avoid 404s during transition.
export const dynamic = "force-dynamic"

export async function POST() {
  return new Response("Proxy removed. Call the backend directly from the client.", { status: 410 })
}
