import { z } from "zod";

export const SITE_ROOT = "/content/engie/fr/particuliers";
export const componentTypes = ["section", "hero", "text", "offer", "article", "faq", "cta", "image"] as const;
export const fragmentSchema = z.object({
  title: z.string(), description: z.string(), badge: z.string(),
  link: z.string(), linkLabel: z.string(), legal: z.string()
});
export type Component = {
  path: string;
  type: typeof componentTypes[number];
  title: string; text: string; eyebrow: string; linkLabel: string; link: string;
  image: string; imageAlt: string; theme: string; layout: string;
  fragmentPath?: string;
  fragmentError?: string;
  fragment?: z.infer<typeof fragmentSchema>;
  children?: Component[];
};
const componentSchema: z.ZodType<Component> = z.lazy(() => z.object({
  path: z.string().startsWith(`${SITE_ROOT}/jcr:content/`).or(z.string().regex(/^\/content\/engie\/fr\/particuliers\/[a-zA-Z0-9/_-]+\/jcr:content\//)),
  type: z.enum(componentTypes),
  title: z.string(), text: z.string(), eyebrow: z.string(), linkLabel: z.string(), link: z.string(),
  image: z.string(), imageAlt: z.string(), theme: z.string(), layout: z.string(),
  fragmentPath: z.string().optional(), fragmentError: z.string().optional(), fragment: fragmentSchema.optional(),
  children: z.array(componentSchema).optional()
}));
export const pageSchema = z.object({
  path: z.string(), title: z.string(), rootPath: z.string(),
  components: z.array(componentSchema)
});
export type Page = z.infer<typeof pageSchema>;

export function pagePath(segments: string[] = []): string | null {
  if (segments.length === 0) return SITE_ROOT;
  // AEM's opening mapping preserves the complete /content/... path.
  const prefix = SITE_ROOT.slice(1).split("/");
  const parts = segments[0] === "content" ? segments.slice(prefix.length) : segments;
  if (segments[0] === "content" && prefix.some((part, i) => segments[i] !== part)) return null;
  if (parts.some(part => !/^[a-zA-Z0-9_-]+$/.test(part))) return null;
  return `${SITE_ROOT}${parts.length ? `/${parts.join("/")}` : ""}`;
}

export function safeLink(value: string): string | undefined {
  const trimmed = value.trim();
  if (/[\u0000-\u0020\\]/.test(trimmed)) return undefined;
  if (/^(\/(?!\/)|#|https:\/\/|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return undefined;
}

export type LinkCarry = { name: string; value: string };

export function localLink(value: string, carry?: LinkCarry): string | undefined {
  const link = safeLink(value);
  if (!link) return undefined;
  if (!link.startsWith(SITE_ROOT) || !new RegExp(`^${SITE_ROOT}(?:/|[?#]|$)`).test(link)) return link;
  const url = new URL(link, "https://routing.invalid");
  if (carry) url.searchParams.set(carry.name, carry.value);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function damImage(path: string, origin: string): string | undefined {
  if (!path.startsWith("/content/dam/engie/") || path.includes("..") || /[%\\?#\u0000-\u0020]/.test(path)) return undefined;
  return new URL(path, origin).href;
}
