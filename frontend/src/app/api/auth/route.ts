export async function GET() {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="FWT Dashboard"',
    },
  });
}