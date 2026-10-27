export function createAdminClient() {
  return globalThis.__mcFixture.admin;
}
export async function createClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: globalThis.__mcFixture.user } }),
    },
  };
}
