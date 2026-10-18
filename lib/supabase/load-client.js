// Loads the browser Supabase client on first use. Pages that only touch Supabase
// inside an upload or save handler keep it out of their initial JavaScript.
export async function loadBrowserClient() {
  const { createClient } = await import("./client");
  return createClient();
}
