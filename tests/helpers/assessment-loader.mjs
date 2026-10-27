import fs from "node:fs/promises";
const root = new URL("../../", import.meta.url);
export async function resolve(specifier, context, next) {
  if (specifier === "server-only")
    return { url: "data:text/javascript,export {};", shortCircuit: true };
  if (specifier === "@/lib/supabase/admin")
    return {
      url: new URL("./assessment-mock.mjs", import.meta.url).href + "?admin",
      shortCircuit: true,
    };
  if (specifier === "@/lib/supabase/server")
    return {
      url: new URL("./assessment-mock.mjs", import.meta.url).href + "?session",
      shortCircuit: true,
    };
  if (specifier.startsWith("@/")) {
    let url = new URL(specifier.slice(2), root);
    if (!/\.(js|json)$/.test(url.pathname)) url = new URL(url.href + ".js");
    return { url: url.href, shortCircuit: true };
  }
  if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier))
    return next(specifier + ".js", context);
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.endsWith(".json"))
    return {
      format: "module",
      source: `export default ${await fs.readFile(new URL(url), "utf8")}`,
      shortCircuit: true,
    };
  return next(url, context);
}
