import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Campus Task Sync",
    short_name: "Campus Sync",
    description: "Organize atividades, prazos e disciplinas do Campus Virtual no Notion.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7faf8",
    theme_color: "#166b5f",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
