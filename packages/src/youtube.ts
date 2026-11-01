import { rurl, type ReadonlyURL } from "@lebedevna/readonly-url";

function parseUrl(url: string) {
  try {
    return rurl(url.startsWith("www.") ? `https://${url}` : url);
  } catch {
    return null;
  }
}

function isYoutubeUrl(url: ReadonlyURL) {
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }
  return (
    host === "youtu.be" ||
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube-nocookie.com")
  );
}

export function youtubeVideoId(url: string) {
  const parsedUrl = parseUrl(url);
  if (parsedUrl === null || !isYoutubeUrl(parsedUrl)) {
    return null;
  }

  const host = parsedUrl.hostname.toLowerCase();
  const id =
    host === "youtu.be"
      ? parsedUrl.pathname.split("/")[1]
      : (parsedUrl.searchParams.get("v") ??
        parsedUrl.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1]);
  return id || null;
}
