export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_BASE_URL;
  const redirect = `${baseUrl}/api/auth/callback`;
  const url =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    new URLSearchParams({
      client_id: clientId || "",
      redirect_uri: redirect,
      response_type: "code",
      scope: "openid email profile",
      access_type: "online",
      prompt: "select_account",
    }).toString();

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-6">
      <div className="card max-w-md w-full text-center">
        <h1 className="text-2xl font-bold mb-2">📊 Control de Gastos</h1>
        <p className="text-slate-400 mb-6 text-sm">Acceso restringido a Diego.</p>
        <a
          href={url}
          className="inline-block bg-white text-slate-900 font-semibold px-5 py-3 rounded-lg hover:bg-slate-200 transition"
        >
          Entrar con Google
        </a>
        {searchParams.error && (
          <p className="text-red-400 text-sm mt-4">⚠️ {searchParams.error}</p>
        )}
      </div>
    </main>
  );
}
