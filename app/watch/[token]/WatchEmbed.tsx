"use client";

type Props = {
  title: string;
  previewSrc: string;
  openInDriveUrl: string;
  downloadUrl: string;
};

export default function WatchEmbed({ title, previewSrc, openInDriveUrl, downloadUrl }: Props) {
  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
        <p className="font-medium text-amber-200">In-page player uses Google Drive</p>
        <p className="mt-1 text-amber-100/80">
          Large or newly uploaded videos often show &quot;still being processed&quot; in the embed for a few
          minutes. Use <strong>Open in Google Drive</strong> to watch in a full tab, or{" "}
          <strong>Download</strong> to save the file and play locally.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <a
          href={openInDriveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
        >
          Open in Google Drive
        </a>
        <a
          href={downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
        >
          Download lecture
        </a>
      </div>

      <div className="aspect-video overflow-hidden rounded-xl border border-zinc-800 bg-black">
        <iframe
          src={previewSrc}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="h-full w-full"
          title={title}
        />
      </div>
    </div>
  );
}
