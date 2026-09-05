import LinkedIn from "@/components/LinkedIn";
import { createFileRoute } from "@tanstack/react-router";
import { siGithub, siGmail } from "simple-icons";

export const Route = createFileRoute("/contact")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center h-full">
      <span className="font-normal tracking-wide text-2xl pb-2">Made by: </span>
      <div className="p-4 grid grid-cols-[auto_1fr] gap-4 border rounded-md shadow-2xl from-card  to-accent bg-linear-to-br ">
        <div>
          <img
            src="/ProfilePic.jpg"
            className="aspect-square rounded-md h-34"
          />
        </div>
        <div className="grid grid-cols-1 grid-rows-[1fr_auto]">
          <div>
            <span className="font-bold tracking-wide text-2xl">
              Ralph Luis B. Abejuela
            </span>
            <br />
            <a
              href="mailto:abejuela.ralph.balatucan@gmail.com"
              className="font-light hover:underline md:block hidden"
            >
              abejuela.ralph.balatucan@gmail.com
            </a>
            <a
              href="https://ralphabejuela.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-light hover:underline md:block hidden"
            >
              ralphabejuela.com
            </a>
            <p className="text-sm text-muted-foreground max-w-64 pt-1">
              Full-stack developer (BSIT, Cum Laude). I build tools that
              respect the people using them — like this tracker, where your
              data never leaves your device.
            </p>
          </div>
          <div className="flex gap-2 pt-4">
            <a
              href="https://ralphabejuela.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Portfolio website"
            >
              <svg
                viewBox="0 0 24 24"
                className="p-1 size-10 fill-current"
                aria-hidden="true"
              >
                <path d="M21.721 12.752a9.711 9.711 0 0 0-.945-5.003 12.754 12.754 0 0 1-4.339 2.708 18.991 18.991 0 0 1-.214 4.772 17.165 17.165 0 0 0 5.498-2.477ZM14.634 15.55a17.324 17.324 0 0 0 .332-4.647c-.952.227-1.945.347-2.966.347-1.021 0-2.014-.12-2.966-.347a17.515 17.515 0 0 0 .332 4.647 17.385 17.385 0 0 0 5.268 0ZM9.772 17.119a18.963 18.963 0 0 0 4.456 0A17.182 17.182 0 0 1 12 21.724a17.18 17.18 0 0 1-2.228-4.605ZM7.777 15.23a18.87 18.87 0 0 1-.214-4.774 12.753 12.753 0 0 1-4.34-2.708 9.711 9.711 0 0 0-.944 5.004 17.165 17.165 0 0 0 5.498 2.477ZM21.356 14.752a9.765 9.765 0 0 1-7.478 6.817 18.64 18.64 0 0 0 1.988-4.718 18.627 18.627 0 0 0 5.49-2.098ZM2.644 14.752c1.682.971 3.53 1.688 5.49 2.099a18.64 18.64 0 0 0 1.988 4.718 9.765 9.765 0 0 1-7.478-6.816ZM13.878 2.43a9.755 9.755 0 0 1 6.116 3.986 11.267 11.267 0 0 1-3.746 2.504 18.63 18.63 0 0 0-2.37-6.49ZM12 2.276a17.152 17.152 0 0 1 2.805 7.121c-.897.23-1.837.353-2.805.353-.968 0-1.908-.122-2.805-.353A17.151 17.151 0 0 1 12 2.276ZM10.122 2.43a18.629 18.629 0 0 0-2.37 6.49 11.266 11.266 0 0 1-3.746-2.504 9.754 9.754 0 0 1 6.116-3.985Z" />
              </svg>
            </a>
            <a
              href="https://linkedin.com/in/ralph-abejuela"
              target="_blank"
              rel="noopener noreferrer"
            >
              <LinkedIn className="size-10 fill-current" fill="" />
            </a>
            <a
              href="https://github.com/Ralph-Abejuela"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                viewBox="-2 -2 29 29"
                className="p-1 size-10 fill-current"
                aria-hidden="true"
              >
                <path d={siGithub.path} />
              </svg>
            </a>
            <a
              href="mailto:abejuela.ralph.balatucan@gmail.com"
              aria-label="Email"
            >
              <svg
                viewBox="0 0 24 24"
                className="p-1 size-10 fill-current"
                aria-hidden="true"
              >
                <path d={siGmail.path} />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
